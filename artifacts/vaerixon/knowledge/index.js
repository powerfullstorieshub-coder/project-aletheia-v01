const CATEGORY_LOADERS = [
  {
    ids: [
      "general-knowledge",
      "science",
      "physics",
      "astronomy",
      "biology",
      "neuroscience",
      "psychology",
      "health",
      "philosophy",
      "theories",
      "myths",
      "ai-technology",
      "computers-software",
      "finance-money",
      "education-learning",
      "mathematics-logic",
      "games-gaming",
      "everyday-practical",
      "human-behavior-society",
      "culture",
      "religions",
      "prompt-engineering",
    ],
    terms: [
      "general knowledge",
      "science",
      "physics",
      "astronomy",
      "biology",
      "neuroscience",
      "psychology",
      "health",
      "philosophy",
      "theory",
      "mythology",
      "ai",
      "technology",
      "computers",
      "software",
      "finance",
      "money",
      "education",
      "learning",
      "mathematics",
      "math",
      "logic",
      "games",
      "gaming",
      "everyday",
      "practical",
      "human behavior",
      "society",
      "culture",
      "religion",
      "prompt engineering",
      "prompt design",
    ],
    load: () => import("./foundations.js"),
  },
  {
    ids: ["science", "physics", "astronomy", "biology", "neuroscience"],
    terms: ["science", "physics", "gravity", "quantum", "astronomy", "planet", "star", "biology", "dna", "cell", "neuron", "synapse"],
    load: () => import("./core-science.js"),
  },
  {
    ids: ["psychology", "health", "philosophy", "theories", "myths", "human-behavior-society", "culture", "religions"],
    terms: ["psychology", "memory", "bias", "health", "sleep", "ethics", "morality", "epistemology", "theory", "myth", "society", "behavior", "culture", "religion", "buddh", "christian", "islam", "muslim", "hindu", "judaism", "jewish"],
    load: () => import("./humanities.js"),
  },
  {
    ids: ["ai-technology", "computers-software", "prompt-engineering"],
    terms: ["ai", "artificial intelligence", "machine learning", "llm", "model", "computer", "software", "algorithm", "operating system", "prompt", "prompting"],
    load: () => import("./technology.js"),
  },
  {
    ids: ["general-knowledge", "finance-money", "education-learning", "mathematics-logic", "games-gaming", "everyday-practical"],
    terms: ["general", "critical thinking", "finance", "money", "budget", "interest", "learn", "study", "python", "math", "probability", "logic", "game", "gaming", "unit", "measurement"],
    load: () => import("./practical.js"),
  },
];

const normalize = (value = "") => String(value)
  .toLowerCase()
  .normalize("NFKC")
  .replace(/[^\p{L}\p{N}\s-]/gu, " ")
  .replace(/\s+/g, " ")
  .trim();

const phraseMatches = (normalizedPrompt, phrase) => {
  const normalizedPhrase = normalize(phrase);
  return normalizedPhrase && ` ${normalizedPrompt} `.includes(` ${normalizedPhrase} `);
};

const scoreTopic = (normalizedPrompt, topic) => {
  const matches = topic.aliases.filter((alias) => phraseMatches(normalizedPrompt, alias));
  if (!matches.length) return 0;
  return Math.max(...matches.map((match) => normalize(match).split(" ").length * 10))
    + (matches.some((match) => normalizedPrompt === normalize(match)) ? 20 : 0);
};

const selectDepth = (analysis = {}, mode = "reality") => {
  if (analysis.depth === "basic" || analysis.audience === "child" || analysis.audience === "beginner") {
    return "basic";
  }
  if (analysis.depth === "advanced" || analysis.responseLength === "detailed" || analysis.complexity === "complex") {
    return "advanced";
  }
  if (mode === "matrix" && analysis.responseLength !== "short") return "advanced";
  return "intermediate";
};

const loaderOrder = (normalizedPrompt) => {
  const ranked = CATEGORY_LOADERS.map((loader, index) => ({
    loader,
    index,
    score: loader.terms.reduce(
      (total, term) => total + (phraseMatches(normalizedPrompt, term) ? normalize(term).split(" ").length : 0),
      0,
    ),
  }));
  return ranked
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ loader }) => loader);
};

const findTopic = (categories, normalizedPrompt) => {
  let best = null;
  for (const category of categories) {
    for (const topic of category.topics) {
      const score = scoreTopic(normalizedPrompt, topic);
      if (score > (best?.score || 0)) best = { category, topic, score };
    }
  }
  return best;
};

export const getLocalKnowledgeResponse = async (prompt, analysis = {}, mode = "reality") => {
  const normalizedPrompt = normalize(prompt);
  if (!normalizedPrompt) return "";

  for (const loader of loaderOrder(normalizedPrompt)) {
    const module = await loader.load();
    const match = findTopic(module.categories, normalizedPrompt);
    if (!match) continue;

    const depth = selectDepth(analysis, mode);
    if (typeof match.topic.dynamicAnswer === "function") {
      const dynamicAnswer = match.topic.dynamicAnswer({ analysis, depth, mode, prompt });
      if (dynamicAnswer) return dynamicAnswer;
    }
    return match.topic.levels[depth]
      || match.topic.levels.intermediate
      || match.topic.levels.basic
      || "";
  }

  return "";
};

export const getKnowledgeCategoryIds = () => [
  ...new Set(CATEGORY_LOADERS.flatMap(({ ids }) => ids)),
];