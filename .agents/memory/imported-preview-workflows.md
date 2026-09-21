---
name: Imported preview workflows
description: How to preview an imported Replit app when its artifact metadata is not registered in the current environment.
---

When an imported repository contains a runnable frontend but its artifact is not registered locally, a dedicated webview workflow on a supported port can provide the preview without replacing the app source.

**Why:** Imported artifact metadata may reference a port or registration that does not exist in the current environment, while the frontend itself can still be healthy and previewable.

**How to apply:** Confirm the app's required environment variables and start command, bind it to a supported preview port, then verify the workflow logs and HTTP response before handing it over.