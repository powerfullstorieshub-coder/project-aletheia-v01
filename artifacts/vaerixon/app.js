import "./style.css";

const root = document.getElementById("root");
const STORAGE_KEY = "vaerixon-console-v05";
const ENDPOINT = "https://text.pollinations.ai/";

const freshState = () => ({
  mode: "reality",
  messages: [],
  draft: "",
  isStreaming: false,
  error: "",
  zeroed: false,
  showDeleteModal: false,
  pendingPrompt: "",
  controller: null,
});

let state = freshState();
let wipeGeneration = 0;
let stopMatrixRain = () => {};
const activeControllers = new Set();
let systemPrompt = "";

const systemPromptReady = fetch("./system-prompt.txt")
  .then((response) => response.ok ? response.text() : "")
  .then((prompt) => { systemPrompt = prompt; })
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    mode: state.mode,
    messages: state.messages,
  }));
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

const isAmbiguous = (prompt) => {
  const words = prompt.trim().split(/\s+/).filter(Boolean);
  const vague = /^(help|explain|thoughts|ideas?|advice|why|how|what|this|that|it|something|anything)$/i.test(prompt.trim());
  return words.length < 4 || vague || (/^(what|why|how)\s+(is|are|do|can)\b/i.test(prompt) && words.length < 6);
};

const renderMessage = (message) => {
  const assistant = message.role === "assistant";
  const content = assistant ? markdown(message.content) : `<p>${inlineMarkdown(message.content).replace(/\n/g, "<br>")}</p>`;
  const typing = message.streaming && !message.content
    ? '<span class="typing" aria-label="Generating"><i></i><i></i><i></i></span>'
    : "";
  const options = message.options?.length
    ? `<div class="clarification">${message.options.map((option) => `<button class="clarification-button" data-action="clarify" data-option="${escapeHTML(option)}" data-testid="button-context-${escapeHTML(option.toLowerCase())}">${escapeHTML(option)}</button>`).join("")}</div>`
    : "";
  const streamLabel = message.streaming ? " · LIVE" : "";
  return `
    <article class="message" data-role="${message.role}" data-message-id="${message.id}" data-testid="message-${message.role}-${message.id}">
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
  if (!state.messages.length) {
    target.innerHTML = `
      <div class="empty-state" data-testid="empty-state">
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
  const canvas = document.querySelector("#matrixCanvas");
  if (!canvas || state.mode !== "matrix") return;
  const context = canvas.getContext("2d");
  if (!context) return;
  let width = 0;
  let height = 0;
  let columns = [];
  let raf = 0;
  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
     columns = Array.from({ length: Math.ceil(width / 13) }, () => Math.random() * -height / 13);
  };
  resize();
  window.addEventListener("resize", resize, { passive: true });
  const draw = () => {
     context.fillStyle = "rgba(0, 0, 0, .2)";
    context.fillRect(0, 0, width, height);
     context.font = "13px DM Mono, monospace";
    columns.forEach((y, index) => {
       const x = index * 13;
      const char = Math.random() > .5 ? "1" : "0";
       const alpha = Math.random() * .35 + .55;
       context.fillStyle = `rgba(0, 255, 102, ${alpha})`;
       context.shadowColor = "rgba(0, 255, 102, .6)";
       context.shadowBlur = Math.random() > .9 ? 8 : 0;
       context.fillText(char, x, y * 13);
       columns[index] = y * 13 > height + 45 && Math.random() > .975 ? -3 : y + .22;
    });
    raf = requestAnimationFrame(draw);
  };
  draw();
  stopMatrixRain = () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    context.clearRect(0, 0, width, height);
    stopMatrixRain = () => {};
  };
};

