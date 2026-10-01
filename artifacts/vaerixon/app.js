import "./style.css";
import {
  createConversationMemory,
  getMessageContent,
} from "./conversation-memory.js";
import { getLocalKnowledgeResponse } from "./knowledge/index.js";
import {
  buildResearchFallback,
  decideResearchRoute,
  detectFreshness,
} from "./research-routing.js";
import {
  analyzeRequest,
  getIntelligenceInstruction as buildIntelligenceInstruction,
  normalizePrompt,
} from "./intelligence.js";

const root = document.getElementById("root");
const canvas = document.getElementById("matrixCanvas");
const STORAGE_KEY = "vaerixon-console-v015";
const ENDPOINT = "https://text.pollinations.ai/";

const freshState = () => {
  const memory = createConversationMemory();
  return {
    mode: "reality",
    memory,
    messages: memory.getMessages("reality"),
    welcomeMessage: null,
    draft: "",
    isStreaming: false,
    error: "",
    zeroed: false,
    showSettings: false,
    settingsView: "root",
    showDeleteModal: false,
    showOfflineModal: false,
    controller: null,
    streamingMessageId: null,
    activityStatus: "",
    activityVisible: false,
  };
};

let state = freshState();
let wipeGeneration = 0;
let stopMatrixRain = () => {};
let matrixRainRunning = false;
let systemPrompt = "";
let hasPreviousConversation = false;
const activeControllers = new Set();

const MODE_PROMPTS = {
  reality: [
    "Respond in a clear, direct, highly professional, academic style.",
    "Organize complex answers with useful headings, numbered steps, definitions, and examples.",
    "For mathematics, show the reasoning step by step, state the rule used at each step, and verify the result.",
    "Prefer the shortest complete answer that solves the user's actual problem.",
  ].join(" "),
  matrix: [
    "Respond with deep-dive analytical context, raw signal reasoning, and precise conclusions.",
    "Explore assumptions, mechanisms, patterns, and implications without unnecessary theatrics.",
    "For mathematics, show every meaningful step, explain the rule used, and verify the result.",
    "Increase depth for genuinely complex work, but do not add detail merely to sound more intelligent.",
  ].join(" "),
};

const getWelcomeText = (mode, returning = false) => {
  const matrix = mode === "matrix";
  if (returning) {
    return matrix
      ? "Welcome back. What would you like to explore?"
      : "Welcome back. What would you like to work on?";
  }

  const hour = new Date().getHours();
  const salutation = hour < 5 || hour >= 21
    ? "Good evening"
    : hour < 12
      ? "Good morning"
      : hour < 17
        ? "Good afternoon"
        : "Good evening";
  const choices = matrix
    ? ["What would you like to explore?", "What should we work through?"]
    : ["What can I help you with?", "What would you like to work on?"];
  return `${salutation}. ${choices[Math.floor(Math.random() * choices.length)]}`;
};

const createWelcomeMessage = (mode, returning = false) => ({
  id: `welcome-${mode}-${Date.now()}`,
  role: "assistant",
  content: getWelcomeText(mode, returning),
  createdAt: Date.now(),
  isWelcome: true,
});

const safeRead = (storage, key) => {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
};

const safeWrite = (storage, key, value) => {
  try {
    storage.setItem(key, value);
  } catch {
    // The console remains usable when browser storage is blocked.
  }
};

const safeClear = (storage) => {
  try {
    storage.clear();
  } catch {
    // The in-memory reset still applies when browser storage is blocked.
  }
};

const save = () => {
  state.messages = state.memory.setMessages(state.mode, state.messages);
  safeWrite(localStorage, STORAGE_KEY, JSON.stringify({
    mode: state.mode,
    sessions: state.memory.serialize(),
  }));
};

const loadSavedState = () => {
  try {
    const saved = JSON.parse(safeRead(localStorage, STORAGE_KEY) || "null");
    if (!saved) return;
    state.mode = saved.mode === "matrix" ? "matrix" : "reality";
    const sessions = saved.sessions && typeof saved.sessions === "object"
      ? saved.sessions
      : { reality: [], matrix: [] };
    if (!saved.sessions && Array.isArray(saved.messages)) {
      sessions[state.mode] = saved.messages;
    }
    hasPreviousConversation = Object.values(sessions).some((messages) => (
      Array.isArray(messages)
      && messages.some((message) => message?.role === "user" && String(message.content || "").trim())
    ));
    state.memory = createConversationMemory(sessions);
    state.messages = state.memory.getMessages(state.mode);
  } catch {
    state = freshState();
  }
};

loadSavedState();
state.welcomeMessage = createWelcomeMessage(state.mode, hasPreviousConversation);

const systemPromptReady = fetch("./system-prompt.txt", { cache: "no-store" })
  .then((response) => (response.ok ? response.text() : ""))
  .then((prompt) => {
    systemPrompt = prompt.trim();
  })
  .catch(() => {
    systemPrompt = "";
  });

const ACTIVITY_STATUSES = Object.freeze({
  calculating: "Calculating",
  searching: "Searching",
  analyzing: "Analyzing",
  reasoning: "Reasoning",
  processing: "Processing",
  checking: "Checking",
});

let activityRevealTimer = null;

