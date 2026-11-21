/* SRK Bot — a team of personal AI bots, powered by Google Gemini, OpenAI or OpenRouter's free models.
 * Everything is stored on the device (localStorage). Each API key is sent only to its own provider
 * (generativelanguage.googleapis.com, api.openai.com or openrouter.ai).
 */
(() => {
  "use strict";

  const OPENAI_BASE = "https://api.openai.com/v1";
  const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
  const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
  const MODELS = [
    { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash — smart and fast (default)" },
    { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite — fastest" },
    { id: "gemini-4-argon", label: "Gemini 4 Argon — most capable" },
    { id: "gpt-6.2-sol", label: "GPT-6.2 Sol (OpenAI) — balanced" },
    { id: "gpt-6.2-astra", label: "GPT-6.2 Astra (OpenAI) — most capable" },
    { id: "gpt-6.1-terra", label: "GPT-6.1 Terra (OpenAI) — fast" },
    { id: "gpt-6-luna", label: "GPT-6 Luna (OpenAI) — cheapest" },
  ];
  const OFFLINE_ONLY = window.SRK_EDITION === "offline"; // "SRK Bot Offline" app: on-device models only
  const OFFLINE_DEFAULT = "local:gemma-3-1b";
  const DEFAULT_MODEL = OFFLINE_ONLY ? OFFLINE_DEFAULT : MODELS[0].id;
  // OpenRouter model ids look like "vendor/model:free" (the only ids with a "/").
  const providerOf = (id) => (id.startsWith("local:") ? "local" : id.includes("/") ? "openrouter" : /^(gemini|gemma|learnlm)/.test(id) ? "gemini" : "openai");
  const PROVIDER_NAME = { gemini: "Gemini", openai: "OpenAI", openrouter: "OpenRouter", local: "Offline" };
  const keyFor = (prov) => (prov === "gemini" ? state.settings.geminiKey : prov === "openrouter" ? state.settings.openrouterKey : state.settings.apiKey) || "";
  const hasAnyKey = () => !!(state.settings.apiKey || state.settings.geminiKey || state.settings.openrouterKey);
  // All selectable models: the built-in list plus any loaded from the user's accounts in Settings.
  function allModels() {
    const out = OFFLINE_ONLY ? [] : MODELS.slice();
    const extra = OFFLINE_ONLY ? [] : [...(state.settings.geminiModels || []), ...(state.settings.accountModels || []), ...(state.settings.orModels || [])];
    for (const id of extra) {
      const p = providerOf(id);
      if (!out.some((m) => m.id === id)) out.push({ id, label: id + (p === "openai" ? " (OpenAI)" : p === "openrouter" ? " (OpenRouter, free)" : "") });
    }
    for (const m of offlineModels()) {
      out.push({ id: m.id, label: "📴 Offline · " + m.label + (offlineDownloaded.includes(m.id) ? "" : " (download in Settings)") });
    }
    return out;
  }
  const modelLabel = (id) => (allModels().find((m) => m.id === id) || { label: id }).label.split(" —")[0];
  const HISTORY_LIMIT = 40; // messages sent per request (older ones stay saved on device)
  const STORE_KEY = "srkbot.v2";

  // ---------- state ----------
  const defaultState = () => ({
    settings: { apiKey: "", geminiKey: "", openrouterKey: "", maxTokens: 4096, accountModels: [], geminiModels: [], orModels: [], v3: true },
    bots: [
      makeBot("🤖", "SRK Assistant", "You are SRK Assistant, a friendly, sharp general helper. Be clear and concise.", true),
      makeBot("🩺", "Surgery Tutor", "You are a senior general surgery consultant who teaches postgraduate (DNB/MS) trainees. Explain concepts step by step, cite standard textbooks (Bailey & Love, Sabiston, Schwartz) where relevant, and quiz the user when asked.", true),
      makeBot("💡", "Idea Partner", "You are a startup and product brainstorming partner. Ask sharp questions, suggest bold but practical ideas, and keep answers short.", true),
    ],
  });

  function makeBot(avatar, name, persona, autoMemory) {
    return {
      id: "b" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      avatar, name, persona,
      model: DEFAULT_MODEL,
      memory: "",
      autoMemory: !!autoMemory,
      messages: [],
      updated: Date.now(),
    };
  }

  let state = load();
  let currentBotId = null;
  let editingBotId = null; // null => new bot
  let abortCtrl = null;

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && Array.isArray(s.bots) && s.settings) {
          if (!s.settings.v3) { // one-time move from OpenAI default to Gemini
            for (const b of s.bots) if (b.model === "gpt-6.2-sol") b.model = DEFAULT_MODEL;
            s.settings.geminiKey = s.settings.geminiKey || "";
            s.settings.geminiModels = s.settings.geminiModels || [];
            s.settings.v3 = true;
          }
          return s;
        }
      }
    } catch (e) { /* storage unavailable or corrupt */ }
    return defaultState();
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch (e) { toast("Could not save — storage full?"); }
  }
  const bot = (id) => state.bots.find((b) => b.id === id);

  // ---------- helpers ----------
  const $ = (id) => document.getElementById(id);
  function toast(msg, ms = 2200) {
    const t = $("toast"); t.textContent = msg; t.classList.remove("hidden");
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add("hidden"), ms);
  }
  function esc(s) {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function timeAgo(ts) {
    const d = (Date.now() - ts) / 1000;
    if (d < 60) return "now";
    if (d < 3600) return Math.floor(d / 60) + "m";
    if (d < 86400) return Math.floor(d / 3600) + "h";
    return new Date(ts).toLocaleDateString();
  }

  // Small, safe markdown renderer (escapes first, then formats).
  function md(src) {
    const blocks = [];
    let s = src.replace(/```(\w*)\n?([\s\S]*?)(```|$)/g, (_, lang, code) => {
      blocks.push("<pre><code>" + esc(code.replace(/\n$/, "")) + "</code></pre>");
      return "\u0000" + (blocks.length - 1) + "\u0000";
    });
    s = esc(s);
    s = s.replace(/`([^`\n]+)`/g, "<code>$1</code>")
         .replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>")
         .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<i>$2</i>");
    const lines = s.split("\n");
    let html = "", list = null, para = [];
    const flushPara = () => { if (para.length) { html += "<p>" + para.join("<br>") + "</p>"; para = []; } };
    const closeList = () => { if (list) { html += "</" + list + ">"; list = null; } };
    for (const line of lines) {
      let m;
      if ((m = line.match(/^\s*[-*•]\s+(.*)/))) {
        flushPara(); if (list !== "ul") { closeList(); html += "<ul>"; list = "ul"; }
        html += "<li>" + m[1] + "</li>";
      } else if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) {
        flushPara(); if (list !== "ol") { closeList(); html += "<ol>"; list = "ol"; }
        html += "<li>" + m[1] + "</li>";
      } else if ((m = line.match(/^#{1,6}\s+(.*)/))) {
        flushPara(); closeList(); html += "<h4>" + m[1] + "</h4>";
      } else if (/^\u0000\d+\u0000$/.test(line.trim())) {
        flushPara(); closeList(); html += line.trim();
      } else if (!line.trim()) {
        flushPara(); closeList();
      } else {
        closeList(); para.push(line);
      }
    }
    flushPara(); closeList();
    return html.replace(/\u0000(\d+)\u0000/g, (_, i) => blocks[+i]);
  }

  // ---------- navigation (uses history so the Android back button works) ----------
  function show(view, push = true) {
    document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + view));
    if (push) history.pushState({ view, bot: currentBotId }, "", "#" + view);
  }
  window.addEventListener("popstate", (e) => {
    if (abortCtrl) abortCtrl.abort();
    const st = e.state;
    if (!st || st.view === "list") { renderList(); show("list", false); }
    else if (st.view === "chat" && st.bot && bot(st.bot)) { openChat(st.bot, false); }
    else { renderList(); show("list", false); }
  });

  // ---------- bot list ----------
  function renderList() {
    $("key-warning").classList.toggle("hidden", !!(hasAnyKey() || offlineDownloaded.length));
    const ul = $("bot-list"); ul.innerHTML = "";
    const bots = [...state.bots].sort((a, b) => b.updated - a.updated);
    if (!bots.length) {
      ul.innerHTML = '<li class="empty">No bots yet. Tap ＋ to create one.</li>';
      return;
    }
    for (const b of bots) {
      const last = [...b.messages].reverse().find((m) => m.role === "user" || m.role === "assistant");
      const li = document.createElement("li");
      li.innerHTML =
        '<span class="avatar">' + esc(b.avatar || "🤖") + "</span>" +
        '<div class="bot-meta"><div class="bot-name">' + esc(b.name) + "</div>" +
        '<div class="bot-last">' + esc(last ? last.content.replace(/\s+/g, " ").slice(0, 80) : firstLine(b.persona)) + "</div></div>" +
        '<span class="bot-time">' + (last ? timeAgo(b.updated) : "") + "</span>";
      li.onclick = () => openChat(b.id);
      ul.appendChild(li);
    }
  }
  const firstLine = (s) => (s || "").split("\n")[0].slice(0, 80);

  // ---------- chat ----------
  function openChat(id, push = true) {
    currentBotId = id;
    const b = bot(id);
    $("chat-avatar").textContent = b.avatar || "🤖";
    $("chat-name").textContent = b.name;
    $("chat-sub").textContent = modelLabel(b.model);
    renderMessages();
    show("chat", push);
    setTimeout(() => $("input").focus(), 50);
  }

  function renderMessages() {
    const b = bot(currentBotId), box = $("messages");
    box.innerHTML = "";
    if (!b.messages.length) {
      box.innerHTML = '<div class="empty"><div style="font-size:42px">' + esc(b.avatar || "🤖") +
        "</div>Say hi to <b>" + esc(b.name) + "</b>.</div>";
      return;
    }
    for (const m of b.messages) box.appendChild(msgEl(m));
    box.scrollTop = box.scrollHeight;
  }
  function msgEl(m) {
    const d = document.createElement("div");
    d.className = "msg " + m.role;
    if (m.role === "assistant") d.innerHTML = md(m.content);
    else d.textContent = m.content;
    return d;
  }

  function systemPrompt(b) {
    let s = (b.persona || "You are a helpful assistant.").trim();
    s += "\n\nYour name is " + b.name + ". You are one of the user's bots inside the SRK Bot app.";
    s += "\nToday's date: " + new Date().toDateString() + ".";
    if (b.memory.trim()) s += "\n\nThings you remember about the user (your long-term memory):\n" + b.memory.trim();
    if (b.autoMemory) {
      s += "\n\nWhen the user tells you a lasting fact worth remembering for future chats (a preference, goal, " +
        "detail about their work or life), add it at the very end of your reply as <remember>short fact</remember>. " +
        "Only for genuinely new, durable facts; never for things already in memory. The tag is hidden from the user.";
    }
    return s;
  }

  function apiMessages(b) {
    const msgs = b.messages.filter((m) => m.role === "user" || m.role === "assistant").slice(-HISTORY_LIMIT);
    while (msgs.length && msgs[0].role !== "user") msgs.shift();
    // merge consecutive same-role messages (e.g. after an error)
    const out = [];
    for (const m of msgs) {
      if (out.length && out[out.length - 1].role === m.role) out[out.length - 1].content += "\n\n" + m.content;
      else out.push({ role: m.role, content: m.content });
    }
    return out;
  }

  function extractMemory(b, text) {
    const facts = [];
    const clean = text.replace(/<remember>([\s\S]*?)<\/remember>/g, (_, f) => { facts.push(f.trim()); return ""; }).trim();
    if (facts.length && b.autoMemory) {
      const existing = b.memory.split("\n").map((l) => l.trim().toLowerCase());
      const fresh = facts.filter((f) => f && !existing.includes(f.toLowerCase()));
      if (fresh.length) {
        b.memory = (b.memory.trim() ? b.memory.trim() + "\n" : "") + fresh.join("\n");
        toast("🧠 " + b.name + " remembered: " + fresh[0] + (fresh.length > 1 ? " (+" + (fresh.length - 1) + ")" : ""));
      }
    }
    return clean;
  }

  async function apiError(res, prov) {
    let msg = "HTTP " + res.status, raw = "";
    try { const j = await res.json(); raw = (j.error && j.error.message) || ""; msg = raw || msg; } catch (e) {}
    const name = PROVIDER_NAME[prov];
    if (res.status === 401 || /API key not valid|API_KEY_INVALID/i.test(raw)) msg = "Invalid " + name + " API key. Check it in Settings.";
    else if (res.status === 429) msg = name + " says: " + msg + (prov === "gemini"
      ? " (free-tier limit reached — wait a minute, pick a lighter model like Flash-Lite, or add a free OpenRouter key in Settings as a backup)."
      : prov === "openrouter" ? " (OpenRouter free-model limit reached — try again later or pick another free model)."
      : " (rate limit or no credit left on your account).");
    else if (res.status === 404) msg = msg + " — pick another model for this bot (✏️), or load your models in Settings.";
    return msg;
  }

  // Models to try, in order, when the chosen one is busy/over its free limit.
  const GEMINI_FALLBACKS = ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3.6-flash", "gemini-3.7-flash",
    "gemini-3.1-flash-lite", "gemini-3-flash", "gemini-2.5-flash", "gemini-2.5-flash-lite"];
  function attemptPlan(model, prov) {
    const plan = [model, model]; // first: retry the same model once
    if (prov === "gemini") {
      const avail = state.settings.geminiModels || [];
      for (const m of GEMINI_FALLBACKS) {
        if (plan.length >= 5) break;
        if (m !== model && !plan.includes(m) && (!avail.length || avail.includes(m))) plan.push(m);
      }
    } else if (prov === "openrouter") {
      for (const m of orFreeModels()) {
        if (plan.length >= 5) break;
        if (!plan.includes(m)) plan.push(m);
      }
    }
    return plan;
  }
  // OpenRouter free models loaded in Settings, best general chat models first.
  const OR_PREFER = [/deepseek.*(chat|v3)/, /llama-3\.3-70b|llama-4/, /qwen.*(235b|72b|32b)/, /gemma-3-27b/, /mistral.*(small|medium)/, /deepseek/];
  function orFreeModels() {
    const ids = (state.settings.orModels || []).slice();
    const rank = (id) => { const i = OR_PREFER.findIndex((re) => re.test(id)); return i < 0 ? 99 : i; };
    return ids.sort((a, b) => rank(a) - rank(b));
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function buildRequest(b, prov, model) {
    model = model || b.model;
    const sys = systemPrompt(b), msgs = apiMessages(b), maxTok = +state.settings.maxTokens || 4096;
    if (prov === "gemini") {
      return {
        url: GEMINI_BASE + "/models/" + encodeURIComponent(model) + ":streamGenerateContent?alt=sse",
        headers: { "content-type": "application/json", "x-goog-api-key": keyFor("gemini") },
        body: {
          systemInstruction: { parts: [{ text: sys }] },
          contents: msgs.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
          generationConfig: { maxOutputTokens: maxTok },
        },
      };
    }
    if (prov === "openrouter") {
      return {
        url: OPENROUTER_BASE + "/chat/completions",
        headers: { "content-type": "application/json", "authorization": "Bearer " + keyFor("openrouter"), "X-Title": "SRK Bot" },
        body: { model, messages: [{ role: "system", content: sys }, ...msgs], max_tokens: maxTok, stream: true },
      };
    }
    return {
      url: OPENAI_BASE + "/responses",
      headers: { "content-type": "application/json", "authorization": "Bearer " + keyFor("openai") },
      body: { model, instructions: sys, input: msgs, max_output_tokens: maxTok, store: false, stream: true },
    };
  }

  // Returns text to append from one streamed event, or throws on an error event.
  function eventText(ev, prov, hasText) {
    if (prov === "gemini") {
      if (ev.error) throw new Error(ev.error.message || "Gemini error");
      if (ev.promptFeedback && ev.promptFeedback.blockReason) throw new Error("Gemini blocked this message (" + ev.promptFeedback.blockReason + ").");
      const c = ev.candidates && ev.candidates[0];
      if (!c) return "";
      const t = ((c.content && c.content.parts) || []).filter((p) => p.text && !p.thought).map((p) => p.text).join("");
      if (!t && !hasText && /SAFETY|PROHIBITED|BLOCKLIST|RECITATION/.test(c.finishReason || "")) throw new Error("Gemini stopped the reply (" + c.finishReason + ").");
      if (!t && !hasText && c.finishReason === "MAX_TOKENS") throw new Error("Reply was cut off. Try a higher max reply length in Settings.");
      return t;
    }
    if (prov === "openrouter") {
      if (ev.error) throw new Error("OpenRouter: " + (ev.error.message || "error"));
      const ch = ev.choices && ev.choices[0];
      return (ch && ch.delta && typeof ch.delta.content === "string") ? ch.delta.content : "";
    }
    if (ev.type === "response.output_text.delta" && typeof ev.delta === "string") return ev.delta;
    if (ev.type === "error") throw new Error(ev.message || (ev.error && ev.error.message) || "Stream error");
    if (ev.type === "response.failed") throw new Error((ev.response && ev.response.error && ev.response.error.message) || "Request failed");
    if (ev.type === "response.incomplete" && !hasText) throw new Error("Reply was cut off (" + ((ev.response && ev.response.incomplete_details &&
      ev.response.incomplete_details.reason) || "incomplete") + "). Try a higher max reply length in Settings.");
    return "";
  }

  // ----- offline (on-device) models -----
  let offlineDownloaded = [];
  const offlineApi = () => window.SRKOffline || null;
  const offlineModels = () => (offlineApi() ? offlineApi().LOCAL_MODELS : []);
  async function refreshOffline() {
    if (!offlineApi()) return;
    offlineDownloaded = await offlineApi().downloaded();
  }
  window.addEventListener("srk-offline-ready", () => {
    refreshOffline().then(() => {
      renderOfflineList();
      if ($("view-list").classList.contains("active")) {
        renderList();
        // SRK Bot Offline, first launch: go straight to the model download
        if (OFFLINE_ONLY && !offlineDownloaded.length) openSettings();
      }
    });
  });

  function localSystemPrompt(b) {
    let s = (b.persona || "You are a helpful assistant.").trim();
    s += "\nYour name is " + b.name + ". Answer clearly and briefly.";
    if (b.memory.trim()) s += "\nFacts about the user:\n" + b.memory.trim();
    return s;
  }
  const isNetworkError = (err) => err && (err.name === "TypeError" || /Failed to fetch|NetworkError|network/i.test(err.message || ""));

  async function streamLocal(model, b, onText, setStatus) {
    const api = offlineApi();
    if (!api) throw new Error("Offline engine is still starting — try again in a moment.");
    const msgs = apiMessages(b).slice(-12);
    await api.chat({
      id: model, system: localSystemPrompt(b), messages: msgs,
      maxTokens: +state.settings.maxTokens || 1024, signal: abortCtrl.signal,
      onText, onStatus: setStatus,
    });
  }

  async function streamOnline(b, prov, onText, startModel) {
    startModel = startModel || b.model;
    let res, usedModel = startModel;
    const plan = attemptPlan(startModel, prov);
    for (let i = 0; i < plan.length; i++) {
      usedModel = plan[i];
      if (i > 0) await sleep(i === 1 ? 1500 : 500);
      if (abortCtrl.signal.aborted) throw new DOMException("Aborted", "AbortError");
      const rq = buildRequest(b, prov, usedModel);
      res = await fetch(rq.url, {
        method: "POST", signal: abortCtrl.signal, headers: rq.headers, body: JSON.stringify(rq.body),
      });
      if (res.ok) break;
      const busy = [429, 500, 502, 503, 504].includes(res.status);
      if (!busy || i === plan.length - 1) { const e = new Error(await apiError(res, prov)); e.busy = busy; throw e; }
      if (i >= 1) toast(modelLabel(usedModel) + " is busy — trying another model…");
      try { await res.text(); } catch (e) {}
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "", got = false;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).trim(); buf = buf.slice(idx + 1);
        if (!line.startsWith("data:")) continue;
        let ev; try { ev = JSON.parse(line.slice(5)); } catch (e) { continue; }
        const t = eventText(ev, prov, got);
        if (t) { got = true; onText(t); }
      }
    }
    return usedModel;
  }

  async function send(text) {
    const b = bot(currentBotId);
    if (OFFLINE_ONLY && providerOf(b.model) !== "local") b.model = offlineDownloaded[0] || OFFLINE_DEFAULT;
    const prov = providerOf(b.model);
    if (prov === "local" && !offlineDownloaded.includes(b.model)) {
      toast("Download this offline model first: ⚙️ Settings → Offline AI"); return;
    }
    if (prov !== "local" && !keyFor(prov) && !offlineDownloaded.length && !(prov !== "openrouter" && state.settings.openrouterKey)) {
      toast("Add your " + PROVIDER_NAME[prov] + " API key in Settings first"); return;
    }
    if (!b.messages.length) $("messages").innerHTML = "";
    const userMsg = { role: "user", content: text, ts: Date.now() };
    b.messages.push(userMsg); b.updated = Date.now(); save();
    const box = $("messages");
    box.appendChild(msgEl(userMsg));

    const el = document.createElement("div");
    el.className = "msg assistant typing";
    box.appendChild(el); box.scrollTop = box.scrollHeight;

    setBusy(true);
    abortCtrl = new AbortController();
    let full = "", switchNote = "";
    const onText = (t) => {
      full += t;
      el.innerHTML = md(full.replace(/<remember>[\s\S]*?(<\/remember>|$)/g, ""));
      box.scrollTop = box.scrollHeight;
    };
    const setStatus = (msg) => { if (!full) el.textContent = msg || ""; };
    try {
      if (prov === "local") {
        await streamLocal(b.model, b, onText, setStatus);
      } else {
        try {
          try {
            if (!keyFor(prov)) { const e = new Error("no key"); e.noKey = true; throw e; }
            const used = await streamOnline(b, prov, onText);
            if (used !== b.model) switchNote = "⚡ " + modelLabel(b.model) + " was busy, so " + modelLabel(used) + " answered";
          } catch (err) {
            // Gemini/OpenAI over its limit (or no key for it)? Answer with a free OpenRouter model instead.
            const orBackup = prov !== "openrouter" && state.settings.openrouterKey && orFreeModels().length;
            if (!full && err.name !== "AbortError" && (err.busy || err.noKey) && orBackup) {
              const used = await streamOnline(b, "openrouter", onText, orFreeModels()[0]);
              switchNote = "🔁 " + (err.noKey ? "No " + PROVIDER_NAME[prov] + " key" : PROVIDER_NAME[prov] + " was over its limit") +
                ", so " + modelLabel(used).replace(" (OpenRouter, free)", "") + " (OpenRouter, free) answered";
            } else if (err.noKey) throw new TypeError("no key");
            else throw err;
          }
        } catch (err) {
          // No internet (or no key)? Answer with a downloaded offline model instead.
          if (!full && err.name !== "AbortError" && isNetworkError(err) && offlineDownloaded.length) {
            const fb = offlineDownloaded[0];
            switchNote = "📴 No internet — answered offline with " + modelLabel(fb).replace(/^📴 Offline · /, "");
            await streamLocal(fb, b, onText, setStatus);
          } else throw err;
        }
      }
    } catch (err) {
      if (err.name === "AbortError") { if (full) full += "\n\n_(stopped)_"; }
      else {
        el.remove();
        const e = { role: "error", content: "⚠️ " + (err.message || err) +
          (String(err.message).includes("Failed to fetch") ? " — check your internet connection, or download an offline model in Settings." : "") };
        box.appendChild(msgEl(e)); box.scrollTop = box.scrollHeight;
        setBusy(false); abortCtrl = null;
        return;
      }
    }
    el.classList.remove("typing");
    if (full) {
      const clean = extractMemory(b, full);
      el.innerHTML = md(clean);
      b.messages.push({ role: "assistant", content: clean, ts: Date.now() });
      b.updated = Date.now(); save();
      if (switchNote) { box.appendChild(msgEl({ role: "note", content: switchNote })); box.scrollTop = box.scrollHeight; }
    } else el.remove();
    setBusy(false); abortCtrl = null;
  }

  function setBusy(busy) {
    const btn = $("btn-send");
    btn.classList.toggle("stop", busy);
    btn.textContent = busy ? "■" : "➤";
    btn.setAttribute("aria-label", busy ? "Stop" : "Send");
  }

  // ---------- bot editor ----------
  function openEditor(id) {
    editingBotId = id;
    const b = id ? bot(id) : null;
    $("edit-heading").textContent = b ? "Edit bot" : "New bot";
    $("f-avatar").value = b ? b.avatar : "🤖";
    $("f-name").value = b ? b.name : "";
    $("f-persona").value = b ? b.persona : "";
    $("f-memory").value = b ? b.memory : "";
    $("f-automem").checked = b ? b.autoMemory : true;
    const sel = $("f-model"); sel.innerHTML = "";
    for (const m of allModels()) sel.add(new Option(m.label, m.id));
    sel.value = b ? b.model : DEFAULT_MODEL;
    if (b && !allModels().some((m) => m.id === b.model)) sel.add(new Option(b.model, b.model, true, true));
    $("edit-danger").classList.toggle("hidden", !b);
    show("edit");
  }
  function saveEditor() {
    const name = $("f-name").value.trim();
    if (!name) { toast("Give your bot a name"); return; }
    let b = editingBotId ? bot(editingBotId) : null;
    if (!b) { b = makeBot("🤖", name, "", true); state.bots.push(b); }
    b.avatar = $("f-avatar").value.trim() || "🤖";
    b.name = name;
    b.persona = $("f-persona").value.trim();
    b.memory = $("f-memory").value.trim();
    b.autoMemory = $("f-automem").checked;
    b.model = $("f-model").value;
    b.updated = Date.now();
    save();
    toast("Saved");
    if (editingBotId) history.back();               // back to chat
    else { history.replaceState({ view: "list" }, "", "#list"); renderList(); openChat(b.id); }
  }

  // ---------- settings ----------
  function openSettings() {
    $("s-key").value = state.settings.apiKey || "";
    $("s-gkey").value = state.settings.geminiKey || "";
    $("s-okey").value = state.settings.openrouterKey || "";
    $("s-maxtok").value = state.settings.maxTokens;
    $("test-result").textContent = "";
    refreshOffline().then(renderOfflineList);
    renderOfflineList();
    show("settings");
  }
  async function testKey() {
    state.settings.apiKey = $("s-key").value.trim();
    state.settings.geminiKey = $("s-gkey").value.trim();
    state.settings.openrouterKey = $("s-okey").value.trim();
    state.settings.maxTokens = Math.min(64000, Math.max(256, +$("s-maxtok").value || 4096));
    save();
    const out = $("test-result");
    if (!hasAnyKey()) { out.textContent = "No keys saved."; return; }
    out.textContent = "Testing…";
    const lines = [];
    if (state.settings.geminiKey) lines.push(await testGemini());
    if (state.settings.openrouterKey) lines.push(await testOpenRouter());
    if (state.settings.apiKey) lines.push(await testOpenAI());
    out.innerHTML = lines.map(esc).join("<br>");
  }
  async function testGemini() {
    try {
      const res = await fetch(GEMINI_BASE + "/models?pageSize=1000", { headers: { "x-goog-api-key": state.settings.geminiKey } });
      if (!res.ok) return "Gemini ❌ " + (await apiError(res, "gemini"));
      const j = await res.json();
      const ids = (j.models || [])
        .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
        .map((m) => m.name.replace(/^models\//, ""))
        .filter((id) => /^(gemini|gemma)/.test(id) && !/(tts|image|embedding|live|transcribe|robotics|audio|banana|veo|imagen|computer-use)/.test(id))
        .sort().reverse();
      state.settings.geminiModels = ids; save();
      const missing = MODELS.filter((m) => providerOf(m.id) === "gemini" && !ids.includes(m.id)).map((m) => m.id);
      return "Gemini ✅ Key works. " + ids.length + " chat models available." + (missing.length ? " Not available to you: " + missing.join(", ") + "." : "");
    } catch (e) { return "Gemini ❌ Network error: " + e.message; }
  }
  async function testOpenRouter() {
    try {
      const kr = await fetch(OPENROUTER_BASE + "/key", { headers: { "authorization": "Bearer " + state.settings.openrouterKey } });
      if (!kr.ok) return "OpenRouter ❌ " + (await apiError(kr, "openrouter"));
      const res = await fetch(OPENROUTER_BASE + "/models");
      if (!res.ok) return "OpenRouter ❌ Could not load models (HTTP " + res.status + ")";
      const j = await res.json();
      const ids = (j.data || []).map((m) => m.id)
        .filter((id) => /:free$/.test(id) && !/(vision|image|audio|embed|guard|moderation)/.test(id));
      state.settings.orModels = ids; save();
      return "OpenRouter ✅ Key works. " + ids.length + " free models — used automatically when Gemini is over its limit.";
    } catch (e) { return "OpenRouter ❌ Network error: " + e.message; }
  }
  async function testOpenAI() {
    try {
      const res = await fetch(OPENAI_BASE + "/models", { headers: { "authorization": "Bearer " + state.settings.apiKey } });
      if (!res.ok) return "OpenAI ❌ " + (await apiError(res, "openai"));
      const j = await res.json();
      const ids = (j.data || []).map((m) => m.id)
        .filter((id) => /^(gpt-|o\d|chatgpt-)/.test(id) &&
          !/(audio|realtime|transcribe|tts|image|search|embedding|instruct|codex|cyber|moderation)/.test(id))
        .sort().reverse();
      state.settings.accountModels = ids; save();
      return "OpenAI ✅ Key works. " + ids.length + " chat models available (replies need credit on your OpenAI account).";
    } catch (e) { return "OpenAI ❌ Network error: " + e.message; }
  }

  // ----- Offline AI settings -----
  let dl = null; // { id, loaded, total, ctrl }
  function renderOfflineList() {
    const box = $("offline-list");
    if (!box) return;
    if (!offlineApi()) { box.innerHTML = '<p class="hint">Offline engine is starting…</p>'; return; }
    box.innerHTML = "";
    for (const m of offlineModels()) {
      const has = offlineDownloaded.includes(m.id);
      const busy = dl && dl.id === m.id;
      const row = document.createElement("div");
      row.className = "om";
      let sub = has ? "✅ Downloaded · works offline" : "≈ " + (m.sizeMB >= 1000 ? (m.sizeMB / 1000).toFixed(1) + " GB" : m.sizeMB + " MB") + " download";
      if (busy) {
        const pct = dl.total ? Math.floor((dl.loaded / dl.total) * 100) : 0;
        sub = "Downloading… " + pct + "% (" + Math.round(dl.loaded / 1e6) + " / " + Math.round((dl.total || m.sizeMB * 1e6) / 1e6) + " MB) — keep the app open";
      }
      row.innerHTML = '<div class="om-meta"><div class="om-name">' + esc(m.label) + '</div><div class="om-sub">' + esc(sub) + "</div>" +
        (busy ? '<div class="bar-prog"><i style="width:' + (dl.total ? (dl.loaded / dl.total) * 100 : 0) + '%"></i></div>' : "") + "</div>";
      const btn = document.createElement("button");
      if (busy) { btn.textContent = "Cancel"; btn.onclick = () => dl.ctrl.abort(); }
      else if (has) { btn.textContent = "Delete"; btn.onclick = () => deleteOffline(m); }
      else { btn.textContent = "Download"; btn.className = "dl"; btn.disabled = !!dl; btn.onclick = () => downloadOffline(m); }
      row.appendChild(btn);
      box.appendChild(row);
    }
  }
  async function downloadOffline(m) {
    if (dl) return;
    dl = { id: m.id, loaded: 0, total: 0, ctrl: new AbortController() };
    renderOfflineList();
    let last = 0;
    try {
      await offlineApi().download(m.id, (loaded, total) => {
        dl.loaded = loaded; dl.total = total;
        if (Date.now() - last > 400) { last = Date.now(); renderOfflineList(); }
      }, dl.ctrl.signal);
      await refreshOffline();
      toast("✅ " + m.label.split(" —")[0] + (OFFLINE_ONLY ? " ready — go back and start chatting" : " ready — choose it for any bot (✏️ → Model)"), 4000);
    } catch (e) {
      if (e.name === "AbortError" || /abort/i.test(e.message || "")) toast("Download cancelled");
      else toast("Download failed: " + (e.message || e) + " — check Wi-Fi and free storage", 4500);
    }
    dl = null;
    await refreshOffline();
    renderOfflineList();
  }
  async function deleteOffline(m) {
    if (!confirm("Delete " + m.label.split(" —")[0] + " from this phone? You can download it again later.")) return;
    try { await offlineApi().remove(m.id); } catch (e) { toast("Delete failed: " + e.message); }
    await refreshOffline();
    renderOfflineList();
    toast("Deleted");
  }

  async function exportData() {
    const data = JSON.stringify({ app: "SRK Bot", exported: new Date().toISOString(),
      bots: state.bots, settings: { maxTokens: state.settings.maxTokens } }, null, 2);
    const name = "srk-bot-backup-" + new Date().toISOString().slice(0, 10) + ".json";
    try {
      const file = new File([data], name, { type: "application/json" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
    } catch (e) { if (e.name === "AbortError") return; }
    if (!window.Capacitor) {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([data], { type: "application/json" }));
      a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      return;
    }
    try { await navigator.clipboard.writeText(data); toast("Backup copied to clipboard — paste it into a note or file"); }
    catch (e) { toast("Export not supported on this device"); }
  }
  function importData(file) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const j = JSON.parse(r.result);
        if (!Array.isArray(j.bots)) throw new Error("No bots in file");
        let added = 0;
        for (const b of j.bots) {
          if (!b || !b.name) continue;
          const nb = Object.assign(makeBot("🤖", b.name, "", true), b);
          if (bot(nb.id)) nb.id = makeBot("", "", "").id;
          nb.messages = Array.isArray(nb.messages) ? nb.messages : [];
          state.bots.push(nb); added++;
        }
        save(); toast("Imported " + added + " bot(s)");
      } catch (e) { toast("Import failed: " + e.message); }
    };
    r.readAsText(file);
  }

  // ---------- wire up ----------
  $("btn-new-bot").onclick = () => openEditor(null);
  $("btn-settings").onclick = openSettings;
  $("btn-back").onclick = () => history.back();
  $("btn-settings-back").onclick = () => history.back();
  $("btn-edit-cancel").onclick = () => history.back();
  $("btn-edit-bot").onclick = () => openEditor(currentBotId);
  $("chat-title-wrap").onclick = () => openEditor(currentBotId);
  $("btn-edit-save").onclick = saveEditor;
  $("btn-test-key").onclick = testKey;
  $("s-maxtok").onchange = () => {
    state.settings.maxTokens = Math.min(64000, Math.max(256, +$("s-maxtok").value || 4096)); save();
  };
  $("btn-export").onclick = exportData;
  $("btn-import").onclick = () => $("import-file").click();
  $("import-file").onchange = (e) => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ""; };

  $("btn-clear-chat").onclick = () => {
    const b = bot(editingBotId);
    if (b && confirm("Clear all messages with " + b.name + "? Memory is kept.")) {
      b.messages = []; save(); toast("Chat cleared"); history.back();
    }
  };
  $("btn-delete-bot").onclick = () => {
    const b = bot(editingBotId);
    if (b && confirm("Delete " + b.name + " and its chat?")) {
      state.bots = state.bots.filter((x) => x.id !== b.id); save();
      currentBotId = null;
      history.go(-2);
    }
  };

  const input = $("input");
  const autosize = () => { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 140) + "px"; };
  input.addEventListener("input", autosize);
  input.addEventListener("keydown", (e) => {
    // Enter sends on desktop; on phones Enter adds a new line (use the send button)
    if (e.key === "Enter" && !e.shiftKey && !("ontouchstart" in window)) { e.preventDefault(); $("composer").requestSubmit(); }
  });
  $("composer").addEventListener("submit", (e) => {
    e.preventDefault();
    if (abortCtrl) { abortCtrl.abort(); return; }
    const t = input.value.trim();
    if (!t) return;
    input.value = ""; autosize();
    send(t);
  });

  // start
  save(); // persist any one-time upgrade done in load()
  history.replaceState({ view: "list" }, "", "#list");
  renderList();
  show("list", false);
  if (OFFLINE_ONLY) {
    document.title = "SRK Bot Offline";
    $("edition-tag").textContent = "Offline";
    $("online-settings").classList.add("hidden");
    $("key-warning").innerHTML = "Download an offline AI model in <b>Settings</b> to start chatting (one time, over Wi-Fi).";
    $("offline-hint").textContent = "Download a model once over Wi-Fi. Everything then runs on your phone — no internet, no API key, free and private. Bigger models are smarter but slower.";
    document.querySelectorAll(".app-name").forEach((e) => (e.textContent = "SRK Bot Offline"));
  } else if (!hasAnyKey()) setTimeout(openSettings, 300);
})();
