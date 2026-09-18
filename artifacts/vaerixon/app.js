import "./style.css";

const root = document.getElementById("root");
const canvas = document.getElementById("matrixCanvas");
const STORAGE_KEY = "vaerixon-console-v012";
const ENDPOINT = "https://text.pollinations.ai/";
const MODEL = "openai";
const DEFAULT_SYSTEM_PROMPT = "VÆRIXON — Domain-Agnostic, Hyper-Logical Intelligence Core. Be objective, practical, accurate, and direct.";

const freshState = () => ({
  mode: "reality",
  messages: [],
  draft: "",
  isStreaming: false,
  error: "",
  zeroed: false,
  showDeleteModal: false,
  controller: null,
});

let state = freshState();
let wipeGeneration = 0;
let stopMatrixRain = () => {};
let activeReader = null;
let systemPrompt = DEFAULT_SYSTEM_PROMPT;
const activeControllers = new Set();

const systemPromptReady = fetch("./system-prompt.txt", { cache: "no-store" })
  .then(async (response) => {
    if (!response.ok) throw new Error(`System prompt returned ${response.status}`);
    const prompt = await response.text();
    if (prompt.trim()) systemPrompt = prompt.trim();
  })
  .catch(() => {});

try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  if (saved) {
    state.mode = saved.mode === "matrix" ? "matrix" : "reality";
    state.messages = Array.isArray(saved.messages) ? saved.messages : [];
  }
} catch {
  state = freshState();
}

const save = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      mode: state.mode,
      messages: state.messages,
    }));
  } catch {
    // The console remains usable when browser storage is unavailable.
  }
};

const escapeHTML = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const inlineMarkdown = (value = "") => {
  let output = escapeHTML(value);
  output = output.replace(/`([^`]+)`/g, "<code>$1</code>");
  output = output.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  output = output.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  return output;
};

const markdown = (value = "") => {
  const lines = String(value).split("\n");
  const blocks = [];
  let inCode = false;
  let codeLanguage = "";
  let codeLines = [];
  let paragraph = [];
  let list = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push(`<p>${paragraph.map(inlineMarkdown).join("<br>")}</p>`);
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list.length) {
      blocks.push(`<ul>${list.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("")}</ul>`);
      list = [];
    }
  };
  const flushCode = () => {
    blocks.push(`<pre><code class="language-${escapeHTML(codeLanguage)}">${escapeHTML(codeLines.join("\n"))}</code></pre>`);
    codeLines = [];
    codeLanguage = "";
  };

  lines.forEach((line) => {
    if (line.startsWith("```")) {
      if (inCode) flushCode();
      else {
        flushParagraph();
        flushList();
        codeLanguage = line.slice(3).trim() || "text";
      }
      inCode = !inCode;
      return;
    }
    if (inCode) {
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
  if (inCode) flushCode();
  flushParagraph();
  flushList();
  return blocks.join("") || '<p class="muted-copy">No signal returned.</p>';
};

const formatTime = (timestamp) => new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
}).format(new Date(timestamp));

const renderMessage = (message) => {
  const assistant = message.role === "assistant";
  const content = assistant
    ? markdown(message.content)
    : `<p>${inlineMarkdown(message.content).replace(/\n/g, "<br>")}</p>`;
  const typing = message.streaming && !message.content
    ? '<span class="typing" aria-label="Generating"><i></i><i></i><i></i></span>'
    : "";
  const options = message.options?.length
    ? `<div class="clarification">${message.options.map((option) => `<button class="clarification-button" data-action="clarify" data-option="${escapeHTML(option)}">${escapeHTML(option)}</button>`).join("")}</div>`
    : "";
  const streamLabel = message.streaming ? " · LIVE" : "";
  return `
    <article class="message" data-role="${message.role}" data-message-id="${message.id}">
      <div class="message-label">${assistant ? "VÆRIXON" : "YOU"}</div>
      <div class="message-content">
        ${content}${typing}${options}
        <div class="message-meta">${formatTime(message.createdAt)}${streamLabel}</div>
      </div>
    </article>
  `;
};

const renderMessages = (shouldScroll = true) => {
  const target = document.querySelector("[data-messages]");
  if (!target) return;
  target.innerHTML = state.messages.length
    ? state.messages.map(renderMessage).join("")
    : `
      <div class="empty-state">
        <div class="empty-inner">
          <div class="signal" aria-hidden="true">+</div>
          <h2>Ask the instrument.</h2>
          <p>VÆRIXON turns an empty prompt into a precise, streaming answer. No persona. No performance. Just signal.</p>
          <div class="suggestions">
            <button class="suggestion" data-action="suggestion" data-prompt="Build a practical decision framework">Decision framework</button>
            <button class="suggestion" data-action="suggestion" data-prompt="Explain the second law of thermodynamics">Explain a hard idea</button>
            <button class="suggestion" data-action="suggestion" data-prompt="Write a focused project brief">Write a project brief</button>
          </div>
        </div>
      </div>
    `;
  if (shouldScroll) target.scrollTop = target.scrollHeight;
};

