const normalize = (value = "") => String(value)
  .toLowerCase()
  .normalize("NFKC")
  .replace(/[^\p{L}\p{N}\s-]/gu, " ")
  .replace(/\s+/g, " ")
  .trim();

const FRESHNESS_PATTERNS = [
  {
    pattern: /\b(?:today|tonight|tomorrow|now|currently|latest|recent(?:ly)?|newest|breaking|live|real[- ]time|up[- ]to[- ]date|as of)\b/i,
    reason: "The request asks for information that can change over time.",
  },
  {
    pattern: /\b(?:current|latest|recent|newly released|new)\s+(?:weather|temperature|forecast|price|pricing|cost|status|version|release|update|outage|availability|developments?|events?|news|score|scores|schedule)\b/i,
    reason: "The request names a time-sensitive fact or status.",
  },
  {
    pattern: /\b(?:app|software|service|website|platform)\s+(?:is\s+)?(?:down|broken|unavailable|not working|having issues)\b|\b(?:current|recent|latest)\s+(?:bug|issue|error|compatibility|outage)\b/i,
    reason: "The request asks about a current software or service issue.",
  },
  {
    pattern: /\b(?:weather|temperature|forecast|air quality|aqi|pollution|breaking news|current events?|recent events?|sports scores?|match results?|game schedule|product prices?|service status|outage|software update|app update|release notes?)\b/i,
    reason: "The topic depends on live or recently changed information.",
  },
  {
    pattern: /\b(?:current|latest|recent|newly released)\s+(?:scientific|technology|tech|ai)\s+developments?\b/i,
    reason: "The request asks about recent developments.",
  },
];

export const detectFreshness = (prompt = "") => {
  const normalizedPrompt = normalize(prompt);
  const match = FRESHNESS_PATTERNS.find(({ pattern }) => pattern.test(normalizedPrompt));

  return {
    requiresFreshResearch: Boolean(match),
    reason: match?.reason || "The request does not contain a clear freshness signal.",
  };
};

const hasConversationContext = (conversation) => Array.isArray(conversation)
  && conversation.some((message) => (
    message
    && (message.role === "user" || message.role === "assistant")
    && typeof message.content === "string"
    && message.content.trim()
  ));

export const decideResearchRoute = ({
  prompt = "",
  localResponse = "",
  conversation = [],
} = {}) => {
  const freshness = detectFreshness(prompt);
  const hasLocalKnowledge = Boolean(String(localResponse).trim());
  const hasContext = hasConversationContext(conversation);

  if (freshness.requiresFreshResearch) {
    return {
      kind: "research",
      requiresFreshResearch: true,
      reason: freshness.reason,
      hasLocalKnowledge,
      hasContext,
    };
  }

  if (hasLocalKnowledge) {
    return {
      kind: "local",
      requiresFreshResearch: false,
      reason: "A local knowledge response is sufficient for this stable request.",
      hasLocalKnowledge: true,
      hasContext,
    };
  }

  return {
    kind: "research",
    requiresFreshResearch: false,
    reason: hasContext
      ? "The request needs an answer beyond the local knowledge layer and current context."
      : "The local knowledge layer does not cover this request.",
    hasLocalKnowledge: false,
    hasContext,
  };
};

export const buildResearchFallback = ({
  route = {},
  localResponse = "",
  offlineResponse = "",
} = {}) => {
  if (route.requiresFreshResearch) {
    const stableContext = String(localResponse).trim();
    return [
      "I couldn’t verify the current information just now, so I won’t invent a live answer.",
      stableContext
        ? `\n\nStable background, not a current-status claim:\n\n${stableContext}`
        : "",
    ].join("").trim();
  }

  return String(offlineResponse).trim()
    || "I couldn’t complete that request just now. Please try again.";
};