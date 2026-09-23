import assert from "node:assert/strict";
import test from "node:test";

import { getLocalKnowledgeResponse } from "./index.js";

test("known stable topics stay in the local knowledge layer", async () => {
  const response = await getLocalKnowledgeResponse("What is neuroscience?", {
    taskType: "explanation",
    complexity: "simple",
    depth: "basic",
  });
  assert.match(response, /nervous system|neuroscience/i);
});

test("local how-to knowledge is shaped into practical steps", async () => {
  const response = await getLocalKnowledgeResponse("How do I learn Python?", {
    taskType: "tutorial",
    complexity: "moderate",
  });
  assert.match(response, /Practical path/);
  assert.match(response, /1\./);
});

test("the six-pillar framework is directly retrievable", async () => {
  const response = await getLocalKnowledgeResponse("What is the six-pillar prompt framework?", {
    taskType: "explanation",
    complexity: "moderate",
  });
  assert.match(response, /TASK/);
  assert.match(response, /CONTEXT/);
  assert.match(response, /TONE/);
});

test("single-topic local knowledge does not pretend to answer comparisons", async () => {
  const response = await getLocalKnowledgeResponse("Compare machine learning and generative AI.", {
    taskType: "comparison",
    complexity: "moderate",
  });
  assert.equal(response, "");
});