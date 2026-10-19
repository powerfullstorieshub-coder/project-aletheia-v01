---
name: GitHub CLI authentication
description: A healthy Replit GitHub connection may still leave workspace Git pushes unauthenticated.
---

The workspace GitHub source-control connection can report healthy and include repository write scope while `git push` to the correct GitHub origin still fails with an invalid username or token. `gh auth status` can also remain logged out.

**Why:** Connection health alone did not prove that the workspace's Git CLI received usable push credentials.

**How to apply:** Verify the remote, branch, and divergence; try a normal push; if authentication fails, do not force-push or request a token in chat. Use an authenticated Replit Git pane action or a supported GitHub connector, then verify the remote commit SHA.
