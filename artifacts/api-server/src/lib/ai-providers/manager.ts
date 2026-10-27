import type { AiProviderManagerConfig } from "./config";
import {
  AiProviderError,
  type AiProvider,
  type AiProviderCompletion,
  type AiProviderErrorCode,
  type AiProviderMessage,
  type AiProviderParameters,
  type ManagedAiCompletion,
} from "./types";

type AttemptScope = {
  readonly signal: AbortSignal;
  readonly timedOut: boolean;
  run<T>(operation: () => Promise<T>): Promise<T>;
  error(providerId: string): AiProviderError;
  cleanup(): void;
};

const createAttemptScope = (
  parentSignal: AbortSignal | undefined,
  timeoutMs: number,
): AttemptScope => {
  const controller = new AbortController();
  let didTimeOut = false;
  const onParentAbort = (): void => controller.abort();

  if (parentSignal?.aborted) {
    controller.abort();
  } else {
    parentSignal?.addEventListener("abort", onParentAbort, { once: true });
  }

  const timer = setTimeout(() => {
    didTimeOut = true;
    controller.abort();
  }, timeoutMs);

  const error = (providerId: string): AiProviderError =>
    new AiProviderError(didTimeOut ? "timeout" : "cancelled", providerId);

  const run = <T>(operation: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      if (controller.signal.aborted) {
        reject(error(""));
        return;
      }

      let settled = false;
      const onAbort = (): void => {
        if (settled) return;
        settled = true;
        controller.signal.removeEventListener("abort", onAbort);
        reject(error(""));
      };

      controller.signal.addEventListener("abort", onAbort, { once: true });
      Promise.resolve()
        .then(operation)
        .then(
          (value) => {
            if (settled) return;
            settled = true;
            controller.signal.removeEventListener("abort", onAbort);
            resolve(value);
          },
          (reason: unknown) => {
            if (settled) return;
            settled = true;
            controller.signal.removeEventListener("abort", onAbort);
            reject(reason);
          },
        );
    });

  return {
    signal: controller.signal,
    get timedOut() {
      return didTimeOut;
    },
    run,
    error,
    cleanup: () => {
      clearTimeout(timer);
      parentSignal?.removeEventListener("abort", onParentAbort);
    },
  };
};

const normalizeAttemptError = (
  error: unknown,
  scope: AttemptScope,
  providerId: string,
): AiProviderError => {
  if (scope.timedOut) return new AiProviderError("timeout", providerId);
  if (scope.signal.aborted) return new AiProviderError("cancelled", providerId);
  if (error instanceof AiProviderError) return error;
  return new AiProviderError("network_error", providerId);
};

export class AiProviderManager {
  private readonly providers = new Map<string, AiProvider>();

  constructor(
    providers: readonly AiProvider[],
    private readonly config: AiProviderManagerConfig,
  ) {
    for (const provider of providers) {
      if (!provider.id.trim() || this.providers.has(provider.id)) {
        throw new Error("AI provider IDs must be non-empty and unique.");
      }
      this.providers.set(provider.id, provider);
    }
  }

  async complete(input: {
    messages: readonly AiProviderMessage[];
    signal?: AbortSignal;
    parameters?: AiProviderParameters;
  }): Promise<ManagedAiCompletion> {
    if (input.signal?.aborted) {
      throw new AiProviderError("cancelled", this.config.primaryProviderId);
    }

    const primary = this.getConfiguredProvider(this.config.primaryProviderId);
    if (!primary) {
      throw new AiProviderError(
        "not_configured",
        this.config.primaryProviderId,
      );
    }

    this.validateModel(primary.provider, primary.settings.model);
    this.validateParameters(primary.provider, input.parameters);

    try {
      return await this.invoke(
        primary.provider,
        primary.settings.model,
        primary.settings.timeoutMs,
        input.messages,
        input.parameters,
        input.signal,
        false,
      );
    } catch (primaryError) {
      const normalizedPrimary = normalizeAttemptError(
        primaryError,
        {
          timedOut: false,
          signal: input.signal ?? new AbortController().signal,
        } as AttemptScope,
        primary.provider.id,
      );

      if (
        !this.config.allowSensitiveFallbackData
        || !this.config.fallbackOn.includes(normalizedPrimary.code)
      ) {
        throw normalizedPrimary;
      }

      let lastFailure = normalizedPrimary;
      for (const fallbackId of this.config.fallbackProviderIds) {
        if (fallbackId === primary.provider.id) continue;
        const fallback = this.getConfiguredProvider(fallbackId);
        if (!fallback) continue;

        try {
          this.validateModel(fallback.provider, fallback.settings.model);
          this.validateParameters(fallback.provider, input.parameters);
          return await this.invoke(
            fallback.provider,
            fallback.settings.model,
            fallback.settings.timeoutMs,
            input.messages,
            input.parameters,
            input.signal,
            true,
          );
        } catch (fallbackError) {
          lastFailure = normalizeAttemptError(
            fallbackError,
            {
              timedOut: false,
              signal: input.signal ?? new AbortController().signal,
            } as AttemptScope,
            fallbackId,
          );
          if (!this.config.fallbackOn.includes(lastFailure.code)) {
            throw lastFailure;
          }
        }
      }

      throw lastFailure;
    }
  }

