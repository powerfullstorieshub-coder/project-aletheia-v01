---
name: Node TypeScript test loading
description: Keep direct source imports compatible with Node 24's built-in TypeScript stripping.
---

Node 24's strip-only TypeScript loader does not transform parameter properties, and direct imports of TypeScript modules do not resolve extensionless runtime imports. Code that bundles successfully can therefore still fail when imported directly by Node tests.

**Why:** The API server tests use Node's native TypeScript stripping for some source imports, which exposed both limitations during provider-manager tests.

**How to apply:** When a Node test imports TypeScript source directly, keep the imported graph compatible with strip-only mode or bundle the test entry with esbuild. Avoid adding `.ts` import suffixes unless the TypeScript project configuration supports them.
