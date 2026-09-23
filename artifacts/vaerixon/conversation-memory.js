const MODES = ["reality", "matrix"];
const MAX_MESSAGES = 48;
const MAX_CONTEXT_MESSAGES = 8;

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "can", "could",
  "did", "do", "does", "for", "from", "how", "i", "in", "is", "it", "me",
  "more", "of", "on", "or", "please", "simply", "that", "the", "this",
  "to", "was", "what", "when", "where", "which", "who", "why", "with",
  "would", "you", "your",
]);

export const normalizeQuestion = (value = "") => String(value)
  .toLowerCase()
  .normalize("NFKC")
  .replace(/[^\p{L}\p{N}\s]/gu, " ")
  .replace(/\s+/g, " ")
  .trim();

const topicTokens = (value = "") => [...new Set(
  normalizeQuestion(value)
    .split(" ")
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token)),
)];

const isFollowUp = (value = "") => /\b(?:it|that|this|they|them|above|before|previous|earlier|again|more|simply|simpler|elaborate|expand|clarify)\b/i
  .test(String(value));

export const getMessageContent = (message, messages = [], seen = new Set()) => {
  if (!message || seen.has(message.id)) return "";
  const content = typeof message.content === "string" ? message.content.trim() : "";
  if (content) return content;
  if (!message.reuseOf) return "";

  const nextSeen = new Set(seen);
  nextSeen.add(message.id);
  return getMessageContent(
    messages.find((candidate) => candidate.id === message.reuseOf),
    messages,
    nextSeen,
  );
};

const trimMessages = (messages = []) => {
  const clean = Array.isArray(messages)
    ? messages.filter((message) => (
      message
      && (message.role === "user" || message.role === "assistant")
      && typeof message.content === "string"
      && typeof message.id === "string"
    ))
    : [];

  return clean.length > MAX_MESSAGES ? clean.slice(-MAX_MESSAGES) : clean;
};

const completeTurns = (messages = []) => {
  const turns = [];
  for (let index = 0; index < messages.length; index += 1) {
    const userMessage = messages[index];
    if (userMessage.role !== "user" || !getMessageContent(userMessage, messages)) continue;

    let assistantMessage = null;
    for (let next = index + 1; next < messages.length; next += 1) {
      if (messages[next].role === "user") break;
      if (
        messages[next].role === "assistant"
        && !messages[next].streaming
        && getMessageContent(messages[next], messages)
      ) {
        assistantMessage = messages[next];
        break;
      }
    }

    if (assistantMessage) {
      turns.push({
        userMessage,
        assistantMessage,
        prompt: getMessageContent(userMessage, messages),
        answer: getMessageContent(assistantMessage, messages),
      });
    }
  }
  return turns;
};

export const classifyQuestion = (prompt, messages = []) => {
  const turns = completeTurns(messages);
  const normalizedPrompt = normalizeQuestion(prompt);
  const exactIndex = [...turns]
    .map((turn, index) => ({ turn, index }))
    .reverse()
    .find(({ turn }) => normalizeQuestion(turn.prompt) === normalizedPrompt)?.index ?? -1;
  const exact = exactIndex >= 0 ? turns[exactIndex] : null;

  if (exact) {
    return {
      kind: "exact",
      matchedPrompt: exact.prompt,
      answerMessage: exact.assistantMessage,
      contextMessages: [exact.userMessage, exact.assistantMessage],
      sameContext: exactIndex === turns.length - 1,
    };
  }

  const queryTokens = topicTokens(prompt);
  const followUp = isFollowUp(prompt);
  let best = null;

  turns.forEach((turn, index) => {
    const previousTokens = topicTokens(turn.prompt);
    const sharedTokens = queryTokens.filter((token) => previousTokens.includes(token));
    const smallestTokenSet = Math.max(1, Math.min(queryTokens.length, previousTokens.length));
    const unionSize = new Set([...queryTokens, ...previousTokens]).size || 1;
    const overlap = sharedTokens.length / smallestTokenSet;
    const jaccard = sharedTokens.length / unionSize;
    const related = followUp || overlap >= 0.34 || jaccard >= 0.2;
    const isBetter = !best
      || sharedTokens.length > best.sharedTokens.length
      || (followUp && sharedTokens.length === best.sharedTokens.length && index > best.index);
    if (related && isBetter) {
      best = { turn, sharedTokens, overlap, jaccard, index };
    }
  });

  if (best) {
    return {
      kind: "related",
      matchedPrompt: best.turn.prompt,
      answerMessage: best.turn.assistantMessage,
      contextMessages: [best.turn.userMessage, best.turn.assistantMessage],
      overlap: best.overlap,
      jaccard: best.jaccard,
    };
  }

  return {
    kind: "new",
    matchedPrompt: "",
    answerMessage: null,
    contextMessages: [],
  };
};

export const selectRelevantContext = (prompt, messages = []) => {
  const classification = classifyQuestion(prompt, messages);
  if (classification.kind === "new") return [];

  const context = classification.contextMessages.filter((message) => (
    message
    && !message.streaming
    && getMessageContent(message, messages)
  ));
  return context.slice(-MAX_CONTEXT_MESSAGES);
};

const serializableMessage = (message) => ({
  id: message.id,
  role: message.role,
  content: message.content,
  createdAt: message.createdAt,
  ...(message.reuseOf ? { reuseOf: message.reuseOf } : {}),
  ...(message.reused ? { reused: true } : {}),
});

export const createConversationMemory = (initialSessions = {}) => {
  const sessions = {
    reality: trimMessages(initialSessions.reality),
    matrix: trimMessages(initialSessions.matrix),
  };

  const getMessages = (mode) => sessions[mode] || sessions.reality;

  return {
    getMessages,
    setMessages(mode, messages) {
      if (!MODES.includes(mode)) return [];
      sessions[mode] = trimMessages(messages);
      return sessions[mode];
    },
    append(mode, message) {
      if (!MODES.includes(mode)) return message;
      sessions[mode] = trimMessages([...sessions[mode], message]);
      return message;
    },
    classify(mode, prompt) {
      return classifyQuestion(prompt, getMessages(mode));
    },
    context(mode, prompt) {
      return selectRelevantContext(prompt, getMessages(mode));
    },
    serialize() {
      return Object.fromEntries(MODES.map((mode) => [
        mode,
        getMessages(mode)
          .filter((message) => !message.streaming)
          .map(serializableMessage),
      ]));
    },
  };
};

export const MEMORY_LIMITS = Object.freeze({
  maxMessages: MAX_MESSAGES,
  maxContextMessages: MAX_CONTEXT_MESSAGES,
});