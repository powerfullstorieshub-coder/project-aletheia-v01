import "./style.css";

const root = document.getElementById("root");
const canvas = document.getElementById("matrixCanvas");
const STORAGE_KEY = "vaerixon-console-v015";
const ENDPOINT = "https://text.pollinations.ai/";

const emptySessions = () => ({
  reality: [],
  matrix: [],
});

const freshState = () => ({
  mode: "reality",
  sessions: emptySessions(),
  messages: [],
  draft: "",
  isStreaming: false,
  error: "",
  zeroed: false,
  showDeleteModal: false,
  controller: null,
  streamingMessageId: null,
});

let state = freshState();
let wipeGeneration = 0;
let stopMatrixRain = () => {};
let systemPrompt = "";
const activeControllers = new Set();

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
  state.sessions[state.mode] = state.messages;
  safeWrite(localStorage, STORAGE_KEY, JSON.stringify({
    mode: state.mode,
    sessions: state.sessions,
  }));
};

const loadSavedState = () => {
  try {
    const saved = JSON.parse(safeRead(localStorage, STORAGE_KEY) || "null");
    if (!saved) return;
    state.mode = saved.mode === "matrix" ? "matrix" : "reality";
    const cleanMessages = (messages) => Array.isArray(messages)
      ? messages.filter((message) => (
        message
        && message.role
        && typeof message.content === "string"
        && !message.streaming
      ))
      : [];

    if (saved.sessions && typeof saved.sessions === "object") {
      state.sessions = {
        reality: cleanMessages(saved.sessions.reality),
        matrix: cleanMessages(saved.sessions.matrix),
      };
    } else {
      // Migrate the previous single-session format into its saved mode.
      state.sessions = emptySessions();
      state.sessions[state.mode] = cleanMessages(saved.messages);
    }
    state.messages = state.sessions[state.mode];
  } catch {
    state = freshState();
  }
};

loadSavedState();

const systemPromptReady = fetch("./system-prompt.txt", { cache: "no-store" })
  .then((response) => (response.ok ? response.text() : ""))
  .then((prompt) => {
    systemPrompt = prompt.trim();
  })
  .catch(() => {
    systemPrompt = "";
  });

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
    ? '<span class="typing" aria-label="Generating">STREAMING</span>'
    : "";
  const streamLabel = message.streaming ? " · LIVE" : "";

  return `
    <article class="message" data-role="${assistant ? "assistant" : "user"}" data-message-id="${message.id}">
      <div class="message-label">${assistant ? "VÆRIXON" : "YOU"}</div>
      <div class="message-content">
        ${content}${typing}
        <div class="message-meta">${formatTime(message.createdAt)}${streamLabel}</div>
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
  } else {
    target.innerHTML = state.messages.map(renderMessage).join("");
  }

  if (shouldScroll) target.scrollTop = target.scrollHeight;
};

const matrixCanvas = () => {
  stopMatrixRain();
  if (!canvas || state.mode !== "matrix") return;

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
    stopped = true;
    cancelAnimationFrame(frame);
    window.removeEventListener("resize", resize);
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    stopMatrixRain = () => {};
  };

  resize();
  window.addEventListener("resize", resize, { passive: true });
  stopMatrixRain = destroy;
  frame = requestAnimationFrame(draw);
};

const consoleMarkup = () => `
  <div class="app mode-${state.mode}">
    <header class="topbar">
      <div>
        <a class="brand" href="/" data-action="home">VÆRIXON <span class="brand-mark">/ 0.5</span><span class="brand-subtitle">Wake up to Reality.</span></a>
      </div>
      <div class="mode-switch" role="group" aria-label="Interface mode">
        <button class="mode-button" aria-pressed="${state.mode === "reality"}" data-action="mode" data-mode="reality">[ REALITY MODE ]</button>
        <button class="mode-button" aria-pressed="${state.mode === "matrix"}" data-action="mode" data-mode="matrix">[ MATRIX MODE ]</button>
      </div>
      <div class="top-actions">
        <div class="system-state" aria-live="polite"><span class="state-dot"></span><span>${state.isStreaming ? "streaming" : "system ready"}</span></div>
      </div>
    </header>
    <main class="workspace">
      <div class="console-head">
        <div>
          <div class="eyebrow">${state.mode === "matrix" ? "Perception layer // active" : "Intelligence console // ready"}</div>
          <h1 class="console-title">${state.mode === "matrix" ? "See the signal." : "Make it precise."}</h1>
        </div>
        <p class="console-note">${state.mode === "matrix" ? "A high-contrast interface for pattern, possibility, and raw analysis." : "A focused interface for decisions, explanations, and useful first drafts."}</p>
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
      <div class="modal-backdrop" data-modal-backdrop>
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

const updateComposer = () => {
  const textarea = document.querySelector("[data-prompt-input]");
  if (!textarea) return;
  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
};