const renderActivityStatus = (label, extraClass = "") => {
  const safeLabel = Object.values(ACTIVITY_STATUSES).includes(label)
    ? label
    : ACTIVITY_STATUSES.processing;
  return `
    <span class="activity-status ${extraClass}" role="status" aria-label="${safeLabel}">
      <span class="activity-label">${safeLabel}</span>
      <span class="activity-dots" aria-hidden="true">
        <span class="activity-dot">.</span>
        <span class="activity-dot">.</span>
        <span class="activity-dot">.</span>
      </span>
    </span>
  `;
};

const clearActivityRevealTimer = () => {
  if (activityRevealTimer) {
    window.clearTimeout(activityRevealTimer);
    activityRevealTimer = null;
  }
};

const clearActivityStatus = ({ rerender = true } = {}) => {
  clearActivityRevealTimer();
  const hadActivity = state.activityStatus || state.activityVisible;
  state.activityStatus = "";
  state.activityVisible = false;
  if (rerender && hadActivity) render();
};

const setActivityStatus = (status, { defer = false } = {}) => {
  clearActivityRevealTimer();
  const nextStatus = status || "";
  const wasVisible = state.activityVisible;
  state.activityStatus = nextStatus;
  state.activityVisible = Boolean(nextStatus && (!defer || wasVisible));

  if (nextStatus && defer && !wasVisible) {
    activityRevealTimer = window.setTimeout(() => {
      activityRevealTimer = null;
      if (state.isStreaming && state.activityStatus === nextStatus) {
        state.activityVisible = true;
        render();
      }
    }, 220);
    return;
  }

  if (nextStatus || wasVisible) render();
};

const activityForPhase = (phase, analysis = {}) => {
  if (analysis.taskType === "math") return ACTIVITY_STATUSES.calculating;
  if (phase === "analysis") return ACTIVITY_STATUSES.analyzing;
  if (phase === "local") return ACTIVITY_STATUSES.checking;
  if (analysis.complexity === "complex") return ACTIVITY_STATUSES.reasoning;
  return ACTIVITY_STATUSES.processing;
};

const understandRequest = (prompt) => {
  return analyzeRequest(prompt, {
    mode: state.mode,
    conversation: state.messages,
  });
};

const getTierOneResponse = (prompt) => {
  const normalized = normalizePrompt(prompt);
  const language = understandRequest(prompt).language;
  const languageResponses = {
    english: {
      greeting: "Hello! VÆRIXON here. How can I assist you today?",
      identity: "I’m VÆRIXON. I help turn questions, ideas, and difficult problems into clear, useful answers.",
      about: "VÆRIXON is a focused thinking partner for explanations, decisions, research, and first drafts.",
      help: "I can explain difficult ideas, work through mathematics step by step, compare options, and help you shape a strong first draft. What would you like to make clear?",
      status: "Everything is ready. Ask a question whenever you’re ready.",
    },
    hindi: {
      greeting: "नमस्ते! मैं VÆRIXON हूँ। मैं आपकी कैसे सहायता कर सकता हूँ?",
      identity: "मैं VÆRIXON हूँ। मैं सवालों, विचारों और कठिन समस्याओं को स्पष्ट और उपयोगी उत्तरों में बदलने में मदद करता हूँ।",
      about: "VÆRIXON explanations, decisions, research और first drafts के लिए एक focused thinking partner है।",
      help: "मैं कठिन ideas समझा सकता हूँ, mathematics को step by step हल कर सकता हूँ और options की तुलना कर सकता हूँ। आप क्या स्पष्ट करना चाहते हैं?",
      status: "सब तैयार है। जब चाहें अपना सवाल पूछें।",
    },
    hinglish: {
      greeting: "Hello! Main VÆRIXON hoon. Main aapki kaise help kar sakta hoon?",
      identity: "Main VÆRIXON hoon. Main questions, ideas aur difficult problems ko clear, useful answers mein badalne mein help karta hoon.",
      about: "VÆRIXON explanations, decisions, research aur first drafts ke liye ek focused thinking partner hai.",
      help: "Main difficult ideas explain kar sakta hoon, mathematics step by step solve kar sakta hoon aur options compare kar sakta hoon. Aap kya clear karna chahte hain?",
      status: "Sab ready hai. Jab aap ready hon, apna question poochhiye.",
    },
  };
  const responses = languageResponses[language] || languageResponses.english;

  if (/^(hi|hello|hey|namaste|नमस्ते|हैलो|हाय)( there)?$/u.test(normalized)) {
    return responses.greeting;
  }
  if (normalized === "who are you" || /^(aap|ap) kaun ho$/.test(normalized)) {
    return responses.identity;
  }
  if (normalized === "what is vaerixon") {
    return responses.about;
  }
  if (normalized === "help") {
    return responses.help;
  }
  if (normalized === "status") {
    return responses.status;
  }

  return "";
};

