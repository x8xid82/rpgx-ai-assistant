# RPGX AI Assistant
### AI-Powered GM Assistant for Foundry VTT

**Version:** v2.0.2 | **Last Updated:** April 25, 2026
**Compatibility:** Foundry VTT v11+ (Verified on v13)

---

## What is RPGX AI?

RPGX AI is a privacy-first AI assistant for Game Masters running Foundry VTT. It connects directly to a locally running [Ollama](https://ollama.com) instance, meaning your world data, session notes, and queries never leave your machine — no cloud, no subscriptions, no data collection.

Ask questions in the Foundry chat, get world-aware answers powered by your own knowledge base, and keep your game moving without breaking immersion.

---

## Features

- **Local AI Inference** — Connects to Ollama running on your own hardware. Your data stays yours.
- **RAG Knowledge Base** — Ingest journal entries and actor notes into a per-world knowledge database for context-aware answers.
- **Foundry Chat Integration** — Query the AI directly from the Foundry chat window with streaming responses.
- **Markdown Rendering** — AI responses render with full markdown formatting in chat.
- **Broadcast Mode** — AI replies can be queued and displayed to players in chat.
- **Per-World Scoping** — Each world maintains its own isolated knowledge database.
- **GM Notebook** — Maintain persistent GM notes and copy them into world knowledge bases.

---

## Requirements

- Foundry VTT v11 or higher
- [Ollama](https://ollama.com) running locally or on your network
- [RPGX Proton](http://www.rpgxstudios.com) desktop app (recommended) **or** a manually configured RAG server

> **RPGX Proton** is the companion desktop app that bundles everything you need — Ollama management, the RAG server, and a standalone query panel — into a single Windows application. Ideal for GMs on remote Foundry hosting.

---

## Installation

### Via Foundry Module Manager (Recommended)

1. Open Foundry VTT
2. Go to **Settings → Install Add-on Module**
3. Paste the manifest URL:
   ```
   https://github.com/x8xid82/rpgx-ai-assistant/releases/latest/download/module.json
   ```
4. Click **Install**

### Manual Installation

See [MANUAL_INSTALL.md](./MANUAL_INSTALL.md) for step-by-step instructions — recommended for headless server users.

---

## Configuration

Once the module is enabled in your world:

1. Go to **Settings → Module Settings → RPGX AI**
2. Set your **RAG Server URL** (e.g. `http://localhost:3001`)
3. Set your **Ollama Model** (e.g. `qwen2.5:14b`)
4. Adjust **Max Tokens** (default: 4096), **Timeout** (default: 300000ms), and **RAG Top K** (default: 10) as needed

---

## Development Log

### v2.0.2 — April 25, 2026
- Added automatic update detection through Foundry's built-in module manager
- Linked version number to GitHub Releases for proper manifest hosting
- Fixed module.json asset publishing pipeline

### v2.0.1
- Set AI queries to run as a persistent chat with memory (8 message context window)
- Added `/ai` chat command for querying the assistant
- Added `/rpgx clear`, `/ai clear`, `/rpgx newchat`, `/ai newchat` commands to reset chat context
- Added query guardrails to reduce false positives and hallucinations
- Added instructions for AI to notate when it could not find information

### v2.0.0 — Early Release
- Query Ollama directly from Foundry chat
- Single query threads (no memory)
- RAG functions (browser-tethered)

---

## Architecture Overview

RPGX AI is designed around a split-machine architecture to keep inference fully local:

```
Foundry VTT (remote server)
        ↕  HTTP
RAG Server (local machine) ← → Ollama (local machine)
```

The Foundry module communicates with the RAG server, which handles knowledge base queries and proxies requests to Ollama. No data is transmitted outside your local network.

---

## Privacy

RPGX AI is built privacy-first. All inference runs on your own hardware via Ollama. The module and RAG server make no external API calls. Your world content, session notes, and queries are never transmitted to any third-party service.

---

## License

MIT License

Copyright © 2026 RPGX Studios | X8 Studios

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

---

## Credits

**Written & Designed by:** Ashton Rogers
**Owned by:** RPGX Studios | X8 Studios

---

## Links

| | |
|---|---|
| 🌐 Website | [rpgxstudios.com](http://rpgxstudios.com) |
| 💬 Discord | [discord.gg/2xYN3FF4U](https://discord.gg/2xYN3FF4U) |
| ❤️ Patreon | [patreon.com/c/rpgxstudios](https://www.patreon.com/c/rpgxstudios) |
| 📘 Facebook | [RPGX Game Studios](https://www.facebook.com/p/RPGX-Game-Studios-100063706171843/) |
| 📦 Releases | [GitHub Releases](https://github.com/x8xid82/rpgx-ai-assistant/releases) |
