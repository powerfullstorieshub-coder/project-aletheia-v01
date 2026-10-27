import {
  DEFAULT_POLLINATIONS_MODEL,
} from "./config";
import {
  AiProviderError,
  type AiProvider,
  type AiProviderCapabilities,
  type AiProviderChunk,
  type AiProviderRequest,
} from "./types";

export const POLLINATIONS_PROVIDER_ID = "pollinations";
const POLLINATIONS_URL = "https://gen.pollinations.ai/v1/chat/completions";

const capabilities: AiProviderCapabilities = {
  models: [DEFAULT_POLLINATIONS_MODEL],
  parameters: [],
  supportsStreaming: true,
};

const readRetryAfterMs = (response: Response): number | null => {
  const retryAfter = response.headers.get("retry-after");
  if (!retryAfter) return null;
  const seconds = Number(retryAfter);
  const delay = Number.isNaN(seconds)
    ? Date.parse(retryAfter) - Date.now()
    : seconds * 1_000;
  return Number.isFinite(delay) && delay >= 0 ? delay : null;
};

const retryDelay = (response: Response): number | null => {
  const retryAfterMs = readRetryAfterMs(response);
  if (retryAfterMs !== null) return retryAfterMs <= 1_000 ? retryAfterMs : null;
  return response.status === 429 ? null : 250;
};

const isRetryableStatus = (status: number): boolean =>
  status === 429 || status >= 500;

const wait = (delayMs: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? new DOMException("Request aborted.", "AbortError"));
      return;
    }

    const finish = (): void => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    };
    const timer = setTimeout(finish, delayMs);
    const onAbort = (): void => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      reject(signal.reason ?? new DOMException("Request aborted.", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });

const errorForStatus = (response: Response): AiProviderError => {
  const status = response.status;
  const retryAfterMs = readRetryAfterMs(response) ?? undefined;
  if (status === 401 || status === 403) {
    return new AiProviderError("authentication", POLLINATIONS_PROVIDER_ID, {
      upstreamStatus: status,
    });
  }
  if (status === 402) {
    return new AiProviderError("quota_exhausted", POLLINATIONS_PROVIDER_ID, {
      upstreamStatus: status,
    });
  }
  if (status === 429) {
    return new AiProviderError("rate_limited", POLLINATIONS_PROVIDER_ID, {
      upstreamStatus: status,
      retryAfterMs,
    });
  }
  if (status === 400 || status === 404) {
    return new AiProviderError("unsupported_model", POLLINATIONS_PROVIDER_ID, {
      upstreamStatus: status,
    });
  }
  return new AiProviderError("provider_unavailable", POLLINATIONS_PROVIDER_ID, {
    upstreamStatus: status,
    retryAfterMs,
  });
};

type ParsedEvent = { done: boolean; text: string[] };

const parseEventLine = (line: string): ParsedEvent => {
  const normalizedLine = line.replace(/\r$/, "");
  if (!normalizedLine.startsWith("data:")) return { done: false, text: [] };
  const data = normalizedLine.slice(5).trim();
  if (!data) return { done: false, text: [] };
  if (data === "[DONE]") return { done: true, text: [] };

  let payload: unknown;
  try {
    payload = JSON.parse(data);
  } catch {
    throw new AiProviderError("invalid_response", POLLINATIONS_PROVIDER_ID);
  }

  if (!payload || typeof payload !== "object") {
    throw new AiProviderError("invalid_response", POLLINATIONS_PROVIDER_ID);
  }
  const providerPayload = payload as { error?: unknown; choices?: unknown };
  if (providerPayload.error) {
    throw new AiProviderError("provider_unavailable", POLLINATIONS_PROVIDER_ID);
  }
  if (!Array.isArray(providerPayload.choices)) {
    throw new AiProviderError("invalid_response", POLLINATIONS_PROVIDER_ID);
  }

  const text: string[] = [];
  for (const choice of providerPayload.choices) {
    if (!choice || typeof choice !== "object") continue;
    const delta = (choice as { delta?: unknown }).delta;
    if (!delta || typeof delta !== "object") continue;
    const content = (delta as { content?: unknown }).content;
    if (typeof content === "string" && content.length > 0) text.push(content);
  }
  return { done: false, text };
};

