import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_AI_PROVIDER_TIMEOUT_MS,
  DEFAULT_POLLINATIONS_MODEL,
  readAiProviderManagerConfig,
} from "../src/lib/ai-providers/config.ts";
import { AiProviderManager } from "../src/lib/ai-providers/manager.ts";
import { AiProviderError } from "../src/lib/ai-providers/types.ts";

const messages = [
  { role: "system", content: "Private conversation instructions." },
  { role: "user", content: "My private note is confidential." },
];

const fakeProvider = ({
  id = "primary",
  model = `${id}-model`,
  configured = true,
  supportsStreaming = false,
  complete,
}) => ({
  id,
  capabilities: {
    models: [model],
    parameters: [],
    supportsStreaming,
  },
  isConfigured: () => configured,
  complete,
});

const managerConfig = (overrides = {}) => ({
  primaryProviderId: "primary",
  fallbackProviderIds: ["secondary"],
  fallbackOn: ["network_error", "timeout", "provider_unavailable"],
  allowSensitiveFallbackData: true,
  providers: {
    primary: { enabled: true, model: "primary-model", timeoutMs: 100 },
    secondary: { enabled: true, model: "secondary-model", timeoutMs: 100 },
  },
  ...overrides,
});

test("provider IDs are registered uniquely and the configured primary is selected", async () => {
  const calls = [];
  const primary = fakeProvider({
    complete: async (request) => {
      calls.push({ id: "primary", request });
      return { kind: "text", text: "primary answer", model: request.model };
    },
  });
  const secondary = fakeProvider({
    id: "secondary",
    complete: async () => {
      calls.push({ id: "secondary" });
      return { kind: "text", text: "secondary answer", model: "secondary-model" };
    },
  });
  const manager = new AiProviderManager(
    [primary, secondary],
    managerConfig(),
  );

  const result = await manager.complete({ messages });
  assert.equal(result.kind, "text");
  assert.equal(result.providerId, "primary");
  assert.equal(result.model, "primary-model");
  assert.equal(result.usedFallback, false);
  assert.equal(result.text, "primary answer");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].request.messages, messages);
  assert.throws(
    () => new AiProviderManager([primary, primary], managerConfig()),
    /unique/,
  );
});

test("provider configuration preserves current Pollinations defaults and parses safe fallback options", () => {
  const defaults = readAiProviderManagerConfig({});
  assert.equal(defaults.primaryProviderId, "pollinations");
  assert.deepEqual(defaults.fallbackProviderIds, []);
  assert.equal(defaults.allowSensitiveFallbackData, false);
  assert.equal(defaults.providers.pollinations.model, DEFAULT_POLLINATIONS_MODEL);
  assert.equal(
    defaults.providers.pollinations.timeoutMs,
    DEFAULT_AI_PROVIDER_TIMEOUT_MS,
  );

  const configured = readAiProviderManagerConfig({
    AI_PRIMARY_PROVIDER: " POLLINATIONS ",
    AI_FALLBACK_PROVIDERS: "secondary,not valid,secondary",
    AI_FALLBACK_ON: "timeout,authentication",
    AI_FALLBACK_ALLOW_SENSITIVE_DATA: "true",
    AI_PROVIDER_TIMEOUT_MS: "150000",
    POLLINATIONS_ENABLED: "false",
  });
  assert.equal(configured.primaryProviderId, "pollinations");
  assert.deepEqual(configured.fallbackProviderIds, ["secondary"]);
  assert.deepEqual(configured.fallbackOn, ["timeout"]);
  assert.equal(configured.allowSensitiveFallbackData, true);
  assert.equal(configured.providers.pollinations.enabled, false);
  assert.equal(configured.providers.pollinations.timeoutMs, 120_000);
});

test("eligible transient primary failures use an explicitly authorized fallback", async () => {
  let fallbackRequest;
  const primary = fakeProvider({
    complete: async () => {
      throw new AiProviderError("provider_unavailable", "primary", {
        upstreamStatus: 503,
      });
    },
  });
  const fallback = fakeProvider({
    id: "secondary",
    complete: async (request) => {
      fallbackRequest = request;
      return { kind: "text", text: "fallback answer", model: request.model };
    },
  });
  const manager = new AiProviderManager(
    [primary, fallback],
    managerConfig(),
  );

  const result = await manager.complete({ messages });
  assert.equal(result.providerId, "secondary");
  assert.equal(result.model, "secondary-model");
  assert.equal(result.usedFallback, true);
  assert.equal(result.text, "fallback answer");
  assert.equal(fallbackRequest.messages, messages);
});