const cleanAssistantOutput = (value = "") => {
  const technicalTagOnly = /^\s*[\[\(\{]?\s*(?:core online|offline core|text engine)(?:\s*[·|:=-].*)?[\]\)\}]?\s*$/i;
  return String(value)
    .split("\n")
    .filter((line) => !technicalTagOnly.test(line))
    .join("\n")
    .replace(/\b(?:core online|offline core|text engine)\b\s*[:|·=-]?\s*/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const arithmeticExpressionFromPrompt = (prompt) => {
  const candidate = String(prompt)
    .trim()
    .replace(/^(?:what is|calculate|evaluate|solve)\s+/i, "")
    .replace(/[×✕✖]/g, "*")
    .replace(/[÷]/g, "/")
    .replace(/[−–—]/g, "-")
    .replace(/[?=]+$/, "")
    .trim();

  return /^[\d+\-*/^().\s]+$/.test(candidate) ? candidate : "";
};

const evaluateArithmetic = (expression) => {
  const compact = expression.replace(/\s+/g, "");
  const tokens = compact.match(/(?:\d+(?:\.\d+)?|[()+\-*/^])/g);
  if (!tokens || tokens.join("") !== compact) return null;
  if (tokens.some((token, index) => (
    token === "-"
    && index > 0
    && ["+", "-", "*", "/", "^", "("].includes(tokens[index - 1])
  ))) return null;
  if (tokens[0] === "-") tokens.unshift("0");

  const precedence = { "+": 1, "-": 1, "*": 2, "/": 2, "^": 3 };
  const values = [];
  const operators = [];

  const applyTopOperator = () => {
    const operator = operators.pop();
    const right = values.pop();
    const left = values.pop();
    if (left === undefined || right === undefined) throw new Error("invalid expression");
    if (operator === "/" && right === 0) throw new Error("division by zero");
    values.push({
      "+": () => left + right,
      "-": () => left - right,
      "*": () => left * right,
      "/": () => left / right,
      "^": () => left ** right,
    }[operator]());
  };

  try {
    tokens.forEach((token) => {
      if (/^\d/.test(token)) {
        values.push(Number(token));
        return;
      }
      if (token === "(") {
        operators.push(token);
        return;
      }
      if (token === ")") {
        while (operators.length && operators.at(-1) !== "(") applyTopOperator();
        if (operators.pop() !== "(") throw new Error("invalid expression");
        return;
      }

      while (
        operators.length
        && operators.at(-1) !== "("
        && precedence[operators.at(-1)] >= precedence[token]
        && token !== "^"
      ) {
        applyTopOperator();
      }
      operators.push(token);
    });

    while (operators.length) {
      if (operators.at(-1) === "(") throw new Error("invalid expression");
      applyTopOperator();
    }

    if (values.length !== 1 || !Number.isFinite(values[0])) return null;
    return values[0];
  } catch {
    return null;
  }
};

const getOfflineMathResponse = (prompt, analysis = {}) => {
  const expression = arithmeticExpressionFromPrompt(prompt);
  if (!expression) return "";
  const result = evaluateArithmetic(expression);
  if (result === null) return "";
  const language = analysis.language || "english";

  const compact = expression.replace(/\s+/g, "");
  if (compact === "100-12*2+1") {
    if (language === "hindi") {
      return [
        "**100 - 12 × 2 + 1** को order of operations के अनुसार हल करते हैं।",
        "",
        "1. पहले multiplication: **12 × 2 = 24**।",
        "2. अब expression: **100 - 24 + 1**।",
        "3. बाएँ से दाएँ हल करें: **100 - 24 = 76**, फिर **76 + 1 = 77**।",
        "",
        "**अंतिम उत्तर: 77**",
      ].join("\n");
    }
    if (language === "hinglish") {
      return [
        "**100 - 12 × 2 + 1** ko order of operations ke according solve karte hain.",
        "",
        "1. Pehle multiplication: **12 × 2 = 24**.",
        "2. Expression ab **100 - 24 + 1** hai.",
        "3. Left se right solve karein: **100 - 24 = 76**, phir **76 + 1 = 77**.",
        "",
        "**Final answer: 77**",
      ].join("\n");
    }
    return [
      "Let’s solve **100 - 12 × 2 + 1** using the order of operations.",
      "",
      "1. Multiply first: **12 × 2 = 24**.",
      "2. Substitute: **100 - 24 + 1**.",
      "3. Work left to right: **100 - 24 = 76**, then **76 + 1 = 77**.",
      "",
      "**Final answer: 77**",
    ].join("\n");
  }

  if (language === "hindi") {
    return [
      `**${expression}** को step by step हल करते हैं।`,
      "",
      "1. Addition या subtraction से पहले multiplication, division और exponents लागू करें।",
      "2. बाकी operations को बाएँ से दाएँ हल करें।",
      `3. परिणाम **${result}** है।`,
    ].join("\n");
  }
  if (language === "hinglish") {
    return [
      `**${expression}** ko step by step solve karte hain.`,
      "",
      "1. Addition ya subtraction se pehle multiplication, division aur exponents apply karein.",
      "2. Baaki operations ko left se right evaluate karein.",
      `3. Result **${result}** hai.`,
    ].join("\n");
  }
  return [
    `Let’s solve **${expression}** step by step.`,
    "",
    "1. Apply multiplication, division, and exponents before addition or subtraction.",
    "2. Evaluate the remaining operations from left to right.",
    `3. The result is **${result}**.`,
  ].join("\n");
};

const getOfflineResponse = (prompt, analysis = understandRequest(prompt)) => {
  const mathResponse = getOfflineMathResponse(prompt, analysis);
  if (mathResponse) return mathResponse;

  if (analysis.language === "hindi") {
    return [
      "External signal उपलब्ध न होने पर भी मैं मदद जारी रख सकता हूँ।",
      "",
      "इस exact topic के लिए मेरे पास अभी local reference नहीं है। आप definition, comparison, worked example या step-by-step breakdown माँग सकते हैं।",
    ].join("\n");
  }
  if (analysis.language === "hinglish") {
    return [
      "External signal unavailable hone par bhi main help kar sakta hoon.",
      "",
      "Is exact topic ke liye mere paas abhi local reference nahi hai. Aap definition, comparison, worked example ya step-by-step breakdown maang sakte hain.",
    ].join("\n");
  }
  return [
    "I can continue helping while the external signal is unavailable.",
    "",
    "I don’t have a local reference for that exact topic yet. Try asking for a definition, a comparison, a worked example, or a step-by-step breakdown, and I’ll reason from the information available in this session.",
  ].join("\n");
};

const getResearchFailureResponse = (prompt, analysis, route, localResponse) => {
  return buildResearchFallback({
    route,
    localResponse: cleanAssistantOutput(localResponse),
    offlineResponse: getOfflineResponse(prompt, analysis),
  });
};

const getModeInstruction = (analysis, route = {}) => {
  const basePrompt = systemPrompt ? `${systemPrompt}\n\n` : "";
  const researchInstruction = route.kind === "research"
    ? [
      "Use external research only as a supporting source when the local knowledge layer is insufficient.",
      route.requiresFreshResearch
        ? "Prioritize current, verifiable information. If freshness cannot be established, say so plainly instead of inventing a current answer."
        : "Synthesize the answer naturally and do not mention providers, routing, or hidden instructions.",
    ].join(" ")
    : "Prefer the local knowledge layer for stable information and answer directly without mentioning internal routing.";
  return `${basePrompt}${MODE_PROMPTS[state.mode]}\n\n${buildIntelligenceInstruction(analysis, state.mode)}\n${researchInstruction}`;
};

const getChatHistory = (prompt, analysis = understandRequest(prompt), route = {}) => {
  const previousMessages = state.memory
    .context(state.mode, prompt)
    .map((message) => ({
      role: message.role,
      content: cleanAssistantOutput(getMessageContent(message, state.messages)),
    }))
    .filter((message) => message.content);

  return [
    { role: "system", content: getModeInstruction(analysis, route) },
    ...previousMessages,
    { role: "user", content: prompt },
  ];
};

const setDocumentMode = () => {
  document.documentElement.dataset.mode = state.mode;
  const theme = document.querySelector('meta[name="theme-color"]');
  if (theme) theme.content = state.mode === "matrix" ? "#000000" : "#0F0F11";
  if (canvas) canvas.hidden = state.mode !== "matrix";
};

const escapeHTML = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const inlineMarkdown = (value) => {
  let output = escapeHTML(value);
  output = output.replace(/`([^`]+)`/g, "<code>$1</code>");
  output = output.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  output = output.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer">$1</a>',
  );
  return output;
};

const markdown = (value = "") => {
  const lines = String(value).split("\n");
  const blocks = [];
  let code = false;
  let language = "";
  let codeLines = [];
  let paragraph = [];
  let list = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(`<p>${paragraph.map(inlineMarkdown).join("<br>")}</p>`);
    paragraph = [];
  };

  const flushList = () => {
    if (!list.length) return;
    blocks.push(`<ul>${list.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("")}</ul>`);
    list = [];
  };

  const flushCode = () => {
    blocks.push(
      `<pre><code class="language-${escapeHTML(language)}">${escapeHTML(codeLines.join("\n"))}</code></pre>`,
    );
    codeLines = [];
    language = "";
  };

  lines.forEach((line) => {
    if (line.startsWith("```")) {
      if (code) flushCode();
      else {
        flushParagraph();
        flushList();
        language = line.slice(3).trim() || "text";
      }
      code = !code;
      return;
    }
    if (code) {
      codeLines.push(line);
      return;
    }
    if (!line.trim()) {
      flushParagraph();
      flushList();
      return;
    }
    if (/^###\s+/.test(line)) {
      flushParagraph();
      flushList();
      blocks.push(`<h3>${inlineMarkdown(line.replace(/^###\s+/, ""))}</h3>`);
      return;
    }
    if (/^[-*]\s+/.test(line)) {
      flushParagraph();
      list.push(line.replace(/^[-*]\s+/, ""));
      return;
    }
    paragraph.push(line);
  });

  if (code) flushCode();
  flushParagraph();
  flushList();
  return blocks.join("");
};

