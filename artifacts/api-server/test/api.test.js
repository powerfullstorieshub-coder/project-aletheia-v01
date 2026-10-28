import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import app from "../dist/app.mjs";
import { calculateExpression } from "@workspace/calculation-engine";
import apiErrorHandler from "../src/middlewares/api-error-handler.ts";

let server;
let baseUrl;

before(async () => {
  await new Promise((resolve, reject) => {
    server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Test server did not bind to a TCP port."));
        return;
      }
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
    server.once("error", reject);
  });
});

after(async () => {
  if (!server) return;
  server.closeAllConnections();
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

const post = (body, headers = { "content-type": "application/json" }) =>
  fetch(`${baseUrl}/api/v1/calculate`, {
    method: "POST",
    headers,
    body,
  });

const postJson = (value) => post(JSON.stringify(value));

const defaultChatMessages = [
  { role: "system", content: "You are VÆRIXON." },
  { role: "user", content: "Hello." },
];

const postAiChat = (messages = defaultChatMessages, headers = { "content-type": "application/json" }) =>
  fetch(`${baseUrl}/api/v1/ai/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify({ messages }),
  });

const withMockedPollinations = async (respond, run, options = {}) => {
  const providerEnvironmentKeys = [
    "POLLINATIONS_KEY",
    "POLLINATIONS_TIMEOUT_MS",
    "POLLINATIONS_ENABLED",
    "POLLINATIONS_MODEL",
    "AI_PRIMARY_PROVIDER",
    "AI_PROVIDER_TIMEOUT_MS",
    "AI_FALLBACK_PROVIDERS",
    "AI_FALLBACK_ON",
    "AI_FALLBACK_ALLOW_SENSITIVE_DATA",
  ];
  const previousEnvironment = new Map(
    providerEnvironmentKeys.map((key) => [key, process.env[key]]),
  );
  const originalFetch = globalThis.fetch;
  const calls = [];
  providerEnvironmentKeys.forEach((key) => delete process.env[key]);
  if (options.key === null) {
    delete process.env.POLLINATIONS_KEY;
  } else {
    process.env.POLLINATIONS_KEY = "mocked-auth-value";
  }
  if (options.timeoutMs === undefined) {
    delete process.env.POLLINATIONS_TIMEOUT_MS;
  } else {
    process.env.POLLINATIONS_TIMEOUT_MS = String(options.timeoutMs);
  }
  if (options.enabled === false) process.env.POLLINATIONS_ENABLED = "false";
  if (options.environment) Object.assign(process.env, options.environment);

  globalThis.fetch = async (input, init) => {
    if (String(input) === "https://gen.pollinations.ai/v1/chat/completions") {
      calls.push({ input: String(input), init });
      return respond(calls.length, init);
    }
    return originalFetch(input, init);
  };

  try {
    return await run(calls);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of previousEnvironment) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

const sseResponse = (text = "Mock response") => new Response(
  [
    `data: ${JSON.stringify({
      choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
    })}`,
    "",
    "data: [DONE]",
    "",
  ].join("\n"),
  { headers: { "content-type": "text/event-stream" } },
);

const providerError = (status, retryAfter) => new Response(
  JSON.stringify({ error: { message: "private provider detail" } }),
  {
    status,
    headers: {
      "content-type": "application/json",
      ...(retryAfter ? { "retry-after": retryAfter } : {}),
    },
  },
);

test("calculates arithmetic using the shared VÆRIXON engine", async () => {
  const cases = [
    ["2 + 3 * 4", 14],
    ["(2 + 3) * 4", 20],
    [".5 + 1.25", 1.75],
    ["-5 + 2", -3],
    ["2 ^ 3", 8],
    ["2 ^ -2", 0.25],
    ["17 % 5", 2],
  ];

  for (const [expression, expected] of cases) {
    const response = await postJson({ expression });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body, {
      success: true,
      expression,
      result: expected,
    });

    const engineResult = calculateExpression(expression);
    assert.equal(engineResult.ok, true);
    assert.equal(body.result, engineResult.value);
  }
});

test("proxies Reality and Matrix conversation history using the official streaming contract", async () => {
  await withMockedPollinations(
    () => sseResponse("streamed answer"),
    async (calls) => {
      for (const mode of ["Reality", "Matrix"]) {
        const messages = [
          { role: "system", content: `You are in ${mode} mode.` },
          { role: "user", content: "Earlier prompt." },
          { role: "assistant", content: "Earlier answer." },
          { role: "user", content: "Continue the conversation." },
        ];
        const response = await postAiChat(messages);
        assert.equal(response.status, 200);
        assert.match(response.headers.get("content-type"), /text\/event-stream/);
        assert.match(await response.text(), /streamed answer/);
      }

      assert.equal(calls.length, 2);
      for (let index = 0; index < calls.length; index += 1) {
        assert.equal(calls[index].input, "https://gen.pollinations.ai/v1/chat/completions");
        assert.equal(calls[index].init.headers.Authorization, "Bearer mocked-auth-value");
        const requestBody = JSON.parse(calls[index].init.body);
        assert.equal(requestBody.model, "openai/gpt-5.4-nano");
        assert.equal(requestBody.stream, true);
        assert.equal(requestBody.messages[0].content, `You are in ${index === 0 ? "Reality" : "Matrix"} mode.`);
        assert.equal(requestBody.messages[2].content, "Earlier answer.");
        assert.equal(requestBody.messages[3].content, "Continue the conversation.");
      }
    },
  );
});

test("reports missing Pollinations credentials without making an upstream request", async () => {
  await withMockedPollinations(
    () => assert.fail("Pollinations should not be called without a key."),
    async (calls) => {
      const response = await postAiChat();
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), {
        error: {
          code: "AI_NOT_CONFIGURED",
          message: "Live AI is not configured on this server.",
        },
      });
      assert.equal(calls.length, 0);
    },
    { key: null },
  );
});

test("does not call a disabled configured provider", async () => {
  await withMockedPollinations(
    () => assert.fail("A disabled provider must not receive requests."),
    async (calls) => {
      const response = await postAiChat();
      assert.equal(response.status, 503);
      assert.match(await response.text(), /AI_NOT_CONFIGURED/);
      assert.equal(calls.length, 0);
    },
    { enabled: false },
  );
});

test("maps Pollinations authentication failures without retrying or exposing provider details", async () => {
  await withMockedPollinations(
    () => providerError(401),
    async (calls) => {
      const response = await postAiChat();
      const body = await response.text();
      assert.equal(response.status, 502);
      assert.match(body, /AI_AUTHENTICATION_FAILED/);
      assert.doesNotMatch(body, /private provider detail|mocked-auth-value/);
      assert.equal(calls.length, 1);
    },
  );
});

test("maps exhausted provider quota without retrying", async () => {
  await withMockedPollinations(
    () => providerError(402),
    async (calls) => {
      const response = await postAiChat();
      assert.equal(response.status, 402);
      assert.match((await response.text()), /AI_QUOTA_EXHAUSTED/);
      assert.equal(calls.length, 1);
    },
  );
});

test("respects provider rate-limit backoff and returns a concise error", async () => {
  await withMockedPollinations(
    () => providerError(429, "0"),
    async (calls) => {
      const response = await postAiChat();
      const body = await response.text();
      assert.equal(response.status, 429);
      assert.match(body, /AI_RATE_LIMITED/);
      assert.doesNotMatch(body, /private provider detail/);
      assert.equal(calls.length, 2);
    },
  );
});

test("does not retry beyond a provider's longer rate-limit guidance", async () => {
  await withMockedPollinations(
    () => providerError(429, "30"),
    async (calls) => {
      const response = await postAiChat();
      assert.equal(response.status, 429);
      assert.equal(response.headers.get("retry-after"), "30");
      assert.match(await response.text(), /AI_RATE_LIMITED/);
      assert.equal(calls.length, 1);
    },
  );
});

test("does not retry an unsupported model response", async () => {
  await withMockedPollinations(
    () => providerError(400),
    async (calls) => {
      const response = await postAiChat();
      assert.equal(response.status, 502);
      assert.match((await response.text()), /AI_UNSUPPORTED_MODEL/);
      assert.equal(calls.length, 1);
    },
  );
});

test("retries a transient provider outage once and succeeds", async () => {
  await withMockedPollinations(
    (attempt) => attempt === 1 ? providerError(503, "0") : sseResponse("recovered"),
    async (calls) => {
      const response = await postAiChat();
      assert.equal(response.status, 200);
      assert.match(await response.text(), /recovered/);
      assert.equal(calls.length, 2);
    },
  );
});

test("retries a transient network failure once", async () => {
  await withMockedPollinations(
    (attempt) => {
      if (attempt === 1) throw new Error("private network detail");
      return sseResponse("network recovered");
    },
    async (calls) => {
      const response = await postAiChat();
      assert.equal(response.status, 200);
      assert.match(await response.text(), /network recovered/);
      assert.equal(calls.length, 2);
    },
  );
});

test("returns a timeout error when the provider does not respond in time", async () => {
  await withMockedPollinations(
    (_attempt, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => {
        reject(new DOMException("private timeout detail", "AbortError"));
      }, { once: true });
    }),
    async (calls) => {
      const response = await postAiChat();
      assert.equal(response.status, 504);
      assert.match((await response.text()), /AI_TIMEOUT/);
      assert.equal(calls.length, 1);
    },
    { timeoutMs: 25 },
  );
});

test("rejects malformed successful provider responses", async () => {
  await withMockedPollinations(
    () => new Response(JSON.stringify({ choices: [] }), {
      headers: { "content-type": "application/json" },
    }),
    async () => {
      const response = await postAiChat();
      assert.equal(response.status, 502);
      assert.match((await response.text()), /AI_INVALID_RESPONSE/);
    },
  );
});

test("accepts a valid non-streaming OpenAI-compatible completion", async () => {
  await withMockedPollinations(
    () => new Response(JSON.stringify({
      choices: [{ message: { content: "validated completion" } }],
    }), { headers: { "content-type": "application/json" } }),
    async () => {
      const response = await postAiChat();
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.choices[0].message.content, "validated completion");
    },
  );
});

test("turns malformed provider stream events into a safe stream error", async () => {
  await withMockedPollinations(
    () => new Response("data: not-json\n\n", {
      headers: { "content-type": "text/event-stream" },
    }),
    async () => {
      const response = await postAiChat();
      const body = await response.text();
      assert.equal(response.status, 200);
      assert.match(body, /AI_INVALID_RESPONSE/);
      assert.doesNotMatch(body, /not-json/);
    },
  );
});

test("does not treat an empty provider stream as a successful response", async () => {
  await withMockedPollinations(
    () => sseResponse(""),
    async () => {
      const response = await postAiChat();
      assert.equal(response.status, 200);
      assert.match(await response.text(), /AI_INVALID_RESPONSE/);
    },
  );
});

test("rejects malformed chat history and cross-origin requests", async () => {
  await withMockedPollinations(
    () => assert.fail("Invalid requests should not reach Pollinations."),
    async (calls) => {
      const invalid = await postAiChat([{ role: "developer", content: "No." }]);
      assert.equal(invalid.status, 400);
      assert.match((await invalid.text()), /AI_INVALID_REQUEST/);

      const crossOrigin = await postAiChat(defaultChatMessages, {
        "content-type": "application/json",
        origin: "https://untrusted.example",
      });
      assert.equal(crossOrigin.status, 403);
      assert.match((await crossOrigin.text()), /AI_ORIGIN_REJECTED/);
      assert.equal(calls.length, 0);
    },
  );
});

test("rejects missing, empty, overlong, mistyped, and unsupported request fields", async () => {
  const invalidBodies = [
    {},
    null,
    "2 + 2",
    ["2 + 2"],
    { expression: "" },
    { expression: "1".repeat(257) },
    { expression: 42 },
    { expression: "2 + 2", extra: true },
  ];

  for (const invalidBody of invalidBodies) {
    const response = await postJson(invalidBody);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      success: false,
      error: {
        code: "INVALID_REQUEST",
        message:
          "Provide a JSON object containing only an expression string of 1–256 characters.",
      },
    });
  }
});

test("returns safe calculation errors for division by zero and unsupported syntax", async () => {
  for (const [expression, code] of [
    ["10 / 0", "DIVISION_BY_ZERO"],
    ["10 % 0", "MODULO_BY_ZERO"],
    ["2 ** 3", "INVALID_EXPRESSION"],
  ]) {
    const response = await postJson({ expression });
    assert.equal(response.status, 422);
    const body = await response.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, code);
    assert.equal(typeof body.error.message, "string");
    assert.equal("stack" in body.error, false);
    assert.equal("path" in body.error, false);
  }
});

test("returns consistent errors for malformed JSON and unsupported media types", async () => {
  const malformed = await post('{"expression":');
  assert.equal(malformed.status, 400);
  assert.deepEqual(await malformed.json(), {
    success: false,
    error: {
      code: "INVALID_JSON",
      message: "Request body must contain valid JSON.",
    },
  });

  const unsupported = await post("expression=2%2B2", {
    "content-type": "application/x-www-form-urlencoded",
  });
  assert.equal(unsupported.status, 415);
  assert.deepEqual(await unsupported.json(), {
    success: false,
    error: {
      code: "UNSUPPORTED_MEDIA_TYPE",
      message: "Content-Type must be application/json.",
    },
  });
});

test("rejects request bodies above 8 KiB without exposing parser details", async () => {
  const response = await postJson({ expression: "1".repeat(9000) });
  assert.equal(response.status, 413);
  const body = await response.json();
  assert.deepEqual(body, {
    success: false,
    error: {
      code: "PAYLOAD_TOO_LARGE",
      message: "Request body exceeds the 8 KiB limit.",
    },
  });
  assert.equal(JSON.stringify(body).includes("node_modules"), false);
  assert.equal(JSON.stringify(body).includes("SyntaxError"), false);
});

test("returns a generic response for unexpected server errors", () => {
  let loggedError;
  const req = {
    log: {
      error(...args) {
        loggedError = args;
      },
    },
  };
  const res = {
    headersSent: false,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };

  apiErrorHandler(
    new Error("secret detail at /internal/private/file.ts"),
    req,
    res,
    () => assert.fail("The response had not been sent."),
  );

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, {
    success: false,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected server error occurred.",
    },
  });
  assert.equal(JSON.stringify(res.body).includes("/internal/private"), false);
  assert.ok(loggedError);
});
