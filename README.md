# SRK Bot

Your own team of AI bots in one chat app, powered by **Google Gemini** (free) or **OpenAI**. Part of the SRK app family by ShazVerse Technologies.

Each bot has its own **name, avatar, personality, model, chat thread and long-term memory**. Everything runs on your phone — no server or laptop needed.

## Features
- Multiple bots, each with its own personality and chat history
- Long-term memory per bot (edit it yourself, or let the bot save new facts automatically)
- Choose a model per bot: Gemini (3.8 Flash, 3.5 Flash-Lite, 4 Argon) or OpenAI GPT — or any model on your account
- Live streaming replies, stop button, markdown + code formatting
- Export / import bots and chats as a backup file
- Dark theme, Android back button support

Comes with three starter bots: **SRK Assistant**, **Surgery Tutor**, **Idea Partner**.

## Install on Android
1. Open the **Releases** page of this repo on your phone.
2. Download `SRK-Bot.apk` from the latest release and open it.
3. Allow "Install unknown apps" if asked.

Every push to `main` builds a new APK automatically (GitHub Actions → *Build SRK Bot APK*).

## Set up
1. Get a free Gemini API key at **aistudio.google.com → Get API key** (no card needed).
2. Optional: an OpenAI key from **platform.openai.com** (needs paid credit) for GPT bots.
3. Open SRK Bot → ⚙️ Settings → paste the key(s) → **Save, test keys & load my models**.

**Never put your API keys in this repo** — it is public and the keys would be stolen.

`signing/debug.keystore` is a debug signing key kept here only so each new APK installs as an update over the previous one.

Your key and chats are stored only on your device. Keys are sent only to Google (`generativelanguage.googleapis.com`) or OpenAI (`api.openai.com`).

## Try it in a browser
```
npm run serve
```
Then open http://localhost:5173 (works on Windows too).

## Credits
Inspired by the idea behind [OpenMausBot](https://github.com/milind-soni/OpenMausBot) (Apache-2.0): AI as a messaging app with a roster of bots. SRK Bot is an independent, simpler, phone-only implementation and shares no code with it.