const streamText = async function* (
  response: Response,
  signal: AbortSignal,
): AsyncIterable<AiProviderChunk> {
  if (!response.body) {
    throw new AiProviderError("invalid_response", POLLINATIONS_PROVIDER_ID);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let doneReceived = false;
  let receivedText = false;

  try {
    readLoop: while (true) {
      const { value, done } = await reader.read();
      if (signal.aborted) {
        throw signal.reason ?? new DOMException("Request aborted.", "AbortError");
      }
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        const parsed = parseEventLine(line);
        if (parsed.done) {
          doneReceived = true;
          break readLoop;
        }
        for (const text of parsed.text) {
          receivedText = true;
          yield { text };
        }
        newlineIndex = buffer.indexOf("\n");
      }
    }

    buffer += decoder.decode();
    if (!doneReceived && buffer) {
      const parsed = parseEventLine(buffer);
      if (parsed.done) {
        doneReceived = true;
      } else {
        for (const text of parsed.text) {
          receivedText = true;
          yield { text };
        }
      }
    }

    if (!doneReceived || !receivedText) {
      throw new AiProviderError("invalid_response", POLLINATIONS_PROVIDER_ID);
    }
  } catch (error) {
    if (error instanceof AiProviderError || signal.aborted) throw error;
    throw new AiProviderError("network_error", POLLINATIONS_PROVIDER_ID);
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
};

const isChatCompletion = (value: unknown): value is {
  choices: Array<{ message?: { content?: unknown } }>;
} => {
  if (!value || typeof value !== "object") return false;
  const choices = (value as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return false;
  const first = choices[0] as { message?: { content?: unknown } } | undefined;
  return typeof first?.message?.content === "string"
    && first.message.content.trim().length > 0;
};

export class PollinationsProvider implements AiProvider {
  readonly id = POLLINATIONS_PROVIDER_ID;
  readonly capabilities = capabilities;

  isConfigured(): boolean {
    return Boolean(process.env.POLLINATIONS_KEY?.trim());
  }

  async complete(request: AiProviderRequest) {
    if (!this.isConfigured()) {
      throw new AiProviderError("not_configured", this.id);
    }
    if (!this.capabilities.models.includes(request.model)) {
      throw new AiProviderError("unsupported_model", this.id);
    }
    if (request.parameters && Object.keys(request.parameters).length > 0) {
      throw new AiProviderError("invalid_request", this.id);
    }

    const apiKey = process.env.POLLINATIONS_KEY?.trim();
    if (!apiKey) throw new AiProviderError("not_configured", this.id);

    let upstream: Response | null = null;
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
            model: request.model,
            messages: request.messages,
            stream: true,
          }),
          signal: request.signal,
        });
      } catch (error) {
        if (request.signal.aborted) throw error;
        if (attempt === 0) {
          await wait(250, request.signal);
          continue;
        }
        throw new AiProviderError("network_error", this.id);
      }

      if (upstream.ok) break;

      const delay = isRetryableStatus(upstream.status)
        ? retryDelay(upstream)
        : null;
      if (attempt === 0 && delay !== null) {
        await upstream.body?.cancel().catch(() => undefined);
        await wait(delay, request.signal);
        continue;
      }

      await upstream.body?.cancel().catch(() => undefined);
      throw errorForStatus(upstream);
    }

    if (!upstream?.ok) {
      throw new AiProviderError("provider_unavailable", this.id);
    }

    const contentType =
      upstream.headers.get("content-type")?.toLowerCase() ?? "";
    if (contentType.includes("application/json")) {
      let payload: unknown;
      try {
        payload = await upstream.json();
      } catch (error) {
        if (request.signal.aborted) throw error;
        throw new AiProviderError("invalid_response", this.id);
      }
      if (!isChatCompletion(payload)) {
        throw new AiProviderError("invalid_response", this.id);
      }
      return {
        kind: "text" as const,
        text: payload.choices[0].message?.content as string,
        model: request.model,
      };
    }

    if (!contentType.includes("text/event-stream")) {
      await upstream.body?.cancel().catch(() => undefined);
      throw new AiProviderError("invalid_response", this.id);
    }

    return {
      kind: "stream" as const,
      stream: streamText(upstream, request.signal),
      model: request.model,
    };
  }
}
