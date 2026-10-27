import type { AiProviderErrorCode } from "./types";

export const DEFAULT_AI_PROVIDER_ID = "pollinations";
export const DEFAULT_POLLINATIONS_MODEL = "openai/gpt-5.4-nano";
export const DEFAULT_AI_PROVIDER_TIMEOUT_MS = 90_000;
export const MAX_AI_PROVIDER_TIMEOUT_MS = 120_000;

export type AiProviderRuntimeSettings = {
  enabled: boolean;
  model: string;
  timeoutMs: number;
};

export type AiProviderManagerConfig = {
  primaryProviderId: string;
  fallbackProviderIds: readonly string[];
  fallbackOn: readonly AiProviderErrorCode[];
  allowSensitiveFallbackData: boolean;
  providers: Readonly<Record<string, AiProviderRuntimeSettings>>;
};

const ELIGIBLE_FALLBACK_ERRORS: readonly AiProviderErrorCode[] = [
  "network_error",
  "timeout",
  "provider_unavailable",
];

const parseTimeout = (value: string | undefined): number | null => {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return null;
  return Math.min(Math.floor(parsed), MAX_AI_PROVIDER_TIMEOUT_MS);
};

const parseProviderIds = (value: string | undefined): string[] => {
  if (!value) return [];
  return [...new Set(
    value
      .split(",")
      .map((id) => id.trim().toLowerCase())
      .filter((id) => /^[a-z0-9][a-z0-9_-]*$/.test(id)),
  )];
};

const parseFallbackErrors = (
  value: string | undefined,
): AiProviderErrorCode[] => {
  if (value === undefined) return [...ELIGIBLE_FALLBACK_ERRORS];
  const selected = new Set(
    value
      .split(",")
      .map((code) => code.trim())
      .filter((code): code is AiProviderErrorCode =>
        ELIGIBLE_FALLBACK_ERRORS.includes(code as AiProviderErrorCode),
      ),
  );
  return ELIGIBLE_FALLBACK_ERRORS.filter((code) => selected.has(code));
};

export const readAiProviderManagerConfig = (
  env: NodeJS.ProcessEnv = process.env,
): AiProviderManagerConfig => {
  const timeoutMs =
    parseTimeout(env.AI_PROVIDER_TIMEOUT_MS)
    ?? parseTimeout(env.POLLINATIONS_TIMEOUT_MS)
    ?? DEFAULT_AI_PROVIDER_TIMEOUT_MS;

  return {
    primaryProviderId:
      env.AI_PRIMARY_PROVIDER?.trim().toLowerCase() || DEFAULT_AI_PROVIDER_ID,
    fallbackProviderIds: parseProviderIds(env.AI_FALLBACK_PROVIDERS),
    fallbackOn: parseFallbackErrors(env.AI_FALLBACK_ON),
    // Treat the full conversation, including its system message, as sensitive.
    // Sending it to any fallback requires this explicit server-side opt-in.
    allowSensitiveFallbackData:
      env.AI_FALLBACK_ALLOW_SENSITIVE_DATA?.trim().toLowerCase() === "true",
    providers: {
      pollinations: {
        enabled: env.POLLINATIONS_ENABLED?.trim().toLowerCase() !== "false",
        model: env.POLLINATIONS_MODEL?.trim() || DEFAULT_POLLINATIONS_MODEL,
        timeoutMs,
      },
    },
  };
};
