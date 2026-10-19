import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeRequest,
  detectResponseLanguage,
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

test("calculation answers lead with the result and keep verification concise", () => {
  const analysis = analyzeRequest("What is 100 - 12 × 2 + 1?");
  assert.equal(analysis.taskType, "math");
  assert.match(analysis.responseShape, /final answer first/i);

  const instruction = getIntelligenceInstruction(analysis, "reality");
  assert.match(instruction, /final numeric answer in the first line/i);
  assert.match(instruction, /concise calculation or verification/i);
  assert.match(instruction, /never put the working before the result/i);
});

test("modulo expressions are classified as calculations", () => {
  assert.equal(analyzeRequest("What is 17 % 5?").taskType, "math");
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

test("detects English, Hindi, Hinglish, and mixed-language input", () => {
  assert.equal(detectResponseLanguage("Explain photosynthesis simply."), "english");
  assert.equal(detectResponseLanguage("प्रकाश संश्लेषण को आसान भाषा में समझाओ।"), "hindi");
  assert.equal(detectResponseLanguage("Photosynthesis ko simple Hinglish mein explain karo."), "hinglish");
  assert.equal(
    detectResponseLanguage("Is concept ko Hindi mein explain karo but technical terms English mein rakho."),
    "hinglish",
  );
});

test("language handling is included in both mode instructions", () => {
  for (const mode of ["reality", "matrix"]) {
    const instruction = getIntelligenceInstruction(
      analyzeRequest("JavaScript function kaise work karta hai?", { mode }),
      mode,
    );
    assert.match(instruction, /natural Hinglish/i);
    assert.match(instruction, /technical terms/i);
  }
});