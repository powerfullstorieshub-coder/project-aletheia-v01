import { Router, type IRouter, type Request, type Response } from "express";
import {
  CreateAiChatCompletionBody,
  type AiChatErrorCode,
} from "@workspace/api-zod";
import {
  AiProviderError,
  createAiProviderManager,
} from "../../lib/ai-providers";

const router: IRouter = Router();
const MAX_MESSAGES = 50;
const MAX_MESSAGE_BYTES = 100_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_REQUESTS = 60;
const MAX_TRACKED_ADDRESSES = 10_000;
const requestsByAddress = new Map<string, { count: number; resetAt: number }>();

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

const errorMessages: Record<AiChatErrorCode, string> = {
  INVALID_JSON: "The request body must contain valid JSON.",
  PAYLOAD_TOO_LARGE: "The conversation is too long. Start a new chat and try again.",
  INTERNAL_SERVER_ERROR: "An unexpected server error occurred.",
  AI_NOT_CONFIGURED: "Live AI is not configured on this server.",
  AI_INVALID_REQUEST: "The chat request is invalid. Please try again.",
  AI_ORIGIN_REJECTED: "This chat request came from an untrusted page.",
  AI_RATE_LIMITED: "The AI provider is receiving too many requests. Wait a moment and try again.",
  AI_AUTHENTICATION_FAILED: "Live AI authentication failed. Check the configured provider credentials.",
  AI_QUOTA_EXHAUSTED: "The AI provider quota or key budget is exhausted.",
  AI_UNSUPPORTED_MODEL: "The configured AI model is unavailable or unsupported.",
  AI_PROVIDER_UNAVAILABLE: "The AI provider is temporarily unavailable. Please try again.",
  AI_NETWORK_ERROR: "The AI provider could not be reached. Please try again.",
  AI_TIMEOUT: "The AI provider timed out. Please try again.",
  AI_INVALID_RESPONSE: "The AI provider returned an invalid response. Please try again.",
};

const sendError = (
  res: Response,
  status: number,
  code: AiChatErrorCode,
  retryAfterMs?: number,
): void => {
  if (code === "AI_RATE_LIMITED" && retryAfterMs !== undefined) {
    res.setHeader("Retry-After", String(Math.ceil(retryAfterMs / 1_000)));
  }
  res.status(status).json({
    error: {
      code,
      message: errorMessages[code],
    },
  });
};

const isChatMessages = (value: unknown): value is ChatMessage[] => {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_MESSAGES) {
    return false;
  }

  let totalBytes = 0;
  let hasUserMessage = false;

  for (const message of value) {
    if (
      message === null
      || typeof message !== "object"
      || Object.keys(message).length !== 2
      || !Object.hasOwn(message, "role")
      || !Object.hasOwn(message, "content")
      || !["system", "user", "assistant"].includes(message.role)
      || typeof message.content !== "string"
      || message.content.trim().length === 0
    ) {
      return false;
    }

    totalBytes += Buffer.byteLength(message.content, "utf8");
    if (totalBytes > MAX_MESSAGE_BYTES) return false;
    if (message.role === "user") hasUserMessage = true;
  }

  return hasUserMessage && value.at(-1)?.role === "user";
};

const isAllowedRequestOrigin = (req: Request): boolean => {
  const origin = req.get("origin");
  if (!origin) return true;

  try {
    return new URL(origin).host === req.get("host");
  } catch {
    return false;
  }
};

