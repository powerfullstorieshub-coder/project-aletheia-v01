---
name: GitHub publishing
description: How to publish verified repository state when the workspace remote is a Replit backup rather than GitHub.
---

When a workspace has a connected GitHub integration but its local Git remote is only the Replit backup remote, use the authenticated GitHub connector REST API for repository reads and force-pushes. Compare the remote branch tree with the verified local tree first, then apply only the exact delta and verify the resulting ref, commit message, and changed file SHAs.

**Why:** The local backup remote does not identify or authenticate to the GitHub repository, while the connector can update Git refs without exposing credentials.

**How to apply:** Resolve the repository and branch through the connected GitHub account, preserve unrelated remote files when constructing a Git tree, and only force-update after the local build, tests, preview, and interaction checks pass.