const startMatrixRain = () => {
  stopMatrixRain();
  if (!canvas || state.mode !== "matrix" || state.zeroed) {
    if (canvas) canvas.style.display = "none";
    return;
  }

  canvas.style.display = "block";
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) return;

  let width = 0;
  let height = 0;
  let columns = [];
  let raf = 0;
  let lastTime = performance.now();
  let running = true;
  const fontSize = window.innerWidth < 640 ? 18 : 20;
  const speed = 0.055;

  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.font = `700 ${fontSize}px "DM Mono", monospace`;
    context.textBaseline = "top";
    context.fillStyle = "#000000";
    context.fillRect(0, 0, width, height);
    columns = Array.from(
      { length: Math.ceil(width / fontSize) + 1 },
      () => -Math.random() * height,
    );
  };

  const draw = (timestamp) => {
    if (!running) return;
    const elapsed = Math.min(timestamp - lastTime, 50);
    lastTime = timestamp;
    context.fillStyle = "rgba(0, 0, 0, 0.08)";
    context.fillRect(0, 0, width, height);
    context.font = `700 ${fontSize}px "DM Mono", monospace`;
    context.fillStyle = "#00FF66";
    columns.forEach((y, index) => {
      const x = index * fontSize;
      const char = (index + Math.floor(y / fontSize)) % 2 === 0 ? "0" : "1";
      context.fillText(char, x, y);
      const nextY = y + speed * elapsed;
      columns[index] = nextY > height + fontSize * 3
        ? -fontSize * (2 + Math.random() * 12)
        : nextY;
    });
    raf = requestAnimationFrame(draw);
  };

  resize();
  window.addEventListener("resize", resize, { passive: true });
  raf = requestAnimationFrame(draw);
  stopMatrixRain = () => {
    if (!running) return;
    running = false;
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    context.clearRect(0, 0, width, height);
    canvas.style.display = "none";
    stopMatrixRain = () => {};
  };
};

const consoleMarkup = () => `
  <div class="app mode-${state.mode}">
    <header class="topbar">
      <div>
        <a class="brand" href="/" data-action="home">VÆRIXON <span class="brand-mark">/ 0.1.2</span><span class="brand-subtitle">Wake up to Reality.</span></a>
      </div>
      <div class="mode-switch" role="group" aria-label="Interface mode">
        <button class="mode-button" aria-pressed="${state.mode === "reality"}" data-action="mode" data-mode="reality">[ REALITY MODE ]</button>
        <button class="mode-button" aria-pressed="${state.mode === "matrix"}" data-action="mode" data-mode="matrix">[ MATRIX MODE ]</button>
      </div>
      <div class="top-actions">
        <div class="system-state"><span class="state-dot"></span><span>${state.isStreaming ? "streaming" : "system ready"}</span></div>
      </div>
    </header>
    <main class="workspace">
      <div class="console-head">
        <div>
          <div class="eyebrow">${state.mode === "matrix" ? "Perception layer // active" : "Intelligence console // ready"}</div>
          <h1 class="console-title">${state.mode === "matrix" ? "See the signal." : "Make it precise."}</h1>
        </div>
        <p class="console-note">${state.mode === "matrix" ? "A cinematic interface for pattern, possibility, and the space between knowns." : "A focused interface for decisions, explanations, and useful first drafts."}</p>
      </div>
      <section class="conversation-shell" aria-label="Conversation">
        <div class="messages" data-messages role="log" aria-live="polite"></div>
        <form class="composer" data-composer>
          <div class="composer-wrap">
            <textarea data-prompt-input rows="1" aria-label="Prompt" placeholder="${state.mode === "matrix" ? "Transmit a thought into the grid..." : "What do you need to make clear?"}">${escapeHTML(state.draft)}</textarea>
            <div class="composer-hint">RETURN TO SEND · SHIFT+RETURN FOR LINE BREAK</div>
          </div>
          <button class="send-button ${state.isStreaming ? "stop" : ""}" type="${state.isStreaming ? "button" : "submit"}" data-action="${state.isStreaming ? "stop" : "send"}">${state.isStreaming ? "Stop" : "Transmit"}</button>
        </form>
      </section>
    </main>
    <footer class="footer"><span>TEXT ENGINE · POLLINATIONS</span><span>LOCAL CONSOLE · NO ACCOUNT REQUIRED</span></footer>
    <button class="emergency-delete" data-action="delete-open">DELETE ALL</button>
    ${state.error ? `<div class="error-banner" role="alert">${escapeHTML(state.error)}</div>` : ""}
    ${state.showDeleteModal ? `
      <div class="modal-backdrop" role="presentation">
        <section class="modal" role="dialog" aria-modal="true" aria-labelledby="delete-title">
          <div class="modal-kicker">Irreversible operation</div>
          <h2 id="delete-title">Confirm Absolute Data Wipe?</h2>
          <p>All chats, session cache, and neural context will be permanently destroyed.</p>
          <div class="modal-actions">
            <button data-action="delete-cancel">Keep signal</button>
            <button class="danger" data-action="delete-confirm">Delete all</button>
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