const formatTime = (timestamp) => new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
}).format(new Date(timestamp));

const renderMessage = (message) => {
  const assistant = message.role === "assistant";
  const messageContent = getMessageContent(message, state.messages);
  const content = assistant
    ? markdown(messageContent)
    : `<p>${inlineMarkdown(messageContent).replace(/\n/g, "<br>")}</p>`;
  const activity = message.streaming
    && message.id === state.streamingMessageId
    && state.activityVisible
    ? renderActivityStatus(state.activityStatus)
    : "";

  return `
    <article class="message" data-role="${assistant ? "assistant" : "user"}" data-message-id="${message.id}">
      <div class="message-label">${assistant ? "VÆRIXON" : "YOU"}</div>
      <div class="message-content">
        ${content}${activity}
        <div class="message-meta">${formatTime(message.createdAt)}</div>
      </div>
    </article>
  `;
};

const renderMessages = (shouldScroll = true) => {
  const target = document.querySelector("[data-messages]");
  if (!target) return;

  if (!state.messages.length) {
    target.innerHTML = `
      <div class="empty-state">
        <h2>What's on your mind?</h2>
        ${state.welcomeMessage
          ? `<p class="welcome-greeting" role="status">${escapeHTML(state.welcomeMessage.content)}</p>`
          : ""}
      </div>
    `;
  } else {
    const visibleMessages = state.welcomeMessage
      ? [...state.messages, state.welcomeMessage]
      : state.messages;
    target.innerHTML = visibleMessages.map(renderMessage).join("");
  }

  if (shouldScroll) target.scrollTop = target.scrollHeight;
};

