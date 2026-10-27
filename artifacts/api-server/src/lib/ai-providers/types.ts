export type AiProviderErrorCode =
  | "not_configured"
  | "invalid_request"
  | "authentication"
  | "quota_exhausted"
  | "unsupported_model"
  | "rate_limited"
  | "provider_unavailable"
  | "network_error"
  | "timeout"
  | "invalid_response"
  | "cancelled";

export type AiProviderMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AiProviderParameterValue = string | number | boolean;
export type AiProviderParameters = Readonly<
  Record<string, AiProviderParameterValue>
>;

export type AiProviderChunk = {
  text: string;
};

export type AiProviderCapabilities = {
  models: readonly string[];
  parameters: readonly string[];
  supportsStreaming: boolean;
};

export type AiProviderRequest = {
  messages: readonly AiProviderMessage[];
  model: string;
  parameters?: AiProviderParameters;
  signal: AbortSignal;
};

export type AiProviderCompletion =
  | {
      kind: "text";
      text: string;
      model: string;
    }
  | {
      kind: "stream";
      stream: AsyncIterable<AiProviderChunk>;
      model: string;
    };

export type ManagedAiCompletion = AiProviderCompletion & {
  providerId: string;
  usedFallback: boolean;
};

export interface AiProvider {
  readonly id: string;
  readonly capabilities: AiProviderCapabilities;
  isConfigured(): boolean;
  complete(request: AiProviderRequest): Promise<AiProviderCompletion>;
}

export class AiProviderError extends Error {
  readonly code: AiProviderErrorCode;
  readonly providerId: string;
  readonly upstreamStatus?: number;
  readonly retryAfterMs?: number;

  constructor(
    code: AiProviderErrorCode,
    providerId: string,
    options: { upstreamStatus?: number; retryAfterMs?: number } = {},
  ) {
    super(`AI provider request failed (${code}).`);
    this.name = "AiProviderError";
    this.code = code;
    this.providerId = providerId;
    this.upstreamStatus = options.upstreamStatus;
    this.retryAfterMs = options.retryAfterMs;
  }
}
