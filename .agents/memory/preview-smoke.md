---
name: Preview smoke testing
description: Browser automation constraints when testing applications through the Replit preview proxy.
---

Chromium CDP smoke tests against the proxied localhost preview may deny `localStorage` with a SecurityError even though the application is served correctly.

**Why:** The proxy can present the page with a restricted or opaque browser origin during local automation.

**How to apply:** Test behavior with isolated navigations or a fresh browser profile instead of depending on clearing browser storage; application storage helpers should continue to catch access failures.