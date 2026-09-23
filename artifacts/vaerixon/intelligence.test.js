import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeRequest,
  getIntelligenceInstruction,
} from "./intelligence.js";

test("request understanding selects concise intent-aware shapes", () => {
  const simple = analyzeRequest("What is DNA?");
  assert.equal(simple.taskType, "explanation");
  assert.equal(simple.complexity, "simple");
  assert.equal(simple.responseLength, "short");

  const summary = analyzeRequest("Summarize the main causes in three bullet points.");
  assert.equal(summary.taskType, "summary");
  assert.equal(summary.responseLength, "short");

  const tutorial = analyzeRequest("How do I learn Python from scratch?");
  assert.equal(tutorial.taskType, "tutorial");
  assert.match(tutorial.responseShape, /numbered steps/i);
});

test("complex requests expose decision and critical-thinking contracts", () => {
  const analysis = analyzeRequest(
    "Should I choose option A or option B? Compare the trade-offs, risks, assumptions, and edge cases in detail.",
    { mode: "matrix" },
  );
  assert.equal(analysis.taskType, "comparison");
  assert.equal(analysis.complexity, "complex");
  assert.equal(analysis.depth, "advanced");
  assert.match(analysis.responseShape, /comparison/i);
});

test("follow-ups can require relevant conversation context", () => {
  const analysis = analyzeRequest("Explain it more simply.", {
    conversation: [{ role: "user", content: "What is quantum mechanics?" }],
  });
  assert.equal(analysis.followUp, true);
  assert.equal(analysis.contextAvailable, true);
  assert.match(analysis.constraints.join(", "), /previous turn/i);
});

test("follow-up wording selects expansion, simplification, and summary behavior", () => {
  const context = [{ role: "user", content: "What is quantum mechanics?" }];
  assert.equal(analyzeRequest("Explain it more.", { conversation: context }).followUpIntent, "expand");
  assert.equal(analyzeRequest("Explain it more simply.", { conversation: context }).followUpIntent, "simplify");
  assert.equal(analyzeRequest("Summarize it.", { conversation: context }).followUpIntent, "summarize");
});

test("the instruction preserves agnostic religion handling and prompt pillars", () => {
  const promptInstruction = getIntelligenceInstruction(
    analyzeRequest("Create a prompt for a research assistant."),
    "reality",
  );
  assert.match(promptInstruction, /TASK, CONTEXT, EXAMPLE, PERSONA, FORMAT, TONE/);
  assert.match(promptInstruction, /descriptively and agnostically/i);
});