const consoleMarkup = () => `
  <div class="app mode-${state.mode}" data-testid="vaerixon-console">
    ${state.mode === "matrix" ? '<canvas id="matrixCanvas" aria-hidden="true"></canvas>' : ""}
    <header class="topbar">
      <div>
        <a class="brand" href="/" data-action="home" data-testid="link-brand">
          VÆRIXON <span class="brand-mark">/ 0.5</span><span class="brand-subtitle">Wake up to Reality.</span>
        </a>
      </div>
      <div class="mode-switch" role="group" aria-label="Interface mode">
        <button class="mode-button" aria-pressed="${state.mode === "reality"}" data-action="mode" data-mode="reality" data-testid="button-reality-mode">[ REALITY MODE ]</button>
        <button class="mode-button" aria-pressed="${state.mode === "matrix"}" data-action="mode" data-mode="matrix" data-testid="button-matrix-mode">[ MATRIX MODE ]</button>
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
        <div class="messages" data-messages role="log" aria-live="polite" data-testid="conversation-log"></div>
        <form class="composer" data-composer>
          <div class="composer-wrap">
             <textarea data-prompt-input rows="1" aria-label="Prompt" placeholder="${state.mode === "matrix" ? "Transmit a thought into the grid..." : "What do you need to make clear?"}" data-testid="input-prompt">${escapeHTML(state.draft)}</textarea>
            <div class="composer-hint">RETURN TO SEND · SHIFT+RETURN FOR LINE BREAK</div>
          </div>
          <button class="send-button ${state.isStreaming ? "stop" : ""}" type="${state.isStreaming ? "button" : "submit"}" data-action="${state.isStreaming ? "stop" : "send"}" data-testid="button-${state.isStreaming ? "stop-generation" : "send-prompt"}">${state.isStreaming ? "Stop" : "Transmit"}</button>
        </form>
      </section>
    </main>
    <footer class="footer"><span>TEXT ENGINE · POLLINATIONS</span><span>LOCAL CONSOLE · NO ACCOUNT REQUIRED</span></footer>
    <button class="emergency-delete" data-action="delete-open" data-testid="button-delete-all">DELETE ALL</button>
    ${state.error ? `<div class="error-banner" role="alert" data-testid="status-error">${escapeHTML(state.error)}</div>` : ""}
    ${state.showDeleteModal ? `
      <div class="modal-backdrop" role="presentation">
        <section class="modal" role="dialog" aria-modal="true" aria-labelledby="delete-title">
          <div class="modal-kicker">Irreversible operation</div>
          <h2 id="delete-title">Confirm Absolute Data Wipe?</h2>
          <p>All chats, session cache, and neural context will be permanently destroyed.</p>
          <div class="modal-actions">
            <button data-action="delete-cancel" data-testid="button-cancel-delete">Keep signal</button>
            <button class="danger" data-action="delete-confirm" data-testid="button-confirm-delete">Delete all</button>
          </div>
        </section>
      </div>
    ` : ""}
  </div>
`;

const zeroedMarkup = () => `
  <main class="zeroed-screen" data-testid="system-zeroed">
    <div class="zeroed-inner">
      <div class="zeroed-mark">VÆRIXON // LOCAL MEMORY</div>
      <h1>System Zeroed.</h1>
      <p>The console is clean. No prompts, responses, or mode preference remain on this device. Begin again only when you mean to.</p>
      <button data-action="initialize" data-testid="button-initialize-console">Initialize fresh console</button>
    </div>
  </main>
`;

const render = () => {
  if (state.zeroed) {
    root.innerHTML = zeroedMarkup();
    bindEvents();
    return;
  }
  root.innerHTML = consoleMarkup();
  renderMessages(false);
  bindEvents();
  if (state.mode === "matrix") matrixCanvas();
  else stopMatrixRain();
  if (state.messages.length) {
    const messages = document.querySelector("[data-messages]");
    if (messages) messages.scrollTop = messages.scrollHeight;
  }
};

const updateComposer = () => {
  const textarea = document.querySelector("[data-prompt-input]");
  if (!textarea) return;
  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
};

const setError = (message) => {
  state.error = message;
  render();
};

const addMessage = (role, content, extra = {}) => {
  const message = { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, role, content, createdAt: Date.now(), ...extra };
  state.messages.push(message);
  save();
  return message;
};

const cleanStreamChunk = (chunk) => {
  const lines = chunk.split(/\r?\n/);
  return lines.map((line) => {
    if (!line.startsWith("data:")) return line;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") return "";
    try {
      const parsed = JSON.parse(payload);
      return parsed.choices?.[0]?.delta?.content
        || parsed.choices?.[0]?.text
        || parsed.content
        || parsed.text
        || "";
    } catch {
      return payload;
    }
  }).filter(Boolean).join("");
};

