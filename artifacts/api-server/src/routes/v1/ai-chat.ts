import { Router, type IRouter, type Request, type Response } from "express";
import {
  CreateAiChatCompletionBody,
  type AiChatErrorCode,
} from "@workspace/api-zod";

const router: IRouter = Router();
const POLLINATIONS_URL = "https://gen.pollinations.ai/v1/chat/completions";
const MODEL = "openai/gpt-5.4-nano";
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
  AI_AUTHENTICATION_FAILED: "Live AI authentication failed. Check the server's Pollinations key.",
  AI_QUOTA_EXHAUSTED: "The AI provider quota or key budget is exhausted. Check the Pollinations account balance.",
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
): void => {
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

const timeoutFromEnvironment = (): number => {
  const configured = Number.parseInt(process.env.POLLINATIONS_TIMEOUT_MS ?? "", 10);
  if (!Number.isFinite(configured) || configured < 1) return 90_000;
  return Math.min(configured, 120_000);
};

const retryDelay = (response: globalThis.Response): number | null => {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    const dateDelay = Number.isNaN(seconds)
      ? Date.parse(retryAfter) - Date.now()
      : seconds * 1_000;
    if (Number.isFinite(dateDelay) && dateDelay >= 0) {
      return dateDelay <= 1_000 ? dateDelay : null;
    }
  }

  return response.status === 429 ? null : 250;
};

const isRetryableStatus = (status: number): boolean =>
  status === 429 || status >= 500;

const mapProviderStatus = (status: number): {
  status: number;
  code: AiChatErrorCode;
} => {
  if (status === 401 || status === 403) {
    return { status: 502, code: "AI_AUTHENTICATION_FAILED" };
  }
  if (status === 402) {
    return { status: 402, code: "AI_QUOTA_EXHAUSTED" };
  }
  if (status === 429) {
    return { status: 429, code: "AI_RATE_LIMITED" };
  }
  if (status === 400 || status === 404) {
    return { status: 502, code: "AI_UNSUPPORTED_MODEL" };
  }
  return { status: 503, code: "AI_PROVIDER_UNAVAILABLE" };
};