const isRateLimited = (address: string): boolean => {
  const now = Date.now();
  const current = requestsByAddress.get(address);

  if (!current || current.resetAt <= now) {
    if (!current && requestsByAddress.size >= MAX_TRACKED_ADDRESSES) {
      for (const [key, value] of requestsByAddress) {
        if (value.resetAt <= now) requestsByAddress.delete(key);
      }
      if (requestsByAddress.size >= MAX_TRACKED_ADDRESSES) return true;
    }
    requestsByAddress.set(address, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return false;
  }

  current.count += 1;
  return current.count > RATE_LIMIT_REQUESTS;
};

const mapProviderError = (error: AiProviderError): {
  status: number;
  code: AiChatErrorCode;
} => {
  switch (error.code) {
    case "not_configured":
      return { status: 503, code: "AI_NOT_CONFIGURED" };
    case "invalid_request":
      return { status: 400, code: "AI_INVALID_REQUEST" };
    case "authentication":
      return { status: 502, code: "AI_AUTHENTICATION_FAILED" };
    case "quota_exhausted":
      return { status: 402, code: "AI_QUOTA_EXHAUSTED" };
    case "unsupported_model":
      return { status: 502, code: "AI_UNSUPPORTED_MODEL" };
    case "rate_limited":
      return { status: 429, code: "AI_RATE_LIMITED" };
    case "provider_unavailable":
      return { status: 503, code: "AI_PROVIDER_UNAVAILABLE" };
    case "network_error":
      return { status: 502, code: "AI_NETWORK_ERROR" };
    case "timeout":
      return { status: 504, code: "AI_TIMEOUT" };
    case "invalid_response":
      return { status: 502, code: "AI_INVALID_RESPONSE" };
    case "cancelled":
      return { status: 499, code: "AI_PROVIDER_UNAVAILABLE" };
  }
};

const writeChunk = async (
  res: Response,
  chunk: string,
  signal: AbortSignal,
): Promise<void> => {
  if (res.destroyed) return;
  if (res.write(chunk)) return;

  await new Promise<void>((resolve, reject) => {
    const cleanup = (): void => {
      res.off("drain", onDrain);
      res.off("close", onClose);
      signal.removeEventListener("abort", onAbort);
    };
    const onDrain = (): void => {
      cleanup();
      resolve();
    };
    const onClose = (): void => {
      cleanup();
      reject(new Error("Client disconnected."));
    };
    const onAbort = (): void => {
      cleanup();
      reject(new Error("Upstream request aborted."));
    };

    res.once("drain", onDrain);
    res.once("close", onClose);
    signal.addEventListener("abort", onAbort, { once: true });
  });
};

const writeStreamError = (
  res: Response,
  code: AiChatErrorCode,
): void => {
  if (res.destroyed || res.writableEnded) return;
  res.write(`data: ${JSON.stringify({ error: { code, message: errorMessages[code] } })}\n\n`);
};

router.post("/ai/chat", async (req: Request, res: Response): Promise<void> => {
  if (!req.is("application/json")) {
    sendError(res, 415, "AI_INVALID_REQUEST");
    return;
  }

  const body = req.body as { messages?: unknown } | null;
  const hasOnlyMessages =
    body !== null
    && typeof body === "object"
    && !Array.isArray(body)
    && Object.keys(body).length === 1
    && Object.hasOwn(body, "messages");

  const parsedBody = CreateAiChatCompletionBody.safeParse(req.body);
  if (!hasOnlyMessages || !parsedBody.success || !isChatMessages(parsedBody.data.messages)) {
    sendError(res, 400, "AI_INVALID_REQUEST");
    return;
  }

  if (!isAllowedRequestOrigin(req)) {
    sendError(res, 403, "AI_ORIGIN_REJECTED");
    return;
  }

  const address = req.ip || "unknown";
  if (isRateLimited(address)) {
    sendError(res, 429, "AI_RATE_LIMITED");
    return;
  }

  const messages = parsedBody.data.messages as ChatMessage[];
  const controller = new AbortController();
  let clientDisconnected = false;

  const onClientClose = (): void => {
    if (!res.writableEnded) {
      clientDisconnected = true;
      controller.abort();
    }
  };
  res.once("close", onClientClose);

  try {
    const completion = await createAiProviderManager().complete({
      messages,
      signal: controller.signal,
    });
    if (clientDisconnected) return;

    req.log.info(
      {
        providerId: completion.providerId,
        model: completion.model,
        usedFallback: completion.usedFallback,
      },
      "AI provider selected",
    );

    if (completion.kind === "text") {
      res.status(200).json({
        choices: [{
          message: { role: "assistant", content: completion.text },
        }],
      });
      return;
    }

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    let receivedText = false;
    try {
      for await (const chunk of completion.stream) {
        if (clientDisconnected) return;
        if (!chunk.text) continue;
        receivedText = true;
        await writeChunk(
          res,
          `data: ${JSON.stringify({
            choices: [{
              index: 0,
              delta: { content: chunk.text },
              finish_reason: null,
            }],
          })}\n\n`,
          controller.signal,
        );
      }

      if (!receivedText) {
        writeStreamError(res, "AI_INVALID_RESPONSE");
        return;
      }
      await writeChunk(res, "data: [DONE]\n\n", controller.signal);
    } catch (error) {
      if (clientDisconnected || controller.signal.aborted) return;
      const providerError = error instanceof AiProviderError
        ? error
        : new AiProviderError("network_error", completion.providerId);
      const mapped = mapProviderError(providerError);
      req.log.warn(
        {
          providerId: providerError.providerId,
          model: completion.model,
          code: mapped.code,
        },
        "AI provider stream failed",
      );
      writeStreamError(res, mapped.code);
    } finally {
      if (!res.destroyed && !res.writableEnded) res.end();
    }
  } catch (error) {
    if (
      clientDisconnected
      || controller.signal.aborted
      || (error instanceof AiProviderError && error.code === "cancelled")
    ) {
      return;
    }
    const providerError = error instanceof AiProviderError
      ? error
      : new AiProviderError("provider_unavailable", "unknown");
    const mapped = mapProviderError(providerError);
    req.log.warn(
      {
        providerId: providerError.providerId,
        code: mapped.code,
        upstreamStatus: providerError.upstreamStatus,
      },
      "AI provider request failed",
    );
    sendError(res, mapped.status, mapped.code, providerError.retryAfterMs);
  } finally {
    res.off("close", onClientClose);
  }
});

export default router;