const matrixCanvas = () => {
  if (!canvas || state.mode !== "matrix" || matrixRainRunning) return;

  const context = canvas.getContext("2d", { alpha: false });
  if (!context) return;
  context.imageSmoothingEnabled = false;

  let width = 0;
  let height = 0;
  let backgroundColumns = [];
  let foregroundColumns = [];
  let frame = 0;
  let stopped = false;
  let previousTime = 0;

  const createColumns = ({
    spacing,
    offset,
    minLength,
    maxLength,
    minSpeed,
    maxSpeed,
    opacity,
  }) => Array.from(
    { length: Math.ceil(width / spacing) + 2 },
    (_, index) => {
      const length = minLength + Math.floor(Math.random() * (maxLength - minLength + 1));
      return {
        x: index * spacing + offset,
        y: -Math.random() * (height + length * 28),
        speed: minSpeed + Math.random() * (maxSpeed - minSpeed),
        fontSize: 20,
        opacity,
        bits: Array.from(
          { length },
          () => (Math.random() < 0.5 ? "0" : "1"),
        ),
      };
    },
  );

  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    const fontSize = Math.max(18, Math.min(24, Math.round(width / 64)));
    const backgroundSpacing = Math.max(25, Math.round(fontSize * 1.55));
    const foregroundSpacing = Math.max(28, Math.round(fontSize * 1.8));
    canvas.width = Math.max(1, Math.floor(width * ratio));
    canvas.height = Math.max(1, Math.floor(height * ratio));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = "#000000";
    context.fillRect(0, 0, width, height);
    backgroundColumns = createColumns({
      spacing: backgroundSpacing,
      offset: Math.round(backgroundSpacing * 0.35),
      minLength: 8,
      maxLength: 18,
      minSpeed: 0.035,
      maxSpeed: 0.055,
      opacity: 0.35,
    }).map((column) => ({ ...column, fontSize: Math.max(16, fontSize - 2) }));
    foregroundColumns = createColumns({
      spacing: foregroundSpacing,
      offset: Math.round(foregroundSpacing * 0.5),
      minLength: 11,
      maxLength: 22,
      minSpeed: 0.055,
      maxSpeed: 0.08,
      opacity: 1,
    }).map((column) => ({ ...column, fontSize }));
  };

  const drawLayer = (columns, color, elapsed) => {
    columns.forEach((column) => {
      column.y += column.speed * elapsed;
      context.font = `700 ${column.fontSize}px "DM Mono", "Courier New", monospace`;
      context.fillStyle = color;
      context.globalAlpha = column.opacity;

      column.bits.forEach((bit, index) => {
        const y = column.y - index * column.fontSize;
        if (y < -column.fontSize || y > height) return;
        context.fillText(bit, Math.round(column.x), Math.round(y));
      });

      if (column.y > height + column.bits.length * column.fontSize) {
        column.y = -Math.random() * Math.max(height * 0.7, 1)
          - column.bits.length * column.fontSize;
      }
    });
  };

  const draw = (time) => {
    if (stopped) return;
    const elapsed = previousTime ? Math.min(time - previousTime, 64) : 16;
    previousTime = time;

    context.globalAlpha = 1;
    context.fillStyle = "#000000";
    context.fillRect(0, 0, width, height);
    context.textBaseline = "top";
    drawLayer(backgroundColumns, "#00FF41", elapsed);
    drawLayer(foregroundColumns, "#00FF66", elapsed);
    context.globalAlpha = 1;

    frame = requestAnimationFrame(draw);
  };

  const destroy = () => {
    if (!matrixRainRunning) return;
    stopped = true;
    cancelAnimationFrame(frame);
    window.removeEventListener("resize", resize);
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    matrixRainRunning = false;
    stopMatrixRain = () => {};
  };

  resize();
  window.addEventListener("resize", resize, { passive: true });
  matrixRainRunning = true;
  stopMatrixRain = destroy;
  frame = requestAnimationFrame(draw);
};

const syncMatrixRain = ({ reset = false } = {}) => {
  if (state.mode !== "matrix") {
    if (matrixRainRunning) stopMatrixRain();
    return;
  }

  if (reset && matrixRainRunning) stopMatrixRain();
  if (!matrixRainRunning) matrixCanvas();
};

const settingsMarkup = () => {
  if (!state.showSettings) return "";

  if (state.settingsView === "privacy") {
    return `
      <div class="settings-backdrop" data-settings-backdrop>
        <section class="settings-panel" role="dialog" aria-modal="true" aria-labelledby="privacy-title">
          <div class="settings-header">
            <button class="settings-back" data-action="settings-back" aria-label="Back to Settings">BACK</button>
            <button class="settings-close" data-action="settings-close" aria-label="Close Settings">×</button>
          </div>
          <div class="settings-kicker">Settings</div>
          <h2 id="privacy-title">Privacy &amp; Data</h2>
          <div class="settings-actions">
            <button class="settings-action danger" data-action="delete-open">Delete All</button>
          </div>
        </section>
      </div>
    `;
  }

  return `
    <div class="settings-backdrop" data-settings-backdrop>
      <section class="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div class="settings-header">
          <div class="settings-kicker">Settings</div>
          <button class="settings-close" data-action="settings-close" aria-label="Close Settings">×</button>
        </div>
        <h2 id="settings-title">Settings</h2>
        <button class="settings-section" data-action="settings-privacy">
          <span>Privacy &amp; Data</span>
          <span aria-hidden="true">→</span>
        </button>
      </section>
    </div>
  `;
};

