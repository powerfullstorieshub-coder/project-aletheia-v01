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