  private getConfiguredProvider(
    providerId: string,
  ): { provider: AiProvider; settings: AiProviderManagerConfig["providers"][string] } | null {
    const provider = this.providers.get(providerId);
    const settings = this.config.providers[providerId];
    if (!provider || !settings?.enabled || !provider.isConfigured()) return null;
    return { provider, settings };
  }

  private validateModel(provider: AiProvider, model: string): void {
    if (!provider.capabilities.models.includes(model)) {
      throw new AiProviderError("unsupported_model", provider.id);
    }
  }

  private validateParameters(
    provider: AiProvider,
    parameters: AiProviderParameters | undefined,
  ): void {
    if (!parameters) return;
    const supported = new Set(provider.capabilities.parameters);
    for (const [name, value] of Object.entries(parameters)) {
      if (
        !supported.has(name)
        || (typeof value === "number" && !Number.isFinite(value))
      ) {
        throw new AiProviderError("invalid_request", provider.id);
      }
    }
  }

  private async invoke(
    provider: AiProvider,
    model: string,
    timeoutMs: number,
    messages: readonly AiProviderMessage[],
    parameters: AiProviderParameters | undefined,
    parentSignal: AbortSignal | undefined,
    usedFallback: boolean,
  ): Promise<ManagedAiCompletion> {
    const scope = createAttemptScope(parentSignal, timeoutMs);

    try {
      const completion = await scope.run(() =>
        provider.complete({
          messages,
          model,
          ...(parameters ? { parameters } : {}),
          signal: scope.signal,
        }),
      );

      if (
        !completion
        || typeof completion !== "object"
        || !provider.capabilities.models.includes(completion.model)
      ) {
        throw new AiProviderError("invalid_response", provider.id);
      }

      if (completion.kind === "text") {
        if (typeof completion.text !== "string" || !completion.text.trim()) {
          throw new AiProviderError("invalid_response", provider.id);
        }
        scope.cleanup();
        return {
          ...completion,
          providerId: provider.id,
          usedFallback,
        };
      }

      if (completion.kind !== "stream" || !provider.capabilities.supportsStreaming) {
        throw new AiProviderError("invalid_response", provider.id);
      }

      const iterator = completion.stream[Symbol.asyncIterator]();
      const stream = (async function* () {
        let completed = false;
        try {
          while (true) {
            const next = await scope.run(() => Promise.resolve(iterator.next()));
            if (next.done) {
              completed = true;
              return;
            }
            if (!next.value || typeof next.value.text !== "string") {
              throw new AiProviderError("invalid_response", provider.id);
            }
            yield next.value;
          }
        } catch (error) {
          throw normalizeAttemptError(error, scope, provider.id);
        } finally {
          if (!completed && iterator.return) {
            void Promise.resolve(iterator.return()).catch(() => undefined);
          }
          scope.cleanup();
        }
      })();

      return {
        kind: "stream",
        stream,
        model: completion.model,
        providerId: provider.id,
        usedFallback,
      };
    } catch (error) {
      scope.cleanup();
      throw normalizeAttemptError(error, scope, provider.id);
    }
  }
}

export const isEligibleFallbackError = (
  code: AiProviderErrorCode,
  config: AiProviderManagerConfig,
): boolean => config.fallbackOn.includes(code);