const consoleMarkup = () => `
  <div class="app mode-${state.mode}">
    <header class="topbar">
      <div>
        <a class="brand" href="/" data-action="home">VÆRIXON</a>
      </div>
      <div class="mode-switch" role="group" aria-label="Interface mode">
        <button class="mode-button" aria-pressed="${state.mode === "reality"}" data-action="mode" data-mode="reality">Reality</button>
        <button class="mode-button" aria-pressed="${state.mode === "matrix"}" data-action="mode" data-mode="matrix">Matrix</button>
      </div>
      <div class="top-actions">
        ${state.activityVisible ? `<div class="system-state" aria-live="polite"><span class="state-dot"></span>${renderActivityStatus(state.activityStatus, "activity-status--topbar")}</div>` : ""}
        <button class="settings-button" data-action="settings-open" aria-label="Open Settings">Settings</button>
      </div>
    </header>
    <main class="workspace">
      <section class="conversation-shell" aria-label="Conversation">
        <div class="messages" data-messages role="log" aria-live="polite"></div>
        <form class="composer" data-composer>
          <div class="composer-wrap">
            <textarea data-prompt-input rows="1" aria-label="Prompt" placeholder="Ask VÆRIXON">${escapeHTML(state.draft)}</textarea>
            <button
              class="send-button ${state.isStreaming ? "stop" : ""}"
              type="${state.isStreaming ? "button" : "submit"}"
              data-action="${state.isStreaming ? "stop" : "send"}"
              aria-label="${state.isStreaming ? "Stop generation" : "Send message"}"
              ${state.isStreaming || state.draft.trim() ? "" : "hidden"}
            >${state.isStreaming ? "×" : "↑"}</button>
          </div>
        </form>
      </section>
    </main>
    ${state.error ? `<div class="error-banner" role="alert">${escapeHTML(state.error)}</div>` : ""}
    ${settingsMarkup()}
    ${state.showDeleteModal ? `
      <div class="modal-backdrop" data-modal-backdrop>
        <section class="modal" role="dialog" aria-modal="true" aria-labelledby="delete-title">
          <button class="modal-close" data-action="delete-cancel" aria-label="Close confirmation">×</button>
          <div class="modal-kicker">Privacy &amp; Data</div>
          <h2 id="delete-title">Delete all data?</h2>
          <p>Are you sure you want to delete all data?</p>
          <div class="modal-actions">
            <button data-action="delete-cancel">CANCEL</button>
            <button class="danger" data-action="delete-confirm">DELETE</button>
          </div>
        </section>
      </div>
    ` : ""}
    ${state.showOfflineModal ? `
      <div class="modal-backdrop" data-modal-backdrop data-offline-backdrop>
        <section class="modal" role="dialog" aria-modal="true" aria-labelledby="offline-title">
          <div class="modal-kicker">Verification unavailable</div>
          <h2 id="offline-title">CURRENT INFORMATION UNAVAILABLE</h2>
          <p>I couldn’t verify fresh information just now. Stable local knowledge remains available.</p>
          <div class="modal-actions">
            <button data-action="offline-dismiss">Continue</button>
          </div>
        </section>
      </div>
    ` : ""}
  </div>
`;

const zeroedMarkup = () => `
  <main class="zeroed-screen">
    <div class="zeroed-inner">
      <div class="zeroed-mark">VÆRIXON // LOCAL MEMORY</div>
      <h1>System Zeroed.</h1>
      <p>The console is clean. No prompts, responses, or mode preference remain on this device. Begin again only when you mean to.</p>
      <button data-action="initialize">Initialize fresh console</button>
    </div>
  </main>
`;

const updateComposer = () => {
  const textarea = document.querySelector("[data-prompt-input]");
  if (!textarea) return;
  const sendButton = document.querySelector('[data-action="send"]');
  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
  if (sendButton) sendButton.hidden = !textarea.value.trim();
};

const render = ({ resetMatrixRain = false } = {}) => {
  setDocumentMode();
  if (state.zeroed) {
    root.innerHTML = zeroedMarkup();
    bindEvents();
    stopMatrixRain();
    return;
  }

  root.innerHTML = consoleMarkup();
  renderMessages(false);
  bindEvents();
  syncMatrixRain({ reset: resetMatrixRain });
  const messages = document.querySelector("[data-messages]");
  if (messages && state.messages.length) messages.scrollTop = messages.scrollHeight;
};

const setError = (message) => {
  state.error = message;
  render();
};

const addMessage = (role, content, extra = {}) => {
  const message = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    content,
    createdAt: Date.now(),
    ...extra,
  };
  state.memory.append(state.mode, message);
  state.messages = state.memory.getMessages(state.mode);
  save();
  return message;
};