test("authentication and unsupported-model failures do not invoke fallback", async () => {
  let fallbackCalls = 0;
  const fallback = fakeProvider({
    id: "secondary",
    complete: async () => {
      fallbackCalls += 1;
      return { kind: "text", text: "must not run", model: "secondary-model" };
    },
  });
  const authFailure = new AiProviderManager(
    [fakeProvider({
      complete: async () => {
        throw new AiProviderError("authentication", "primary");
      },
    }), fallback],
    managerConfig(),
  );
  await assert.rejects(
    authFailure.complete({ messages }),
    (error) => error.code === "authentication",
  );
  assert.equal(fallbackCalls, 0);

  const unsupportedModel = new AiProviderManager(
    [fakeProvider({
      complete: async () => {
        throw new Error("This adapter must not be called.");
      },
    }), fallback],
    managerConfig({
      providers: {
        primary: {
          enabled: true,
          model: "unsupported-model",
          timeoutMs: 100,
        },
        secondary: {
          enabled: true,
          model: "secondary-model",
          timeoutMs: 100,
        },
      },
    }),
  );
  await assert.rejects(
    unsupportedModel.complete({ messages }),
    (error) => error.code === "unsupported_model",
  );
  assert.equal(fallbackCalls, 0);
});

test("missing, disabled, and unconfigured primary providers return a normalized error", async () => {
  const missing = new AiProviderManager([], managerConfig({
    primaryProviderId: "missing",
    providers: {},
  }));
  await assert.rejects(
    missing.complete({ messages }),
    (error) => error.code === "not_configured",
  );

  const disabled = new AiProviderManager(
    [fakeProvider({
      complete: async () => {
        throw new Error("A disabled adapter must not be called.");
      },
    })],
    managerConfig({
      providers: {
        primary: {
          enabled: false,
          model: "primary-model",
          timeoutMs: 100,
        },
      },
    }),
  );
  await assert.rejects(
    disabled.complete({ messages }),
    (error) => error.code === "not_configured",
  );

  const missingCredentials = new AiProviderManager(
    [fakeProvider({
      configured: false,
      complete: async () => {
        throw new Error("An unconfigured adapter must not be called.");
      },
    })],
    managerConfig(),
  );
  await assert.rejects(
    missingCredentials.complete({ messages }),
    (error) => error.code === "not_configured",
  );
});

test("timeouts abort the provider request and return a normalized timeout", async () => {
  let signalAborted = false;
  const slow = fakeProvider({
    complete: async ({ signal }) => new Promise((_resolve, _reject) => {
      signal.addEventListener("abort", () => {
        signalAborted = true;
      }, { once: true });
    }),
  });
  const manager = new AiProviderManager(
    [slow],
    managerConfig({
      fallbackProviderIds: [],
      providers: {
        primary: { enabled: true, model: "primary-model", timeoutMs: 10 },
      },
    }),
  );

  await assert.rejects(
    manager.complete({ messages }),
    (error) => error.code === "timeout",
  );
  assert.equal(signalAborted, true);
});

test("disabled sensitive-data forwarding prevents fallback from receiving conversation history", async () => {
  let fallbackCalls = 0;
  const primary = fakeProvider({
    complete: async () => {
      throw new AiProviderError("network_error", "primary");
    },
  });
  const fallback = fakeProvider({
    id: "secondary",
    complete: async () => {
      fallbackCalls += 1;
      return { kind: "text", text: "unexpected", model: "secondary-model" };
    },
  });
  const manager = new AiProviderManager(
    [primary, fallback],
    managerConfig({ allowSensitiveFallbackData: false }),
  );

  await assert.rejects(
    manager.complete({ messages }),
    (error) => {
      assert.equal(error.code, "network_error");
      assert.doesNotMatch(error.message, /confidential|private note/);
      return true;
    },
  );
  assert.equal(fallbackCalls, 0);
});

test("cancellation propagates through a normalized streaming provider", async () => {
  const controller = new AbortController();
  const streamingProvider = fakeProvider({
    supportsStreaming: true,
    complete: async ({ signal, model }) => ({
      kind: "stream",
      model,
      stream: (async function* () {
        yield { text: "partial" };
        await new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          }, { once: true });
        });
      })(),
    }),
  });
  const manager = new AiProviderManager(
    [streamingProvider],
    managerConfig({
      fallbackProviderIds: [],
      providers: {
        primary: {
          enabled: true,
          model: "primary-model",
          timeoutMs: 5_000,
        },
      },
    }),
  );

  const completion = await manager.complete({
    messages,
    signal: controller.signal,
  });
  assert.equal(completion.kind, "stream");
  const iterator = completion.stream[Symbol.asyncIterator]();
  assert.deepEqual(await iterator.next(), {
    done: false,
    value: { text: "partial" },
  });
  const pendingNext = iterator.next();
  controller.abort();
  await assert.rejects(
    pendingNext,
    (error) => error.code === "cancelled",
  );
});

test("unsupported provider parameters are rejected before any provider call", async () => {
  let calls = 0;
  const primary = fakeProvider({
    complete: async () => {
      calls += 1;
      return { kind: "text", text: "unexpected", model: "primary-model" };
    },
  });
  const manager = new AiProviderManager([primary], managerConfig());

  await assert.rejects(
    manager.complete({ messages, parameters: { temperature: 0.2 } }),
    (error) => error.code === "invalid_request",
  );
  assert.equal(calls, 0);
});
