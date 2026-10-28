# VÆRIXON Calculation API

## Endpoint

`POST /api/v1/calculate`

The API service is mounted at `/api`; in Replit's shared preview and deployment router, the full path above is used. This endpoint is public and does not require authentication. Do not send secrets or personal data in expressions.

## Request

Send `Content-Type: application/json` with exactly one field:

```json
{
  "expression": "2 + 3 * 4"
}
```

`expression` must be a string from 1 through 256 characters. The request body is limited to 8 KiB. Supported syntax comes from the existing Calculation Engine: decimal numbers, unary `+` and `-`, parentheses, and `+`, `-`, `*`, `/`, `%`, and `^` (exponentiation). The `**` operator and scientific-notation numbers such as `1e3` are not supported.

## Responses

Success (`200`):

```json
{
  "success": true,
  "expression": "2 + 3 * 4",
  "result": 14
}
```

Errors use the same envelope:

```json
{
  "success": false,
  "error": {
    "code": "DIVISION_BY_ZERO",
    "message": "Division by zero is undefined."
  }
}
```

| Status | Error codes | Meaning |
| --- | --- | --- |
| `400` | `INVALID_JSON`, `INVALID_REQUEST` | Malformed JSON or invalid request shape |
| `413` | `PAYLOAD_TOO_LARGE` | Body exceeds 8 KiB |
| `415` | `UNSUPPORTED_MEDIA_TYPE` | Content type is not `application/json` |
| `422` | `INVALID_EXPRESSION`, `DIVISION_BY_ZERO`, `MODULO_BY_ZERO`, `UNSUPPORTED_OPERATION`, `EXPRESSION_TOO_LONG`, `EXPRESSION_TOO_COMPLEX` | Expression cannot be evaluated |
| `500` | `INTERNAL_SERVER_ERROR` | Unexpected server failure; implementation details are not returned |

The API has no authentication or shared rate-limiting service. Request bodies, expression length, parser token count, and parser depth are bounded. Add gateway-level rate limiting before exposing this public endpoint to high-volume or untrusted traffic.

## AI provider configuration

`POST /api/v1/ai/chat` uses the server-side provider manager and preserves the existing OpenAI-compatible response and event-stream formats.

| Environment setting | Default | Purpose |
| --- | --- | --- |
| `POLLINATIONS_KEY` | unset | Pollinations credential; configure it as a Replit secret. |
| `AI_PRIMARY_PROVIDER` | `pollinations` | Provider ID selected for chat requests. |
| `POLLINATIONS_ENABLED` | `true` | Enables or disables the existing Pollinations adapter. |
| `POLLINATIONS_MODEL` | `openai/gpt-5.4-nano` | Model ID; the current adapter accepts only this verified existing model. |
| `AI_PROVIDER_TIMEOUT_MS` | `90000` | Per-provider request timeout, capped at 120 seconds. `POLLINATIONS_TIMEOUT_MS` remains a compatibility fallback. |
| `AI_FALLBACK_PROVIDERS` | empty | Ordered provider IDs eligible after a retryable primary failure. |
| `AI_FALLBACK_ON` | network, timeout, and service failures | Limits which failures can trigger a fallback. Authentication, request, model, quota, and rate-limit failures are never eligible. |
| `AI_FALLBACK_ALLOW_SENSITIVE_DATA` | `false` | Must be explicitly set to `true` before conversation history can be sent to any fallback. |

Pollinations is the only provider currently registered. A fallback requires another implemented and registered adapter as well as explicit configuration; setting an unknown provider ID does not add a provider. There is no local runtime or additional external provider in this implementation.