const extractText = (payload) => {
  let value = String(payload || "").trim();
  if (!value || value === "[DONE]") return "";
  if (value.startsWith("data:")) value = value.slice(5).trim();
  if (!value || value === "[DONE]") return "";

  try {
    const parsed = JSON.parse(value);
    return parsed.choices?.[0]?.delta?.content
      || parsed.choices?.[0]?.message?.content
      || parsed.choices?.[0]?.text
      || parsed.response
      || parsed.content
      || parsed.text
      || "";
  } catch {
    return value;
  }
};

const appendAssistantText = (assistant, text) => {
  if (!text) return;
  assistant.content = cleanAssistantOutput(`${assistant.content}${text}`);
  renderMessages(true);
};

const consumeResponse = async (response, assistant, controller) => {
  const contentType = response.headers.get("content-type") || "";
  if (!response.body || typeof response.body.getReader !== "function") {
    appendAssistantText(assistant, extractText(await response.text()));
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const isSse = contentType.includes("text/event-stream") || contentType.includes("application/x-ndjson");
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (controller.signal.aborted) throw new DOMException("Generation stopped", "AbortError");

    const decoded = decoder.decode(value, { stream: true });
    if (!isSse) {
      buffer += decoded;
      if (contentType.includes("application/json")) continue;
      appendAssistantText(assistant, decoded);
      continue;
    }

    buffer += decoded;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    lines.forEach((line) => appendAssistantText(assistant, extractText(line)));
  }

  const tail = decoder.decode();
  if (isSse) {
    appendAssistantText(assistant, extractText(`${buffer}${tail}`));
  } else if (contentType.includes("application/json")) {
    appendAssistantText(assistant, extractText(buffer + tail));
  } else if (tail) {
    appendAssistantText(assistant, tail);
  }
};

const requestResponse = async (
  prompt,
  controller,
  analysis = understandRequest(prompt),
  route = {},
) => {
  if (controller.signal.aborted) {
    throw new DOMException("Generation stopped", "AbortError");
  }

  const response = await fetch(`${ENDPOINT}?stream=true`, {
    method: "POST",
    headers: {
      Accept: "text/event-stream, text/plain, application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: getChatHistory(prompt, analysis, route),
      model: "openai",
    }),
    signal: controller.signal,
  });
  const contentType = response.headers.get("content-type") || "";

  if (!response.ok || contentType.includes("text/html")) {
    if (response.body?.cancel) await response.body.cancel();
    throw new Error("Primary external signal unavailable");
  }

  return response;
};

const streamAnswer = async (prompt, assistant, controller, generation) => {
  const analysis = understandRequest(prompt);
  let localKnowledgeResponse = "";
  let route = {};
  setActivityStatus(activityForPhase("analysis", analysis), { defer: true });
  try {
    const localResponse = getTierOneResponse(prompt);
    if (localResponse) {
      setActivityStatus(activityForPhase("local", analysis));
      assistant.content = cleanAssistantOutput(localResponse);
      assistant.streaming = false;
      state.isStreaming = false;
      state.controller = null;
      state.streamingMessageId = null;
      state.error = "";
      clearActivityStatus({ rerender: false });
      save();
      render();
      return;
    }

    try {
      if (analysis.language === "english") {
        localKnowledgeResponse = await getLocalKnowledgeResponse(prompt, analysis, state.mode);
      }
    } catch {
      localKnowledgeResponse = "";
    }

    route = analysis.language === "english"
      ? decideResearchRoute({
        prompt,
        localResponse: localKnowledgeResponse,
        conversation: getChatHistory(prompt, analysis).slice(1, -1),
      })
      : {
        kind: "research",
        requiresFreshResearch: false,
        reason: "The primary text model should answer in the user's detected language.",
      };

    if (route.kind === "local") {
      setActivityStatus(activityForPhase("local", analysis));
      assistant.content = cleanAssistantOutput(localKnowledgeResponse);
      assistant.streaming = false;
      state.isStreaming = false;
      state.controller = null;
      state.streamingMessageId = null;
      state.error = "";
      clearActivityStatus({ rerender: false });
      save();
      render();
      return;
    }

    setActivityStatus(activityForPhase("external", analysis));
    await systemPromptReady;
    const response = await requestResponse(prompt, controller, analysis, route);
    await consumeResponse(response, assistant, controller);
    if (generation !== wipeGeneration) return;
    assistant.streaming = false;
    state.isStreaming = false;
    state.controller = null;
    state.streamingMessageId = null;
    state.error = "";
    assistant.content = cleanAssistantOutput(assistant.content)
      || "I couldn't complete that response. Please try again.";
    clearActivityStatus({ rerender: false });
    save();
    render();
  } catch (error) {
    if (generation !== wipeGeneration) return;
    const stopped = error?.name === "AbortError" || controller.signal.aborted;
    if (stopped) {
      assistant.content = cleanAssistantOutput(assistant.content)
        || "Generation stopped by operator.";
    } else {
      assistant.content = cleanAssistantOutput(
        getResearchFailureResponse(prompt, analysis, route, localKnowledgeResponse),
      );
    }
    assistant.streaming = false;
    state.isStreaming = false;
    state.controller = null;
    state.streamingMessageId = null;
    state.error = stopped
      ? "Generation stopped. The partial response remains in the console."
      : "";
    state.showOfflineModal = !stopped;
    clearActivityStatus({ rerender: false });
    save();
    render();
  }
};

