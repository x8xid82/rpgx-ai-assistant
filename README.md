Overview
RPG AI Assistant is a Foundry VTT module that connects your game world to a local AI language model. Using Retrieval-Augmented Generation (RAG), the assistant builds a searchable knowledge base from your world's journals and actor documents, then answers GM queries with context drawn directly from your own campaign materials.
No cloud. No subscriptions. No sending your world data to a third party. Everything runs locally on your machine via Ollama.

Features

🧠 World-Aware AI — Ingests your Foundry journals and actor sheets to build a per-world knowledge base
💬 Streaming Chat Interface — Real-time responses with a live cursor and full markdown rendering
📡 Broadcast to Chat — Send AI answers directly into Foundry's game chat as GM messages
📚 Document Manager — Gmail-style panel for selecting, filtering, and ingesting world documents
🗂️ Knowledge Base Panel — Per-document ingest and removal controls with world-scoped RAG
🌐 Model Selection — Choose from any model available in your local Ollama instance
⚙️ Configurable Settings — Adjustable token limits, timeout, top-K retrieval, game system, and more


Requirements
DependencyVersionNotesFoundry VTTv10+RequiredOllamaLatestLocal LLM runtimeRPG AI RAG ServerLatestRequired companion server (see below)Node.jsv18+For running the RAG server
Recommended Models (via Ollama)

qwen2.5:14b — Fast, strong reasoning; great for most campaigns
qwen3:30b — Higher quality; recommended for large or complex worlds
nomic-embed-text — Required for embedding generation (must be pulled)

bashollama pull nomic-embed-text
ollama pull qwen2.5:14b

Installation
1. Install the Foundry Module
In Foundry VTT, go to Add-on Modules → Install Module and paste the following manifest URL:
https://raw.githubusercontent.com/X8Studios/rpg-ai-assistant/main/module.json
Or download the latest release and install manually via the Foundry module manager.
Module ID: rpgx-ai

2. Set Up the RAG Server
The RPG AI Assistant requires the companion RAG Server to handle embeddings, vector search, and Ollama communication.
Clone and start the server:
bashgit clone https://github.com/X8Studios/rpg-ai-rag-server.git
cd rpg-ai-rag-server
npm install
node server.cjs
On Windows, use the included PowerShell launcher:
powershellpowershell -ExecutionPolicy Bypass -File .\start-RAG.ps1
The RAG server runs on http://localhost:3001 by default.

Note: The RAG server must be running on the same machine as Ollama. If you're hosting Foundry on a separate machine, see the Network Configuration section below.


3. Configure the Module
In Foundry VTT, open Module Settings → RPG AI Assistant and configure:
SettingDefaultDescriptionRAG Server URLhttp://localhost:3001Address of your running RAG serverLanguage Modelqwen2.5:14bOllama model to use for responsesGame SystemD&D 5.5E (2024)Informs AI of your ruleset contextMax Tokens4096Maximum response lengthRequest Timeout300000 msTime to wait before aborting a queryRAG Top-K10Number of document chunks to retrieve per query

Usage
Opening the Assistant
Click the globe icon (🌐) in the Foundry toolbar to open the RPG AI Assistant panel.
Ingesting Your World

Open the Document Manager (📁 icon in the assistant panel)
Select the journals and actors you want the AI to learn from
Click Ingest Selected — your documents are chunked, embedded, and stored locally

Re-ingest any time your world content changes. Each world maintains its own isolated knowledge base.
Asking Questions
Type your question in the chat input and press Enter or click Ask. The assistant streams its response in real time, pulling relevant context from your ingested documents.
Example queries:

"What do we know about the Thornwood Cult?"
"Summarize Mira Voss's backstory."
"What happened at the Battle of the Ember Gates?"

Broadcasting to Game Chat
Click the Broadcast button (📢) on any response to send it into Foundry's game chat as a GM message. Players will see the answer without the original question.

Network Configuration
By default, RPG AI Assistant assumes Foundry, Ollama, and the RAG server all run on the same machine.
If Foundry is hosted on a separate server:
The RAG server includes an Ollama proxy at /ollama/generate to handle cross-origin requests. Configure your RAG Server URL in module settings to point to the machine running the RAG server (e.g., http://192.168.1.50:3001).
RPGX Proton users: The RPGX Proton desktop app handles all of this automatically, including remote Foundry support, bundled model management, and a GM Notebook with persistent global notes.

Product Tiers
RPG AI Assistant (Free)RPGX Proton (Paid)Foundry VTT Module✅✅Local Foundry Setup✅✅Remote/Hosted FoundryManual setup✅ AutomaticGM Notebook (Global Notes)❌✅Integrated RAG Server UI❌✅Guided First-Run Setup❌✅
→ Learn more at RPGXStudios.com

Troubleshooting
The assistant isn't responding.

Confirm the RAG server is running and accessible at the configured URL
Check that Ollama is running (ollama list in your terminal)
Verify nomic-embed-text has been pulled

Responses are slow or timing out.

Increase the Request Timeout in module settings (recommended: 300000 ms for large models)
Consider using a smaller model such as qwen2.5:14b for faster responses

The AI doesn't know about my world content.

Open the Document Manager and re-ingest your journals and actors
Check the Knowledge Base panel to confirm documents show as ingested
Make sure the correct world is active when ingesting

Broadcast messages don't appear in chat.

Confirm the Foundry module is active and the RAG server is reachable
The module polls for pending broadcasts every 5 seconds — wait a moment after clicking Broadcast


Contributing
This module is actively developed by X8 Studios. Bug reports and feature requests are welcome via the Issues tab.
Please do not submit pull requests without first opening a discussion issue.

License
© 2025 X8 Studios / RPGX Studios. All rights reserved.
This module is provided for personal use. Redistribution, modification, or commercial use without explicit written permission from X8 Studios is prohibited.

Links

🌐 RPGXStudios.com
📦 RPGX Proton Desktop App
🐛 Report an Issue
💬 Foundry VTT Discord