const render = () => {
  if (state.zeroed) {
    stopMatrixRain();
    if (canvas) canvas.style.display = "none";
    root.innerHTML = zeroedMarkup();
    bindEvents();
    return;
  }
  root.innerHTML = consoleMarkup();
  renderMessages(false);
  bindEvents();
  if (state.mode === "matrix") startMatrixRain();
  else {
    stopMatrixRain();
    if (canvas) canvas.style.display = "none";
  }
  const messages = document.querySelector("[data-messages]");
  if (messages) messages.scrollTop = messages.scrollHeight;
};

const updateComposer = () => {
  const textarea = document.querySelector("[data-prompt-input]");
  if (!textarea) return;
  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
};

const addMessage = (role, content, extra = {}) => {
  const message = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    content,
    createdAt: Date.now(),
    ...extra,
  };
  state.messages.push(message);
  save();
  return message;
};

const extractText = (payload) => {
  const trimmed = String(payload || "").trim();
  if (!trimmed || trimmed === "[DONE]") return "";
  try {
    const parsed = JSON.parse(trimmed);
    return parsed.choices?.[0]?.delta?.content
      || parsed.choices?.[0]?.message?.content
      || parsed.choices?.[0]?.text
      || parsed.message?.content
      || parsed.content
      || parsed.response
      || parsed.text
      || parsed.output
      || "";
  } catch {
    return trimmed;
  }
};

const cleanSse = (chunk) => chunk
  .split(/\r?\n/)
  .map((line) => line.startsWith("data:") ? line.slice(5).trim() : line.trim())
  .filter(Boolean)
  .map(extractText)
  .filter(Boolean)
  .join("");

const consumeResponse = async (response, assistant, controller, generation) => {
  const contentType = response.headers.get("content-type") || "";
  const isSse = contentType.includes("text/event-stream");
  if (!isSse && contentType.includes("application/json")) {
    const text = await response.text();
    if (controller.signal.aborted) throw new DOMException("Generation stopped", "AbortError");
    assistant.content += extractText(text);
    return;
  }
  if (!response.body || typeof response.body.getReader !== "function") {
    const text = await response.text();
    assistant.content += extractText(text);
    return;
  }

  const reader = response.body.getReader();
  activeReader = reader;
  const decoder = new TextDecoder();
  let buffered = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (controller.signal.aborted) throw new DOMException("Generation stopped", "AbortError");
      if (generation !== wipeGeneration) return;
      const decoded = decoder.decode(value, { stream: true });
      if (isSse) {
        buffered += decoded;
        const lines = buffered.split(/\r?\n/);
        buffered = lines.pop() || "";
        assistant.content += cleanSse(lines.join("\n"));
      } else {
        assistant.content += decoded;
      }
      renderMessages(true);
    }

    const tail = decoder.decode();
    if (isSse) assistant.content += cleanSse(`${buffered}${tail}`);
    else assistant.content += tail;
  } finally {
    if (activeReader === reader) activeReader = null;
  }
};

const requestText = async (prompt, controller) => {
  const system = `${systemPrompt}\n\nOperating mode: ${state.mode.toUpperCase()}`;
  const payload = `${system}\n\nUSER INPUT:\n${prompt}`;
  const candidates = [
    {
      url: `${ENDPOINT}?model=${encodeURIComponent(MODEL)}&stream=true`,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream, application/json, text/plain" },
        body: JSON.stringify({
          model: MODEL,
          stream: true,
          messages: [
            { role: "system", content: system },
            { role: "user", content: prompt },
          ],
        }),
        signal: controller.signal,
      },
    },
    {
      url: `${ENDPOINT}?stream=true`,
      init: {
        method: "POST",
        headers: { "Content-Type": "text/plain", Accept: "text/event-stream, text/plain" },
        body: payload,
        signal: controller.signal,
      },
    },
    {
      url: `${ENDPOINT}${encodeURIComponent(prompt)}?model=${encodeURIComponent(MODEL)}&stream=true`,
      init: {
        method: "GET",
        headers: { Accept: "text/event-stream, text/plain" },
        signal: controller.signal,
      },
    },
  ];

  let lastError = new Error("The text endpoint did not return a response.");
  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate.url, candidate.init);
      if (response.ok) return response;
      lastError = new Error(`Text endpoint returned ${response.status}.`);
    } catch (error) {
      if (controller.signal.aborted) throw error;
      lastError = error;
    }
  }
  throw lastError;
};

