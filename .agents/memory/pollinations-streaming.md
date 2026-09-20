---
name: Pollinations streaming
description: Non-obvious response behavior for the keyless Pollinations text endpoint.
---

For the VÆRIXON browser client, use the keyless `text.pollinations.ai` streaming GET as the primary request and treat HTML responses as gateway failures rather than chat content.

**Why:** The public streaming GET returned `text/event-stream`, while a clean unauthenticated POST could return an HTML gateway page with HTTP 200.

**How to apply:** Keep requests free of authorization headers and API keys, parse SSE text chunks, and fall back only to another clean text request when the response content type is not HTML.