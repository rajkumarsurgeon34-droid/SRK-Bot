# SRK Bot

Your own team of AI bots in one chat app, powered by **Google Gemini** (free), **DeepSeek** (very cheap), **OpenRouter's free models** or **OpenAI**. Part of the SRK app family by ShazVerse Technologies.

Each bot has its own **name, avatar, personality, model, chat thread and long-term memory**. Everything runs on your phone — no server or laptop needed.

## Features
- Multiple bots, each with its own personality and chat history
- Long-term memory per bot (edit it yourself, or let the bot save new facts automatically)
- Choose a model per bot: Gemini (3.8 Flash, 3.5 Flash-Lite, 4 Argon), DeepSeek V4.1 Flash or OpenAI GPT — or any model on your account
- **Offline AI**: download Gemma 3 1B, Qwen 2.5 1.5B or Qwen 2.5 0.5B once and chat with no internet (runs on the phone via llama.cpp / wllama). Bots fall back to it automatically when offline
- **Free backup AI**: add a free OpenRouter key and, when Gemini hits its free limit, bots answer with OpenRouter's free models (DeepSeek, Llama, Qwen…) automatically
- Live streaming replies, stop button, markdown + code formatting
- Export / import bots and chats as a backup file
- Dark theme, Android back button support

Comes with three starter bots: **SRK Assistant**, **Surgery Tutor**, **Idea Partner**.

## Two apps
- **SRK Bot** (`SRK-Bot.apk`, red icon) — online bots with Gemini / DeepSeek / OpenAI, plus offline backup.
- **SRK Bot Offline** (`SRK-Bot-Offline.apk`, green icon) — fully on-device, no API key, no internet after the one-time model download.

They install side by side. Both are built from this repo (`node scripts/edition.js full|offline`).

## Install on Android
1. Open the **Releases** page of this repo on your phone.
2. Download `SRK-Bot.apk` and/or `SRK-Bot-Offline.apk` from the latest release and open it.
3. Allow "Install unknown apps" if asked.

Every push to `main` builds a new APK automatically (GitHub Actions → *Build SRK Bot APK*).

## Set up
1. Get a free Gemini API key at **aistudio.google.com → Get API key** (no card needed).
2. Optional, free: an OpenRouter key from **openrouter.ai → Keys** (no card) as a backup when Gemini is over its limit.
3. Optional: a DeepSeek key from **platform.deepseek.com → API keys** (small prepaid top-up, pay-as-you-go) for DeepSeek V4.1 Flash bots.
4. Optional: an OpenAI key from **platform.openai.com** (needs paid credit) for GPT bots.
5. Open SRK Bot → ⚙️ Settings → paste the key(s) → **Save, test keys & load my models**.

**Never put your API keys in this repo** — it is public and the keys would be stolen.

`signing/debug.keystore` is a debug signing key kept here only so each new APK installs as an update over the previous one.

Your key and chats are stored only on your device. Keys are sent only to Google (`generativelanguage.googleapis.com`), DeepSeek (`api.deepseek.com`), OpenRouter (`openrouter.ai`) or OpenAI (`api.openai.com`).

## Try it in a browser
```
npm run serve
```
Then open http://localhost:5173 (works on Windows too).

## Offline AI
Settings → 📴 Offline AI → Download (use Wi-Fi, keep the app open). Then pick the model for any bot (✏️ → Model). Models come from Hugging Face (ggml-org/gemma-3-1b-it-GGUF, Qwen/Qwen2.5-*-Instruct-GGUF) and are stored in the app's private storage.

## Credits
Offline engine: [wllama](https://github.com/ngxson/wllama) (MIT), a WebAssembly build of llama.cpp.
Inspired by the idea behind [OpenMausBot](https://github.com/milind-soni/OpenMausBot) (Apache-2.0): AI as a messaging app with a roster of bots. SRK Bot is an independent, simpler, phone-only implementation and shares no code with it.
