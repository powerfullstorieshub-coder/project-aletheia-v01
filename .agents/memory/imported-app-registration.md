---
name: Imported app registration
description: Durable setup notes for bringing a private GitHub project into the managed artifact workspace.
---

When importing a private GitHub project into this workspace, use the added standard GitHub connector rather than shell git authentication; a GitHub App connection may remain unusable for repository reads. If the authenticated archive endpoint is unavailable, read the repository tree and blobs through the GitHub API. Register a new web package with the artifact workflow before replacing its source files; direct writes to `.replit` and existing `artifact.toml` files are schema-guarded.

**Why:** The workspace manages preview routing and service ports through artifact registration, while private-repository archive downloads may be blocked even when individual authenticated GitHub API files are readable.

**How to apply:** For a fresh import, confirm the GitHub connection is `added`, create the artifact first, restore only the files needed for the running entrypoint, and use the validation callbacks for protected configuration files.