const streamAnswer = async (prompt, assistant, controller, generation) => {
  state.isStreaming = true;
  state.error = "";
  render();
  try {
    await systemPromptReady;
    const payload = `${systemPrompt}\n\nUSER INPUT:\n${prompt}`;
    let response;
    try {
      response = await fetch(`${ENDPOINT}?stream=true`, {
        method: "POST",
        headers: { "Content-Type": "text/plain", "Accept": "text/event-stream, text/plain" },
        body: payload,
        signal: controller.signal,
      });
    } catch (error) {
      if (error.name === "AbortError") throw error;
    }
    if (!response?.ok) {
      if (controller.signal.aborted) throw new DOMException("Generation stopped", "AbortError");
      response = await fetch(`${ENDPOINT}${encodeURIComponent(payload)}?stream=true`, {
        method: "GET",
        headers: { "Accept": "text/event-stream, text/plain" },
        signal: controller.signal,
      });
    }
    if (!response.ok) throw new Error(`Text endpoint returned ${response.status}.`);
    if (!response.body || typeof response.body.getReader !== "function") {
      const onePass = await response.text();
      assistant.content = onePass || "The endpoint returned no readable text.";
      assistant.streaming = false;
      state.error = "Live streaming is unavailable in this browser. The response was loaded in one pass.";
      state.isStreaming = false;
      save();
      render();
      return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const sse = response.headers.get("content-type")?.includes("text/event-stream");
    let buffered = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (generation !== wipeGeneration) return;
      const decoded = decoder.decode(value, { stream: true });
      let chunk = decoded;
      if (sse) {
        buffered += decoded;
        const lines = buffered.split(/\r?\n/);
        buffered = lines.pop() || "";
        chunk = cleanStreamChunk(lines.join("\n"));
      }
      if (chunk) {
        assistant.content += chunk;
        renderMessages();
      }
    }
    if (generation !== wipeGeneration) return;
    const tail = sse
      ? cleanStreamChunk(buffered + decoder.decode())
      : decoder.decode();
    if (tail) assistant.content += tail;
    assistant.streaming = false;
    state.isStreaming = false;
    if (!assistant.content.trim()) assistant.content = "No signal returned. Try transmitting again.";
    save();
    renderMessages();
    updateStatus();
    refreshTransportButton();
  } catch (error) {
    if (generation !== wipeGeneration) return;
    if (error.name === "AbortError") {
      assistant.content = assistant.content || "Generation stopped by operator.";
      assistant.streaming = false;
      state.error = "Generation stopped. The partial response remains in the console.";
    } else {
      assistant.content = assistant.content || "The text service could not return a response.";
      assistant.streaming = false;
      state.error = "Connection issue: the text endpoint could not be reached. Check your network and try again.";
    }
    state.isStreaming = false;
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
  const next = current.cloneNode(true);
  next.classList.remove("stop");
  next.classList.add("send-button");
  next.type = "submit";
  next.dataset.action = "send";
  next.dataset.testid = "button-send-prompt";
  next.textContent = "Transmit";
  current.replaceWith(next);
};

const sendPrompt = async (value) => {
  const prompt = String(value || "").trim();
  if (!prompt || state.isStreaming) return;
  state.draft = "";
  state.error = "";
  addMessage("user", prompt);
  if (state.mode === "reality" && isAmbiguous(prompt)) {
    state.pendingPrompt = prompt;
    addMessage("assistant", `I can work with that, but the target is underspecified. Before I answer, resolve these variables:

1. **Outcome:** What should the answer help you decide, make, or understand?
2. **Audience:** Who will use or read the result?
3. **Constraints:** What limits, risks, tools, or requirements matter?
4. **Time horizon:** Is this for now, this week, or a longer-term decision?
5. **Trade-off:** Should I optimize for speed, depth, cost, or certainty?

Choose the closest operating target below, or answer the questions directly.`, {
      options: ["Decision", "Explanation", "Plan", "Draft"],
    });
    render();
    return;
  }
  const assistant = addMessage("assistant", "", { streaming: true });
  const controller = new AbortController();
  const generation = wipeGeneration;
  state.controller = controller;
  activeControllers.add(controller);
  await streamAnswer(prompt, assistant, controller, generation);
  activeControllers.delete(controller);
  if (generation === wipeGeneration) state.controller = null;
};

const deleteAll = () => {
  wipeGeneration += 1;
  activeControllers.forEach((controller) => controller.abort());
  activeControllers.clear();
  if (state.controller) state.controller.abort();
  stopMatrixRain();
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    // The clean state still applies if storage is unavailable.
  }
  root.replaceChildren();
  state = { ...freshState(), zeroed: true };
  render();
};

const bindEvents = () => {
  document.querySelectorAll("[data-action]").forEach((element) => {
    element.addEventListener("click", (event) => {
      const action = element.dataset.action;
      if (action === "mode") {
        if (state.isStreaming || state.mode === element.dataset.mode) return;
        stopMatrixRain();
        state.mode = element.dataset.mode;
        save();
        render();
      }
      if (action === "delete-open") { state.showDeleteModal = true; render(); }
      if (action === "delete-cancel") { state.showDeleteModal = false; render(); }
      if (action === "delete-confirm") deleteAll();
      if (action === "initialize") { state = freshState(); save(); render(); }
      if (action === "stop") {
        if (state.controller) state.controller.abort();
      }
      if (action === "suggestion") {
        const input = document.querySelector("[data-prompt-input]");
        if (input) { input.value = element.dataset.prompt; state.draft = input.value; input.focus(); updateComposer(); }
      }
      if (action === "clarify") {
        const option = element.dataset.option;
        const prompt = `${state.pendingPrompt} — optimize for ${option.toLowerCase()}`;
        state.pendingPrompt = "";
        sendPrompt(prompt);
      }
    });
  });
  const composer = document.querySelector("[data-composer]");
  const input = document.querySelector("[data-prompt-input]");
  if (composer && input) {
    input.addEventListener("input", () => { state.draft = input.value; updateComposer(); });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        composer.requestSubmit();
      }
    });
    composer.addEventListener("submit", (event) => {
      event.preventDefault();
      sendPrompt(input.value);
    });
    updateComposer();
  }
  const modal = document.querySelector(".modal-backdrop");
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
      if (event.target === modal) { state.showDeleteModal = false; render(); }
    });
  }
};

render();