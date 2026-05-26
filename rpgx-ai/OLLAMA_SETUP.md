# RPGX AI — Ollama Configuration Guide

This guide covers how to connect the RPGX AI Foundry module to an Ollama server for local AI responses. An in-game version of this guide is available via **Game Settings → RPGX AI → Open Setup Guide**.

---

## What is Ollama?

Ollama is a free, open-source tool that lets you run AI language models entirely on your own machine — no internet connection, no API fees, no data leaving your network. RPGX AI uses Ollama to generate responses in the Foundry chat.

---

## Option A — Ollama on the same machine as Foundry

This is the simplest setup. Ollama and Foundry VTT both run on your PC.

1. **Download and install Ollama** from [https://ollama.ai](https://ollama.ai).

2. **Pull a language model.** Open a terminal (PowerShell on Windows, Terminal on Mac/Linux) and run:
   ```
   ollama pull qwen2.5:14b
   ```
   This downloads the model (~8.5 GB). Other good options: `qwen2.5:7b` (~4.5 GB), `llama3.1:8b` (~4.5 GB), `mistral:7b` (~4 GB).

3. **Ollama starts automatically** on `http://127.0.0.1:11434`.

4. In Foundry, go to **Game Settings → RPGX AI**:
   - Set **Ollama Base URL** to `http://127.0.0.1:11434`
   - Set **Language Model** to the model you pulled (e.g. `qwen2.5:14b`)
   - Leave **Use RAG Server** unchecked unless you have RPGX Proton installed

5. **Test it.** Type `/rpgx Hello!` in the Foundry chat. You should see a response appear.

---

## Option B — Ollama on a separate server (network install)

Use this if Foundry runs on a remote server or a second PC on your network, and you want the AI to run on a different (more powerful) machine.

1. **Install Ollama on your AI machine** and pull your models (same as steps 1–2 above).

2. **Allow network access.** By default Ollama only listens on `localhost`. You need to expose it:

   **Windows:**
   - Open System Properties → Advanced → Environment Variables
   - Add a new System variable: Name = `OLLAMA_HOST`, Value = `0.0.0.0:11434`
   - Restart Ollama (right-click the tray icon → Quit, then relaunch)

   **Linux (systemd):**
   ```bash
   sudo systemctl edit ollama
   ```
   Add under `[Service]`:
   ```
   Environment="OLLAMA_HOST=0.0.0.0:11434"
   ```
   Then:
   ```bash
   sudo systemctl daemon-reload && sudo systemctl restart ollama
   ```

3. **Find the machine's IP address.**
   - Windows: `ipconfig` in PowerShell → look for IPv4 Address (e.g. `192.168.0.134`)
   - Linux/Mac: `ip addr` or `ifconfig`

4. **Open firewall port 11434** (TCP inbound) on the Ollama machine so Foundry can reach it.

5. In Foundry **Game Settings → RPGX AI**:
   - Set **Ollama Base URL** to `http://192.168.0.134:11434` (use your machine's actual IP)
   - Set **Language Model** to your model name
   - Save and test with `/rpgx Hello!`

---

## Troubleshooting

| Problem | Fix |
|---|---|
| No response / timeout | Verify Ollama is running: `ollama list` in a terminal. Check the URL has no trailing slash. |
| CORS error in browser console | Set environment variable `OLLAMA_ORIGINS=*` and restart Ollama. |
| Model not found | Run `ollama pull <model-name>`. The name in settings must match exactly including the tag (e.g. `qwen2.5:14b`). |
| Very slow responses | Close background apps. Try a smaller model (7b instead of 14b). Lower Max Tokens in settings. |
| Works locally but not from Foundry server | The Ollama machine's firewall is likely blocking port 11434. Check `OLLAMA_HOST` is set to `0.0.0.0`. |

---

## Recommended Models

| Model | Size | Best for |
|---|---|---|
| `qwen2.5:14b` | ~8.5 GB | Best quality for mid-range hardware (default) |
| `qwen2.5:7b` | ~4.5 GB | Good quality, faster on lower-end hardware |
| `llama3.1:8b` | ~4.5 GB | Strong general-purpose alternative |
| `mistral:7b` | ~4 GB | Fast, good for quick rulings |
| `qwen3:30b` | ~18.6 GB | Highest quality, requires 24GB+ VRAM |

---

## RPGX Proton (Premium)

RPGX Proton is a desktop companion app that adds a **RAG knowledge base** to RPGX AI. With Proton, the AI learns your world's lore — journals, character sheets, house rules — and uses that knowledge when answering questions during play.

Download: [RPGXStudios.com/proton](https://RPGXStudios.com/proton)
