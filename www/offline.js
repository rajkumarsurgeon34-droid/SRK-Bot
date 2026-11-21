// SRK Bot — Offline AI: runs a small open model directly on the phone (llama.cpp via wllama).
// The model is downloaded once from Hugging Face and kept in the app's private storage.
import { Wllama } from "./vendor/wllama/index.js";

const HF = "https://huggingface.co/";
export const LOCAL_MODELS = [
  {
    id: "local:gemma-3-1b",
    label: "Gemma 3 1B (Google) — balanced",
    url: HF + "ggml-org/gemma-3-1b-it-GGUF/resolve/main/gemma-3-1b-it-Q4_K_M.gguf",
    sizeMB: 810,
  },
  {
    id: "local:qwen2.5-1.5b",
    label: "Qwen 2.5 1.5B — smartest offline",
    url: HF + "Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf",
    sizeMB: 1120,
  },
  {
    id: "local:qwen2.5-0.5b",
    label: "Qwen 2.5 0.5B — fastest, smallest",
    url: HF + "Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf",
    sizeMB: 400,
  },
];
const N_CTX = 4096;

let wllama = null;
let loadedId = null;
let loading = null;

function engine() {
  if (!wllama) {
    wllama = new Wllama(
      { default: new URL("./vendor/wllama/wllama.wasm", import.meta.url).href },
      { allowOffline: true, skipVersionCheck: true, suppressNativeLog: true }
    );
  }
  return wllama;
}
const info = (id) => LOCAL_MODELS.find((m) => m.id === id);

async function cachedModel(id) {
  const m = info(id);
  if (!m) return null;
  const models = await engine().modelManager.getModels();
  return models.find((x) => x.url === m.url) || null;
}

/** ids of fully downloaded models */
export async function downloaded() {
  try {
    const models = await engine().modelManager.getModels();
    return LOCAL_MODELS.filter((m) => models.some((x) => x.url === m.url)).map((m) => m.id);
  } catch (e) {
    return [];
  }
}

export async function download(id, onProgress, signal) {
  const m = info(id);
  if (!m) throw new Error("Unknown offline model");
  await engine().modelManager.downloadModel(m.url, {
    signal,
    progressCallback: ({ loaded, total }) => onProgress && onProgress(loaded, total),
  });
}

export async function remove(id) {
  if (loadedId === id) await unload();
  const model = await cachedModel(id);
  if (model) await model.remove();
}

export async function unload() {
  if (wllama && loadedId) {
    try { await wllama.exit(); } catch (e) {}
    wllama = null;
  }
  loadedId = null;
}

async function ensureLoaded(id, onStatus) {
  if (loadedId === id) return;
  if (loading) await loading.catch(() => {});
  if (loadedId === id) return;
  loading = (async () => {
    await unload();
    const model = await cachedModel(id);
    if (!model) throw new Error("This offline model isn't downloaded yet. Download it in ⚙️ Settings → Offline AI.");
    onStatus && onStatus("Loading offline model into memory…");
    try {
      await engine().loadModel(model, { n_ctx: N_CTX }); // uses the phone GPU (WebGPU) when available
    } catch (e) {
      // GPU path failed on this device — retry on CPU only
      try { await wllama.exit(); } catch (x) {}
      wllama = null;
      onStatus && onStatus("Loading offline model (CPU mode)…");
      await engine().loadModel(model, { n_ctx: N_CTX, n_gpu_layers: 0 });
    }
    loadedId = id;
  })();
  try { await loading; } finally { loading = null; }
}

/**
 * Stream a chat reply. onText receives each new piece of text.
 * messages: [{role:'user'|'assistant', content}]
 */
export async function chat({ id, system, messages, maxTokens, signal, onText, onStatus }) {
  await ensureLoaded(id, onStatus);
  onStatus && onStatus("");
  const msgs = [{ role: "system", content: system }, ...messages];
  const stream = await wllama.createChatCompletion({
    messages: msgs,
    max_tokens: Math.min(maxTokens || 1024, 2048),
    temperature: 0.7,
    top_p: 0.9,
    top_k: 40,
    stream: true,
    abortSignal: signal,
  });
  for await (const chunk of stream) {
    const c = chunk && chunk.choices && chunk.choices[0];
    const t = c && c.delta && c.delta.content;
    if (t) onText(t);
  }
}

window.SRKOffline = { LOCAL_MODELS, downloaded, download, remove, chat, unload };
window.dispatchEvent(new Event("srk-offline-ready"));
