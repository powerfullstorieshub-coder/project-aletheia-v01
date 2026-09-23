---
name: Knowledge routing
description: Durable rule for balancing VÆRIXON's local knowledge layer and external generation.
---

Stable topic matches should be answered locally when the matched material can satisfy the requested intent. Shape those answers for summaries and how-to requests instead of returning raw reference text. A single-topic definition should not masquerade as a comparison, decision analysis, critique, or problem-solving answer; those requests should use the external generation path when local material is insufficient. Freshness-sensitive requests must retain the external path and must not imply that stable background is current.

**Why:** VÆRIXON's local reference layer reduces unnecessary external dependency, but raw single-topic text can produce answers that are technically related while failing the user's requested task.

**How to apply:** When adding a knowledge topic or changing routing, test both retrieval sufficiency and response shape. Preserve the current-information fallback and explicitly separate stable context from live claims.