const streamAnswer = async (prompt, assistant, controller, generation) => {
  state.isStreaming = true;
  state.error = "";
  render();
  try {
    await systemPromptReady;
    const response = await requestText(prompt, controller);
    await consumeResponse(response, assistant, controller, generation);
    if (generation !== wipeGeneration) return;
    if (controller.signal.aborted) throw new DOMException("Generation stopped", "AbortError");
    assistant.streaming = false;
    state.isStreaming = false;
    if (!assistant.content.trim()) assistant.content = "No signal returned. Try transmitting again.";
    save();
    render();
  } catch (error) {
    if (generation !== wipeGeneration) return;
    assistant.streaming = false;
    state.isStreaming = false;
    if (error?.name === "AbortError" || controller.signal.aborted) {
      assistant.content = assistant.content || "Generation stopped by operator.";
      state.error = "Generation stopped. The partial response remains in the console.";
    } else {
      assistant.content = assistant.content || "The text service could not return a response.";
      state.error = "Connection issue: the text endpoint could not be reached. Try again when the network is available.";
    }
    save();
    render();
  }
};

const stopGeneration = () => {
  const controller = state.controller;
  if (!controller && !activeReader) return;
  controller?.abort();
  const reader = activeReader;
  activeReader = null;
  if (reader) reader.cancel().catch(() => {});
  const assistant = [...state.messages].reverse().find((message) => message.role === "assistant" && message.streaming);
  if (assistant) {
    assistant.streaming = false;
    assistant.content ||= "Generation stopped by operator.";
  }
  state.isStreaming = false;
  state.error = "Generation stopped. The partial response remains in the console.";
  save();
  render();
};

const sendPrompt = async (value) => {
  const prompt = String(value || "").trim();
  if (!prompt || state.isStreaming) return;
  state.draft = "";
  state.error = "";
  addMessage("user", prompt);
  const assistant = addMessage("assistant", "", { streaming: true });
  const controller = new AbortController();
  const generation = wipeGeneration;
  state.controller = controller;
  activeControllers.add(controller);
  try {
    await streamAnswer(prompt, assistant, controller, generation);
  } finally {
    activeControllers.delete(controller);
    if (generation === wipeGeneration && state.controller === controller) state.controller = null;
  }
};

const deleteAll = () => {
  wipeGeneration += 1;
  activeControllers.forEach((controller) => controller.abort());
  activeControllers.clear();
  state.controller?.abort();
  activeReader?.cancel().catch(() => {});
  activeReader = null;
  stopMatrixRain();
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    // The zeroed state still applies if storage is unavailable.
  }
  systemPrompt = "";
  root.replaceChildren();
  state = { ...freshState(), zeroed: true };
  render();
};

const bindEvents = () => {
  document.querySelectorAll("[data-action]").forEach((element) => {
    element.addEventListener("click", () => {
      const action = element.dataset.action;
      if (action === "mode") {
        if (state.mode === element.dataset.mode) return;
        state.mode = element.dataset.mode;
        save();
        render();
      }
      if (action === "home") {
        window.scrollTo({ top: 0, behavior: "auto" });
      }
      if (action === "delete-open") { state.showDeleteModal = true; render(); }
      if (action === "delete-cancel") { state.showDeleteModal = false; render(); }
      if (action === "delete-confirm") deleteAll();
      if (action === "initialize") { state = freshState(); systemPrompt = DEFAULT_SYSTEM_PROMPT; save(); render(); }
      if (action === "stop") stopGeneration();
      if (action === "suggestion") {
        const input = document.querySelector("[data-prompt-input]");
        if (input) {
          input.value = element.dataset.prompt || "";
          state.draft = input.value;
          input.focus();
          updateComposer();
        }
      }
      if (action === "clarify") {
        const input = document.querySelector("[data-prompt-input]");
        if (input) {
          input.value = `${input.value} — optimize for ${element.dataset.option || "clarity"}`;
          state.draft = input.value;
          input.focus();
          updateComposer();
        }
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
      if (state.isStreaming) stopGeneration();
      else sendPrompt(input.value);
    });
    updateComposer();
  }

  const modal = document.querySelector(".modal-backdrop");
  if (modal) {
    const dialog = modal.querySelector(".modal");
    dialog?.focus();
    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        state.showDeleteModal = false;
        render();
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && state.showDeleteModal) {
        state.showDeleteModal = false;
        render();
      }
    }, { once: true });
  }
};

render();