const isChatCompletion = (value: unknown): boolean => {
  if (!value || typeof value !== "object") return false;
  const choices = (value as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return false;
  const first = choices[0] as { message?: { content?: unknown } } | undefined;
  return typeof first?.message?.content === "string"
    && first.message.content.trim().length > 0;
};

const validateSseData = (
  line: string,
): { valid: boolean; done: boolean; error: boolean; hasText: boolean } => {
  if (!line.startsWith("data:")) {
    return { valid: true, done: false, error: false, hasText: false };
  }
  const data = line.slice(5).trim();
  if (!data) return { valid: true, done: false, error: false, hasText: false };
  if (data === "[DONE]") {
    return { valid: true, done: true, error: false, hasText: false };
  }

  try {
    const payload = JSON.parse(data) as {
      error?: unknown;
      choices?: unknown;
    };
    if (payload.error) {
      return { valid: true, done: false, error: true, hasText: false };
    }
    const choices = Array.isArray(payload.choices) ? payload.choices : [];
    return {
      valid: Array.isArray(payload.choices),
      done: false,
      error: false,
      hasText: choices.some((choice) => {
        if (!choice || typeof choice !== "object") return false;
        const delta = (choice as { delta?: { content?: unknown } }).delta;
        return typeof delta?.content === "string" && delta.content.length > 0;
      }),
    };
  } catch {
    return { valid: false, done: false, error: false, hasText: false };
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

const streamCompletion = async (
  upstream: globalThis.Response,
  res: Response,
  signal: AbortSignal,
): Promise<AiChatErrorCode | null> => {
  if (!upstream.body) return "AI_INVALID_RESPONSE";

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let doneReceived = false;
  let receivedText = false;
  let failure: AiChatErrorCode | null = null;

  const forwardLine = async (rawLine: string): Promise<void> => {
    const line = rawLine.replace(/\r?\n$/, "");
    const checked = validateSseData(line);
    if (!checked.valid) {
      failure = "AI_INVALID_RESPONSE";
      return;
    }
    if (checked.error) {
      failure = "AI_PROVIDER_UNAVAILABLE";
      return;
    }
    if (checked.done) doneReceived = true;
    if (checked.hasText) receivedText = true;
    await writeChunk(res, rawLine, signal);
  };

  try {
    while (!failure) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex !== -1 && !failure) {
        const rawLine = buffer.slice(0, newlineIndex + 1);
        buffer = buffer.slice(newlineIndex + 1);
        await forwardLine(rawLine);
        newlineIndex = buffer.indexOf("\n");
      }
    }

    if (!failure) {
      buffer += decoder.decode();
      if (buffer) await forwardLine(buffer);
      if (!failure && (!doneReceived || !receivedText)) {
        failure = "AI_INVALID_RESPONSE";
      }
    }
  } catch {
    failure = signal.aborted ? "AI_TIMEOUT" : "AI_NETWORK_ERROR";
  } finally {
    if (failure) {
      await reader.cancel().catch(() => undefined);
      writeStreamError(res, failure);
    }
    if (!res.destroyed && !res.writableEnded) res.end();
    reader.releaseLock();
  }

  return failure;
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

  const apiKey = process.env.POLLINATIONS_KEY;
  if (!apiKey) {
    sendError(res, 503, "AI_NOT_CONFIGURED");
    return;
  }

  const messages = parsedBody.data.messages as ChatMessage[];
  const controller = new AbortController();
  let clientDisconnected = false;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutFromEnvironment());

  const onClientClose = (): void => {
    if (!res.writableEnded) {
      clientDisconnected = true;
      controller.abort();
    }
  };
  res.once("close", onClientClose);

  try {
    let upstream: globalThis.Response | null = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        upstream = await fetch(POLLINATIONS_URL, {
          method: "POST",
          headers: {
            Accept: "text/event-stream",
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: MODEL,
            messages,
            stream: true,
          }),
          signal: controller.signal,
        });
      } catch {
        if (clientDisconnected) return;
        if (timedOut) {
          sendError(res, 504, "AI_TIMEOUT");
          return;
        }
        if (attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 250));
          continue;
        }
        req.log.warn({ code: "AI_NETWORK_ERROR" }, "Pollinations request failed");
        sendError(res, 502, "AI_NETWORK_ERROR");
        return;
      }

      if (upstream.ok) break;

      const delay = isRetryableStatus(upstream.status)
        ? retryDelay(upstream)
        : null;
      if (attempt === 0 && delay !== null) {
        await upstream.body?.cancel().catch(() => undefined);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      const mapped = mapProviderStatus(upstream.status);
      req.log.warn(
        { code: mapped.code, providerStatus: upstream.status },
        "Pollinations returned an error",
      );
      await upstream.body?.cancel().catch(() => undefined);
      sendError(res, mapped.status, mapped.code);
      return;
    }

    if (!upstream?.ok) {
      sendError(res, 503, "AI_PROVIDER_UNAVAILABLE");
      return;
    }

    const contentType = upstream.headers.get("content-type")?.toLowerCase() ?? "";
    if (contentType.includes("application/json")) {
      let payload: unknown;
      try {
        payload = await upstream.json();
      } catch {
        sendError(res, 502, "AI_INVALID_RESPONSE");
        return;
      }
      if (!isChatCompletion(payload)) {
        sendError(res, 502, "AI_INVALID_RESPONSE");
        return;
      }
      res.status(200).json(payload);
      return;
    }

    if (!contentType.includes("text/event-stream")) {
      await upstream.body?.cancel().catch(() => undefined);
      sendError(res, 502, "AI_INVALID_RESPONSE");
      return;
    }

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    await streamCompletion(upstream, res, controller.signal);
  } finally {
    clearTimeout(timeout);
    res.off("close", onClientClose);
  }
});

export default router;