const render = () => {
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
  if (state.mode === "matrix") matrixCanvas();
  else stopMatrixRain();
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
  state.messages.push(message);
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
  assistant.content += text;
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

const requestResponse = async (prompt, controller) => {
  const instructions = systemPrompt
    ? `${systemPrompt}\n\nACTIVE MODE: ${state.mode.toUpperCase()}`
    : `VÆRIXON active mode: ${state.mode}`;
  const combinedPrompt = `${instructions}\n\nUSER INPUT:\n${prompt}`;
  const encodedPrompt = encodeURIComponent(combinedPrompt);

  const requests = [
    () => fetch(`${ENDPOINT}${encodedPrompt}?stream=true`, {
      method: "GET",
      headers: { Accept: "text/event-stream, text/plain, application/json" },
      signal: controller.signal,
    }),
    () => fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "text/event-stream, text/plain, application/json",
        "Content-Type": "text/plain;charset=UTF-8",
      },
      body: combinedPrompt,
      signal: controller.signal,
    }),
  ];

  let lastError = new Error("The text endpoint did not respond.");
  for (const makeRequest of requests) {
    if (controller.signal.aborted) throw new DOMException("Generation stopped", "AbortError");
    try {
      const response = await makeRequest();
      const contentType = response.headers.get("content-type") || "";
      if (response.ok && !contentType.includes("text/html")) return response;
      lastError = new Error(`Text endpoint returned ${response.status}.`);
      if (response.body?.cancel) await response.body.cancel();
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      lastError = error instanceof Error ? error : lastError;
    }
  }
  throw lastError;
};

const streamAnswer = async (prompt, assistant, controller, generation) => {
  try {
    await systemPromptReady;
    const response = await requestResponse(prompt, controller);
    await consumeResponse(response, assistant, controller);
    if (generation !== wipeGeneration) return;
    assistant.streaming = false;
    state.isStreaming = false;
    state.controller = null;
    state.streamingMessageId = null;
    state.error = "";
    if (!assistant.content.trim()) assistant.content = "No signal returned. Try transmitting again.";
    save();
    renderMessages(true);
    updateStatus();
    refreshTransportButton();
  } catch (error) {
    if (generation !== wipeGeneration) return;
    const stopped = error?.name === "AbortError" || controller.signal.aborted;
    assistant.content = assistant.content || (stopped
      ? "Generation stopped by operator."
      : "The text service could not return a response.");
    assistant.streaming = false;
    state.isStreaming = false;
    state.controller = null;
    state.streamingMessageId = null;
    state.error = stopped
      ? "Generation stopped. The partial response remains in the console."
      : "Connection issue: the text endpoint could not be reached. Check your network and try again.";
    save();
    render();
  }
};

const updateStatus = () => {
  const status = document.querySelector(".system-state span:last-child");
  if (status) status.textContent = state.isStreaming ? "streaming" : "system ready";
};

const refreshTransportButton = () => {
  const current = document.querySelector(".send-button");
  if (!current || state.isStreaming) return;
  current.classList.remove("stop");
  current.type = "submit";
  current.dataset.action = "send";
  current.textContent = "Transmit";
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
  save();
  render();
};

const sendPrompt = async (value) => {
  const prompt = String(value || "").trim();
  if (!prompt || state.isStreaming) return;

  state.draft = "";
  state.error = "";
  const userMessage = addMessage("user", prompt);
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
    }
  }
  void userMessage;
};

const deleteAll = () => {
  wipeGeneration += 1;
  activeControllers.forEach((controller) => controller.abort());
  activeControllers.clear();
  if (state.controller) state.controller.abort();
  stopMatrixRain();
  safeClear(localStorage);
  safeClear(sessionStorage);
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
      event.preventDefault();
      const action = element.dataset.action;

      if (action === "home") {
        if (!state.isStreaming) render();
        return;
      }
      if (action === "mode") {
        if (state.isStreaming || state.mode === element.dataset.mode) return;
        state.sessions[state.mode] = state.messages;
        state.mode = element.dataset.mode;
        state.messages = state.sessions[state.mode] || [];
        state.draft = "";
        state.error = "";
        save();
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
      if (action === "delete-confirm") {
        deleteAll();
        return;
      }
      if (action === "initialize") {
        state = freshState();
        save();
        render();
        return;
      }
      if (action === "stop") {
        stopStreaming();
        return;
      }
      if (action === "suggestion") {
        const input = document.querySelector("[data-prompt-input]");
        if (input) {
          input.value = element.dataset.prompt || "";
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
      if (state.isStreaming) stopStreaming();
      else void sendPrompt(input.value);
    });
    updateComposer();
  }

  const modal = document.querySelector("[data-modal-backdrop]");
  if (modal) {
    const dialog = modal.querySelector(".modal");
    if (dialog) {
      dialog.tabIndex = -1;
      dialog.focus();
      dialog.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          state.showDeleteModal = false;
          render();
        }
      });
    }
    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        state.showDeleteModal = false;
        render();
      }
    });
  }
};

render();