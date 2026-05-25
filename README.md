# RPGX AI Assistant
### AI-Powered GM Assistant for Foundry VTT

**Version:** v3.2.0 | **Last Updated:** May 2026
**Compatibility:** Foundry VTT v10+ (Verified on v14)

---

## What is RPGX AI?

RPGX AI is a privacy-first AI assistant for Game Masters running Foundry VTT. It connects directly to a locally running [Ollama](https://ollama.com) instance, meaning your world data, session notes, and queries **never leave your machine** — no cloud, no subscriptions, no data collection.

Ask questions directly from Foundry chat, get world-aware answers powered by your own custom knowledge base, and keep your game moving without ever breaking immersion.

RPGX AI is a two-part system:

- **`rpgx-ai`** — The free Foundry VTT module (this package). Handles in-game chat, knowledge base management, and AI responses inside Foundry.
- **[RPGX Proton](http://www.rpgxstudios.com)** — The companion Windows desktop app. Bundles Ollama and the RAG server into a single zero-config install. Recommended for all users, especially those on remote Foundry hosting.

---

## Features

### In-Game AI Chat
- Query the AI directly from the Foundry chat window using simple slash commands
- Streaming responses with live token-by-token output and a blinking cursor indicator
- Full markdown rendering — bold, italics, headers, lists, and code blocks render beautifully in chat
- **Persistent conversation memory** — the AI remembers the last 8 exchanges in each session, so follow-up questions work naturally
- Reset conversation context at any time with a chat command

### Knowledge Base (RAG)
- **Document Manager** — a full inbox-style panel (launched from the globe toolbar button) with checkboxes, filters, and bulk actions for managing your ingested documents
- Ingest journal entries and actor notes directly from Foundry into your world's knowledge database
- Per-world database isolation — each world has its own private knowledge store
- Paragraph-aware chunking for higher-quality retrieval (not simple character slicing)
- Remove individual documents or wipe the entire world database from the Knowledge Base settings panel
- **PDF ingestion** — ingest PDF documents page by page directly into your world knowledge base
- **Image ingestion** — images are automatically analyzed and their content is described and ingested (powered by server-side vision model, fully automatic and transparent to the user)

### Broadcast Mode
- AI replies can be queued and displayed to all players in the Foundry chat
- Proton queues AI replies via the broadcast system; the Foundry module polls every 5 seconds and delivers them automatically

### Model Flexibility
- Choose your Ollama model from within Foundry settings
- Supports standard dropdown selection or typing a custom model name directly
- Default model: `qwen2.5:7b` — also tested with `qwen2.5:14b` and `qwen3:30b`

### Privacy First
- All inference runs on your own hardware via Ollama
- No external API calls — ever
- Your world content, session notes, and queries are never transmitted to any third-party service

---

## RPGX Proton (Companion App)

**RPGX Proton** is the recommended companion desktop application for Windows. It handles everything outside of Foundry so you don't have to configure anything manually.

### What Proton Does
- Bundles and manages Ollama as a background process — no separate install needed
- Runs the RAG server locally with zero configuration
- Provides a standalone **Query & Chat panel** with streaming responses, world context selection, and model selection
- Includes a **GM Notebook** for maintaining persistent notes between sessions, with a "Copy to World" feature to push notebook entries into your world's knowledge base
- **Broadcast feature** — send AI responses directly into Foundry chat for your players to see
- Downloads and manages AI models (`qwen2.5:7b` included as part of setup)
- Minimize to system tray — runs quietly in the background while you GM
- First-run wizard walks you through setup with no technical knowledge required

> **RPGX Proton is a paid application.** The `rpgx-ai` Foundry module is free and open source. Visit [rpgxstudios.com](http://www.rpgxstudios.com) for Proton details and pricing.

---

## Requirements

### With RPGX Proton (Recommended)
- Foundry VTT v11 or higher
- Windows PC (for Proton)
- That's it — Proton handles everything else

### Manual / Advanced Setup
- Foundry VTT v11 or higher
- [Ollama](https://ollama.com) installed and running locally or on your network
- RPGX RAG Server v2 running locally (Node.js required)

---

## Supported Foundry Configurations

RPGX AI is designed to work across all common Foundry hosting setups:

| Setup | Description | Notes |
|---|---|---|
| **Remote Server** | Foundry hosted on a VPS or dedicated server | Proton is highly recommended — handles local Ollama + RAG while Foundry runs remotely |
| **Local Network** | Foundry running on a dedicated machine on your home network | Configure RAG Server URL to point to the machine running Proton or the RAG server |
| **GM's Own Machine** | Foundry runs on the same computer you GM from | Simplest setup — everything runs on one machine |

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
2. Set your **RAG Server URL** — this is the address of the machine running Proton or your manual RAG server
   - Same machine: `http://localhost:3001`
   - Another machine on your network: `http://192.168.x.x:3001`
3. Set your **Ollama Model** (e.g. `qwen2.5:7b`)
4. Adjust **Max Tokens**, **Timeout**, and **RAG Top K** as needed (defaults work well for most GMs)

---

## Chat Commands

| Command | What it does |
|---|---|
| `/rpgx [question]` | Ask the AI a question |
| `/ai [question]` | Same as `/rpgx` — alternate shorthand |
| `/rpgx clear` | Clear conversation history and start fresh |
| `/ai clear` | Same as `/rpgx clear` |
| `/rpgx newchat` | Start a new conversation session |
| `/ai newchat` | Same as `/rpgx newchat` |

---

## Architecture Overview

RPGX AI is built around a split-machine architecture so that AI inference stays fully local — even when Foundry is hosted remotely:

```
Foundry VTT (any machine — remote server, local network, or GM's PC)
        ↕  HTTP
   RAG Server (GM's local machine)  ←→  Ollama (GM's local machine)
```

The Foundry module communicates with the RAG server, which handles knowledge base queries and proxies Ollama requests. No data is transmitted outside your local network.

RPGX Proton manages the RAG server and Ollama automatically on the GM's machine, making this architecture invisible to the end user.

---

## Privacy

RPGX AI is built privacy-first from the ground up. All inference runs on your own hardware via Ollama. The module and RAG server make **no external API calls**. Your world content, session notes, and queries are **never transmitted to any third-party service.**

---

## Development Log

### v3.2.0 — May 2026
- Added PDF page ingestion via new `/ingest/pdf` endpoint on the RAG server
- Added image ingestion with automatic server-side visual analysis
- Bulk document ingest with batching (3 documents per batch, 300ms gaps) and live progress bar
- Progress UI added to Document Manager during large ingestion jobs

### v3.1.x
- Document Manager redesigned as floating Gmail inbox-style panel (launched via globe toolbar button)
- Checkbox selection, column filters, and bulk actions (ingest, remove) added to Document Manager
- Actor ingestion added alongside journal entry ingestion

### v3.0.x
- Full module consolidation — RPGX AI Assistant and RPGX AI Librarian merged into a single unified module (`rpgx-ai`)
- Per-world database isolation using sql.js (WASM SQLite) for Node 24 compatibility
- Paragraph-aware document chunking replaced fixed character slicing
- Cosine similarity scoring with configurable minimum threshold
- Global + world-specific knowledge chunk merging before scoring
- Startup performance reminder dialog with persistent dismiss checkbox

### v2.0.x
- Persistent AI conversation with rolling 8-exchange memory via `/api/chat`
- `/ai` command added as alternate to `/rpgx`
- `/rpgx clear`, `/rpgx newchat` commands added to reset context
- Hallucination guardrails — AI distinguishes unknown lore, real-world entities, and creation requests
- Streaming responses with live token output and blinking cursor
- Markdown rendering in Foundry chat
- Broadcast polling system — Proton queues replies, Foundry polls every 5 seconds
- Automatic update detection through Foundry's module manager
- Model selection via MutationObserver-based dropdown with custom model name support

---

## License

Copyright © 2026 Ashton Rogers | RPGX Studios | X8 Studios

The **rpgx-ai Foundry module** is released under the MIT License.

**RPGX Proton** is a proprietary commercial application and is not open source. All rights reserved.

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