const stopStreaming = () => {
  const controller = state.controller;
  if (!controller) return;
  controller.abort();
  const assistant = state.messages.find((message) => message.id === state.streamingMessageId);
  if (assistant) assistant.streaming = false;
  state.isStreaming = false;
  state.controller = null;
  state.streamingMessageId = null;
  state.error = "Generation stopped. The partial response remains in the console.";
  clearActivityStatus({ rerender: false });
  save();
  render();
};

const sendPrompt = async (value) => {
  const prompt = String(value || "").trim();
  if (!prompt || state.isStreaming) return;

  const classification = state.memory.classify(state.mode, prompt);
  const freshness = detectFreshness(prompt);
  state.welcomeMessage = null;
  hasPreviousConversation = true;
  state.draft = "";
  state.error = "";
  addMessage("user", prompt);

  if (
    classification.kind === "exact"
    && classification.sameContext
    && classification.answerMessage
    && !freshness.requiresFreshResearch
  ) {
    addMessage("assistant", "", {
      reuseOf: classification.answerMessage.id,
      reused: true,
    });
    state.isStreaming = false;
    state.controller = null;
    state.streamingMessageId = null;
    save();
    render();
    return;
  }

  const assistant = addMessage("assistant", "", { streaming: true });
  const controller = new AbortController();
  const generation = wipeGeneration;

  state.isStreaming = true;
  state.controller = controller;
  state.streamingMessageId = assistant.id;
  activeControllers.add(controller);
  save();
  render();

  try {
    await streamAnswer(prompt, assistant, controller, generation);
  } finally {
    activeControllers.delete(controller);
    if (generation === wipeGeneration && state.controller === controller) {
      state.controller = null;
      state.streamingMessageId = null;
      state.isStreaming = false;
      clearActivityStatus({ rerender: false });
    }
  }
};

const deleteAll = () => {
  wipeGeneration += 1;
  clearActivityRevealTimer();
  activeControllers.forEach((controller) => controller.abort());
  activeControllers.clear();
  if (state.controller) state.controller.abort();
  stopMatrixRain();
  safeClear(localStorage);
  safeClear(sessionStorage);
  hasPreviousConversation = false;
  const messages = document.querySelector("[data-messages]");
  if (messages) messages.replaceChildren();
  root.replaceChildren();
  state = { ...freshState(), zeroed: true };
  setDocumentMode();
  render();
};

const bindEvents = () => {
  document.querySelectorAll("[data-action]").forEach((element) => {
    element.addEventListener("click", (event) => {
      const action = element.dataset.action;
      if (action === "send") return;
      event.preventDefault();

      if (action === "home") {
        if (!state.isStreaming) render();
        return;
      }
      if (action === "mode") {
        if (state.isStreaming || state.mode === element.dataset.mode) return;
        state.messages = state.memory.setMessages(state.mode, state.messages);
        state.mode = element.dataset.mode;
        state.messages = state.memory.getMessages(state.mode);
        const hasModeHistory = state.messages.some((message) => message.role === "user");
        state.welcomeMessage = createWelcomeMessage(
          state.mode,
          hasPreviousConversation || hasModeHistory,
        );
        state.draft = "";
        state.error = "";
        save();
        render({ resetMatrixRain: true });
        return;
      }
      if (action === "settings-open") {
        state.showSettings = true;
        state.settingsView = "root";
        render();
        return;
      }
      if (action === "settings-close") {
        state.showSettings = false;
        state.settingsView = "root";
        render();
        return;
      }
      if (action === "settings-privacy") {
        state.settingsView = "privacy";
        render();
        return;
      }
      if (action === "settings-back") {
        state.settingsView = "root";
        render();
        return;
      }
      if (action === "delete-open") {
        state.showDeleteModal = true;
        render();
        return;
      }
      if (action === "delete-cancel") {
        state.showDeleteModal = false;
        render();
        return;
      }
      if (action === "offline-dismiss") {
        state.showOfflineModal = false;
        render();
        return;
      }
      if (action === "delete-confirm") {
        deleteAll();
        return;
      }
      if (action === "initialize") {
        state = freshState();
        hasPreviousConversation = false;
        state.welcomeMessage = createWelcomeMessage(state.mode);
        save();
        render();
        return;
      }
      if (action === "stop") {
        stopStreaming();
        return;
      }
    });
  });

  const composer = document.querySelector("[data-composer]");
  const input = document.querySelector("[data-prompt-input]");
  if (composer && input) {
    input.addEventListener("input", () => {
      state.draft = input.value;
      updateComposer();
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        composer.requestSubmit();
      }
    });
    composer.addEventListener("submit", (event) => {
      event.preventDefault();
      if (state.isStreaming) stopStreaming();
      else void sendPrompt(input.value);
    });
    updateComposer();
  }

  document.querySelectorAll("[data-modal-backdrop]").forEach((modal) => {
    const offlineModal = modal.hasAttribute("data-offline-backdrop");
    const dialog = modal.querySelector(".modal");
    if (dialog) {
      dialog.tabIndex = -1;
      dialog.focus();
      dialog.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          if (offlineModal) state.showOfflineModal = false;
          else state.showDeleteModal = false;
          render();
        }
      });
    }
    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        if (offlineModal) state.showOfflineModal = false;
        else state.showDeleteModal = false;
        render();
      }
    });
  });

  document.querySelectorAll("[data-settings-backdrop]").forEach((backdrop) => {
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) {
        state.showSettings = false;
        state.settingsView = "root";
        render();
      }
    });
  });
};

render();