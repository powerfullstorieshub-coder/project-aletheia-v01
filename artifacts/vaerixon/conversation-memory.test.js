import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyQuestion,
  createConversationMemory,
  getMessageContent,
  MEMORY_LIMITS,
  selectRelevantContext,
} from "./conversation-memory.js";

const message = (id, role, content, extra = {}) => ({
  id,
  role,
  content,
  createdAt: id,
  ...extra,
});

const conversation = [
  message("u1", "user", "What is quantum mechanics?"),
  message("a1", "assistant", "Quantum mechanics describes matter and energy at very small scales."),
];

test("exact questions reuse the previous completed answer", () => {
  const classification = classifyQuestion("What is quantum mechanics?", conversation);
  assert.equal(classification.kind, "exact");
  assert.equal(classification.answerMessage.id, "a1");
  assert.deepEqual(
    selectRelevantContext("What is quantum mechanics?", conversation).map(({ id }) => id),
    ["u1", "a1"],
  );
});

test("related follow-ups retain the relevant turn without treating it as exact", () => {
  const classification = classifyQuestion("Explain it more simply.", conversation);
  assert.equal(classification.kind, "related");
  assert.equal(classification.matchedPrompt, "What is quantum mechanics?");
  assert.equal(getMessageContent(classification.answerMessage, conversation), conversation[1].content);
});

test("ambiguous follow-ups use the most recent complete turn", () => {
  const messages = [
    ...conversation,
    message("u2", "user", "What is dark matter?"),
    message("a2", "assistant", "Dark matter is inferred from its gravitational effects."),
  ];
  assert.equal(
    classifyQuestion("Explain it more simply.", messages).matchedPrompt,
    "What is dark matter?",
  );
});

test("unrelated questions do not inherit stale context", () => {
  assert.equal(classifyQuestion("What is the Roman Empire?", conversation).kind, "new");
  assert.deepEqual(selectRelevantContext("What is the Roman Empire?", conversation), []);
});

test("mode sessions remain isolated and bounded", () => {
  const memory = createConversationMemory({
    reality: conversation,
    matrix: [message("m1", "user", "Read the signal.")],
  });

  assert.equal(memory.classify("reality", "Explain it more simply.").kind, "related");
  assert.equal(memory.classify("matrix", "Explain it more simply.").kind, "new");

  for (let index = 0; index < MEMORY_LIMITS.maxMessages + 10; index += 1) {
    memory.append("reality", message(`r${index}`, "user", `Question ${index}`));
  }
  assert.equal(memory.getMessages("reality").length, MEMORY_LIMITS.maxMessages);
  assert.equal(memory.getMessages("matrix").length, 1);
});

test("reused responses resolve through a reference instead of duplicated content", () => {
  const reused = message("a2", "assistant", "", { reuseOf: "a1", reused: true });
  assert.equal(getMessageContent(reused, [...conversation, reused]), conversation[1].content);
});