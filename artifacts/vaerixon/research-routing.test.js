import assert from "node:assert/strict";
import test from "node:test";

import {
  buildResearchFallback,
  decideResearchRoute,
  detectFreshness,
} from "./research-routing.js";

const local = "A stable local answer.";

test("stable knowledge stays local", () => {
  for (const prompt of ["What is DNA?", "What is general relativity?", "100 - 12 × 2 + 1"]) {
    const route = decideResearchRoute({ prompt, localResponse: local });
    assert.equal(route.kind, "local", prompt);
    assert.equal(route.requiresFreshResearch, false);
  }
});

test("current weather and recent AI developments require research", () => {
  for (const prompt of ["What is the weather today?", "What are the latest major AI developments?"]) {
    const route = decideResearchRoute({ prompt, localResponse: local });
    assert.equal(route.kind, "research", prompt);
    assert.equal(route.requiresFreshResearch, true);
  }
});

test("current product or service status is freshness-sensitive", () => {
  const route = decideResearchRoute({
    prompt: "What is the current price/status of the existing supported service?",
    localResponse: local,
  });
  assert.equal(route.kind, "research");
  assert.equal(route.requiresFreshResearch, true);
});

test("software outages and app issues are freshness-sensitive", () => {
  for (const prompt of [
    "Why is the app not working?",
    "Is the software currently down?",
    "What is the latest compatibility issue?",
  ]) {
    assert.equal(detectFreshness(prompt).requiresFreshResearch, true, prompt);
  }
});

test("an uncovered stable request can use the existing research extension", () => {
  const route = decideResearchRoute({ prompt: "Explain a niche topic" });
  assert.equal(route.kind, "research");
  assert.equal(route.requiresFreshResearch, false);
});

test("mode does not change the freshness decision", () => {
  for (const mode of ["reality", "matrix"]) {
    const localRoute = decideResearchRoute({
      prompt: "What is DNA?",
      localResponse: local,
      conversation: [{ role: "user", content: "Start with biology." }],
      mode,
    });
    const researchRoute = decideResearchRoute({
      prompt: "What is the current weather today?",
      localResponse: local,
      conversation: [{ role: "user", content: "Start with biology." }],
      mode,
    });
    assert.equal(localRoute.kind, "local");
    assert.equal(researchRoute.kind, "research");
  }
});

test("freshness detector does not classify a stable DNA question", () => {
  assert.equal(detectFreshness("What is DNA?").requiresFreshResearch, false);
});

test("fresh research failure is honest and never presents a fabricated current answer", () => {
  const route = decideResearchRoute({
    prompt: "What is the weather today?",
    localResponse: "Weather is the state of the atmosphere.",
  });
  const fallback = buildResearchFallback({
    route,
    localResponse: "Weather is the state of the atmosphere.",
    offlineResponse: "offline response",
  });
  assert.match(fallback, /couldn’t verify the current information/i);
  assert.match(fallback, /not a current-status claim/i);
  assert.doesNotMatch(fallback, /offline response/);
});

test("non-fresh research failure uses the existing offline capability", () => {
  const fallback = buildResearchFallback({
    route: { requiresFreshResearch: false },
    offlineResponse: "A useful local fallback.",
  });
  assert.equal(fallback, "A useful local fallback.");
});