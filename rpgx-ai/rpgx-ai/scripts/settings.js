// scripts/settings.js — Unified settings for RPGX AI
export const moduleName = "rpgx-ai";

export function registerSettings() {
  const M = moduleName;

  // ── Ollama connection ──
  game.settings.register(M, "ollamaBaseUrl", {
    name: "Ollama Base URL",
    hint: "Example: http://192.168.0.134:11434 (no trailing slash)",
    scope: "world",
    config: true,
    type: String,
    default: "http://127.0.0.1:11434",
  });

  game.settings.register(M, "ollamaModel", {
    name: "AI Model Tier",
    hint: "Select performance tier based on your PC specs. Models must be installed via RPGX Proton. " +
          "Lite (3b) = 4-6GB RAM | Standard (7b) = 8GB+ RAM | Performance (14b) = 16GB+ RAM | Ultra (30b) = 32GB+ RAM",
    scope: "world",
    config: true,
    type: String,
    default: "qwen2.5:7b",  // Standard tier default — matches Quest Log
  });

  // ── Generation settings ──
  game.settings.register(M, "temperature", {
    name: "Temperature",
    hint: "0.0 = deterministic; higher = more creative",
    scope: "world",
    config: true,
    type: Number,
    range: { min: 0, max: 1.0, step: 0.1 },
    default: 0.5,
  });

  game.settings.register(M, "maxTokens", {
    name: "Max Tokens (num_predict)",
    hint: "Upper bound for generated tokens. Higher values allow longer responses.",
    scope: "world",
    config: true,
    type: Number,
    default: 4096,
  });

  game.settings.register(M, "timeoutMs", {
    name: "Request Timeout (ms)",
    hint: "How long to wait for a response. 300000 = 5 minutes. Increase for large databases or complex queries.",
    scope: "world",
    config: true,
    type: Number,
    default: 300000,
  });

  // ── Ollama Configuration Guide button ──
  game.settings.registerMenu(M, "ollamaGuide", {
    name: "Ollama Configuration Guide",
    label: "Open Setup Guide",
    hint: "Step-by-step instructions for connecting Ollama to RPGX AI — local and network installs.",
    icon: "fas fa-book-open",
    type: RPGXOllamaGuide,
    restricted: false,
  });

  // ── Game system ──
  game.settings.register(M, "gameSystem", {
    name: "Game System",
    hint: "Type your game system as you want it referenced in AI responses. " +
          "Examples: D&D 5.5E (2024), D&D 5E (2014), Pathfinder 2E, Shadowrun 6E, " +
          "Vampire the Masquerade 5E, Cyberpunk RED, Star Wars RPG, Call of Cthulhu, " +
          "Blades in the Dark, Starfinder, Savage Worlds.",
    scope: "world",
    config: true,
    type: String,
    default: "D&D 5.5E (2024)",
  });

  // ── Startup reminder (client-scoped so each user controls their own) ──
  game.settings.register(M, "showStartupReminder", {
    name: "Show startup reminder",
    hint: "Displays a reminder to close unnecessary background apps before generating AI responses.",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
  });

  // ── Player Query Settings ─────────────────────────────────────────────────
  // scope:"world" means the GM sets these and all clients can read them.
  // Players read enablePlayerQueries to decide whether to allow submission.

  game.settings.register(M, "enablePlayerQueries", {
    name: "Enable Player Queries",
    hint: "Allow non-GM players to submit AI queries through the brain button. " +
          "Queries route to the GM's Ollama/RAG instance for processing.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
  });

  game.settings.register(M, "autoApprovePlayerQueries", {
    name: "Auto-approve Player Queries",
    hint: "Process player queries immediately without showing a GM approval popup. " +
          "Only active when Enable Player Queries is checked.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
  });

  // ── RAG server ────────────────────────────────────────────────────────────
  game.settings.register(M, "useRag", {
    name: "Use RAG Server",
    hint: "If enabled, the assistant checks your Proton knowledge base first for contextual answers.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,   // On by default — Proton users get RAG immediately
  });

  game.settings.register(M, "ragBase", {
    name: "RAG Server Base URL",
    hint: "e.g., http://127.0.0.1:3033 (no trailing slash) — provided by RPGX Proton",
    scope: "world",
    config: true,
    type: String,
    default: "http://127.0.0.1:3033",
  });

  // ragToken: auth token copied from RPGX Proton → Settings.
  // The server requires this on every protected endpoint once Proton 2.1+ is installed.
  game.settings.register(M, "ragToken", {
    name: "RAG Server Token",
    hint: "Copy this from RPGX Proton → Settings. Required for secure communication with Proton.",
    scope: "world",
    config: true,
    type: String,
    default: "",
  });

  // ── Hidden settings ──
  game.settings.register(M, "dismissStartupNotice", {
    scope: "client",
    config: false,
    type: Boolean,
    default: false,
  });
}

/** Read a setting safely with a fallback */
export function getSetting(key, fallback = null) {
  try {
    return game.settings.get(moduleName, key);
  } catch {
    return fallback;
  }
}

/** System prompt for direct Ollama calls */
export function buildSystemPrompt() {
  const system = getSetting("gameSystem", "D&D 5.5E (2024)");
  return (
    `You are RPGX-AI, an expert assistant to a game master running a "${system}" campaign.\n` +
    `Answer questions using your knowledge of established ${system} rules and official lore.\n` +
    `\n` +
    `IMPORTANT RULES:\n` +
    `- If asked about a character, place, or entity that does not exist in official ${system} lore, ` +
    `clearly state that it does not appear in the known lore — do NOT invent or fabricate details about it.\n` +
    `- If asked about a real-world person, object, or place with no connection to ${system}, ` +
    `say so clearly, then offer to generate a campaign version of that character, object, or place if appropriate.\n` +
    `- Only generate or invent content when explicitly asked to create or generate something.\n` +
    `- When answering rules questions, be clean and precise.\n` +
    `- Format all answers with markdown for clarity.`
  );
}

// ── Ollama Configuration Guide ────────────────────────────────────────────────
class RPGXOllamaGuide extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id:        "rpgx-ollama-guide",
      title:     "RPGX AI — Ollama Configuration Guide",
      width:     640,
      height:    580,
      resizable: true,
      closeOnSubmit: false,
      template:  `templates/none`,
    });
  }

  async getData() { return {}; }
  async _updateObject() {}
  async _renderInner() { return $("<div></div>"); }

  async render(force = false, options = {}) {
    await super.render(force, options);
    setTimeout(() => this._populate(), 50);
    return this;
  }

  _populate() {
    const el = this.element;
    if (!el?.length) return;
    const content = `
      <div style="padding:16px;overflow-y:auto;height:100%;font-size:0.9rem;line-height:1.6;color:#1a1a2e;">

        <p style="background:rgba(74,158,255,0.12);border-left:3px solid #4a9eff;
           padding:10px 14px;border-radius:4px;margin-bottom:18px;color:#1a1a2e;">
          <strong>Free tier:</strong> RPGX AI connects directly to your local Ollama server — no cloud, no API fees.
          <strong>Premium tier (Proton):</strong> Adds a RAG knowledge base so the AI knows your world's lore.
          Use RAG Server is <strong>on by default</strong> — if you don't have Proton, uncheck it in settings.
        </p>

        <h3 style="border-bottom:1px solid rgba(0,0,0,0.15);padding-bottom:6px;color:#1a1a2e;">
          Option A — Ollama on the same machine as Foundry
        </h3>
        <ol style="margin:10px 0 18px;padding-left:1.4em;color:#1a1a2e;">
          <li>Download and install <a href="https://ollama.ai" target="_blank" style="color:#4a9eff;">Ollama</a>.</li>
          <li>Open a terminal and pull a model. Choose a tier based on your PC specs:
            <ul style="margin-top:6px;">
              <li><strong>Lite (3b):</strong> <code>ollama pull qwen2.5:3b</code> — 4-6 GB RAM</li>
              <li><strong>Standard (7b):</strong> <code>ollama pull qwen2.5:7b</code> — 8 GB+ RAM ⭐</li>
              <li><strong>Performance (14b):</strong> <code>ollama pull qwen2.5:14b</code> — 16 GB+ RAM</li>
              <li><strong>Ultra (30b):</strong> <code>ollama pull qwen3:30b</code> — 32 GB+ RAM</li>
            </ul>
          </li>
          <li>In RPGX AI settings, set <strong>Ollama Base URL</strong> to <code>http://127.0.0.1:11434</code>.</li>
          <li>Set <strong>AI Model Tier</strong> to match the model you pulled.</li>
        </ol>

        <h3 style="border-bottom:1px solid rgba(0,0,0,0.15);padding-bottom:6px;color:#1a1a2e;">
          Option B — Ollama on a separate machine (LAN)
        </h3>
        <ol style="margin:10px 0 18px;padding-left:1.4em;color:#1a1a2e;">
          <li>Install Ollama on the machine that will run it.</li>
          <li>Set the environment variable <code>OLLAMA_HOST=0.0.0.0</code> so Ollama listens on all interfaces.</li>
          <li>Find the machine's local IP (e.g. <code>192.168.1.50</code>) — run <code>ipconfig</code> on Windows.</li>
          <li>In RPGX AI settings, set <strong>Ollama Base URL</strong> to <code>http://192.168.1.50:11434</code>.</li>
        </ol>

        <h3 style="border-bottom:1px solid rgba(0,0,0,0.15);padding-bottom:6px;color:#1a1a2e;">
          Option C — RPGX Proton (recommended for remote Foundry servers)
        </h3>
        <p style="color:#1a1a2e;">
          <a href="https://www.rpgxstudios.com/products" target="_blank" style="color:#4a9eff;font-weight:600;">RPGX Proton</a>
          is a desktop app that bundles Ollama, manages models, and adds a RAG knowledge base
          so the AI knows your world's lore. It handles all networking automatically — no manual
          Ollama configuration needed. Ideal for GMs using remote Foundry hosting.
        </p>

        <h3 style="border-bottom:1px solid rgba(0,0,0,0.15);padding-bottom:6px;margin-top:18px;color:#1a1a2e;">
          Troubleshooting
        </h3>
        <ul style="margin:10px 0;padding-left:1.4em;color:#1a1a2e;">
          <li><strong>No response / timeout:</strong> Confirm Ollama is running (<code>ollama serve</code>).
              Check the Base URL matches exactly, including port.</li>
          <li><strong>CORS error:</strong> Set <code>OLLAMA_ORIGINS=*</code> in Ollama's environment,
              or use RPGX Proton which handles this automatically.</li>
          <li><strong>Model not found:</strong> Run <code>ollama pull &lt;model-name&gt;</code>
              and ensure the name in settings matches exactly (including the tag, e.g. <code>qwen2.5:7b</code>).</li>
          <li><strong>Slow responses:</strong> Close background applications. Use a lighter tier (Standard/Lite).
              Lower <strong>Max Tokens</strong> for quicker replies.</li>
          <li><strong>RAG Server Token error:</strong> Copy the token fresh from Proton → Settings and re-paste it.
              Restart Proton if the token field in Settings shows "Not available".</li>
        </ul>

        <p style="text-align:center;margin-top:10px;font-size:0.82rem;color:#555;">
          For more help, see
          <a href="https://www.rpgxstudios.com/products" target="_blank" style="color:#4a9eff;">RPGXStudios.com/products</a>
        </p>
      </div>
    `;
    const wc = el.find(".window-content");
    wc.css({ padding: 0, overflow: "hidden" });
    wc.html(content);
  }
}

// ── Inject separator + Proton link into settings UI via DOM hook ─────────────
// Foundry renders String settings as text inputs regardless of intent,
// so we inject pure HTML instead of registering fake settings.
function _injectSettingsUI(html) {
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root) return;

  // ── Version header — injected above the first real setting ──────────────
  const firstInput = root.querySelector(`[name="${moduleName}.ollamaBaseUrl"]`);
  if (firstInput) {
    const fg = firstInput.closest(".form-group");
    if (fg && !fg.parentNode.querySelector(".rpgx-version-header")) {
      const rawVer = game.modules.get(moduleName)?.version ?? "2.1.0";
      const ver    = rawVer.replace(/^v/i, "");
      const header = document.createElement("div");
      header.className = "rpgx-version-header";
      header.innerHTML = `
        <div style="padding:10px 0 10px;border-bottom:1px solid rgba(212,169,68,0.3);margin-bottom:6px;">
          <span style="font-size:14px;font-weight:700;color:#d4a944;">RPGX AI Assistant — v${ver}</span>
          <p style="margin:2px 0 0;font-size:11px;color:#8a8aaa;">Local AI companion for Foundry VTT GMs. rpgxstudios.com</p>
        </div>`;
      fg.parentNode.insertBefore(header, fg);
    }
  }

  // ── Separator before "Enable Player Queries" ─────────────────────────────
  const playerQueriesInput = root.querySelector(`[name="${moduleName}.enablePlayerQueries"]`);
  if (playerQueriesInput) {
    const fg = playerQueriesInput.closest(".form-group");
    if (fg && !fg.parentNode.querySelector(".rpgx-player-queries-sep")) {
      const sep = document.createElement("div");
      sep.className = "rpgx-settings-separator rpgx-player-queries-sep";
      sep.innerHTML = `
        <div class="rpgx-sep-inner">
          <span class="rpgx-sep-label">Player Query Settings</span>
        </div>
        <p class="rpgx-sep-hint">
          Allow players to submit AI queries through the brain button.
          Queries route to the GM's Ollama/RAG instance for processing.
        </p>`;
      fg.parentNode.insertBefore(sep, fg);
    }
  }

  // ── Separator before "Use RAG Server" ───────────────────────────────────
  const useRagInput = root.querySelector(`[name="${moduleName}.useRag"]`);
  if (useRagInput) {
    const fg = useRagInput.closest(".form-group");
    if (fg && !fg.parentNode.querySelector(".rpgx-settings-separator:not(.rpgx-player-queries-sep)")) {
      const sep = document.createElement("div");
      sep.className = "rpgx-settings-separator";
      sep.innerHTML = `
        <div class="rpgx-sep-inner">
          <span class="rpgx-sep-label">RPGX Proton &mdash; Premium RAG Features</span>
        </div>
        <p class="rpgx-sep-hint" style="color:#ff9f43;font-weight:500;">
          ⚠ The settings below require the
          <a href="https://www.rpgxstudios.com/products" target="_blank" style="color:#4a9eff;text-decoration:underline;">RPGX Proton</a>
          desktop app. Without Proton, all queries go directly to your Ollama server.
        </p>`;
      fg.parentNode.insertBefore(sep, fg);
    }
  }

  // ── Proton link after "RAG Server Token" (last RAG setting) ─────────────
  const ragTokenInput = root.querySelector(`[name="${moduleName}.ragToken"]`);
  if (ragTokenInput) {
    const fg = ragTokenInput.closest(".form-group");
    if (fg && !fg.nextElementSibling?.classList.contains("rpgx-proton-link-block")) {
      const link = document.createElement("div");
      link.className = "rpgx-proton-link-block";
      link.innerHTML = `
        <i class="fas fa-arrow-up-right-from-square" style="color:#4a9eff;"></i>
        <span style="color:#8a8aaa;">RPGX Proton powers the knowledge base features above.</span><br>
        <a href="https://www.rpgxstudios.com/products" target="_blank"
           style="color:#4a9eff;text-decoration:underline;font-weight:600;">
          RPGXStudios.com/products
        </a>`;
      fg.parentNode.insertBefore(link, fg.nextSibling);
    }
  }

  // ── Report Bug button ─────────────────────────────────────────────────────
  if (!root.querySelector(".rpgx-bug-report-block")) {
    const ver     = game.modules.get(moduleName)?.version ?? "unknown";
    const subject = encodeURIComponent(`RPGX AI Bug Report — v${ver}`);
    const body    = encodeURIComponent(
      `Module Version: v${ver}\nFoundry Version: ${game.version ?? "unknown"}\n` +
      `Game System: ${game.system?.id ?? "unknown"}\n\n` +
      `Describe the bug:\n\n\nSteps to reproduce:\n\n\nExpected behavior:\n\n`
    );
    const bugDiv = document.createElement("div");
    bugDiv.className = "rpgx-bug-report-block";
    bugDiv.style.cssText = "margin-top:14px; padding-top:10px; border-top:1px solid rgba(212,169,68,0.2);";
    const bugBtn = document.createElement("button");
    bugBtn.className = "rpgx-report-bug-btn";
    bugBtn.innerHTML = '<i class="fas fa-bug"></i> Report a Bug';
    bugBtn.addEventListener("click", () => {
      window.open(`mailto:x8xid82@gmail.com?subject=${subject}&body=${body}`);
    });
    bugDiv.appendChild(bugBtn);
    // Append at bottom of the RPGX settings section
    const lastEl = root.querySelector(".rpgx-proton-link-block") || root.querySelector(".rpgx-settings-separator");
    if (lastEl) lastEl.parentNode.appendChild(bugDiv);
  }
}

for (const hook of ["renderSettingsConfig", "renderPackageConfiguration", "renderSettings", "renderApplicationV2"]) {
  Hooks.on(hook, (_app, html) => _injectSettingsUI(html));
}

// ── Language Model combo (dropdown + free text) ───────────────────────────────
// Tier list mirrors RPGX Quest Log exactly — same labels, values, and order
// across all RPGX modules so users see a consistent experience everywhere.
const MODEL_TIERS = [
  { label: "Lite (qwen2.5:3b)",         value: "qwen2.5:3b"  },
  { label: "Standard (qwen2.5:7b) ⭐",   value: "qwen2.5:7b"  },
  { label: "Performance (qwen2.5:14b)", value: "qwen2.5:14b" },
  { label: "Ultra (qwen3:30b)",         value: "qwen3:30b"   },
];

function enhanceModelInput(input) {
  if (!input || input.dataset.rpgxEnhanced) return;
  input.dataset.rpgxEnhanced = "true";

  const currentVal = input.value || "qwen2.5:7b";
  const isCustom   = !MODEL_TIERS.some(t => t.value === currentVal);

  const wrapper = document.createElement("div");
  wrapper.className = "rpgx-model-combo";

  const select = document.createElement("select");
  select.className = "rpgx-model-select";

  // Build tier options — label shown to user, value saved to settings
  for (const tier of MODEL_TIERS) {
    const opt = document.createElement("option");
    opt.value       = tier.value;
    opt.textContent = tier.label;
    if (tier.value === currentVal) opt.selected = true;
    select.appendChild(opt);
  }

  const customOpt = document.createElement("option");
  customOpt.value       = "__custom__";
  customOpt.textContent = "Custom...";
  if (isCustom) customOpt.selected = true;
  select.appendChild(customOpt);

  const custom = document.createElement("input");
  custom.type        = "text";
  custom.className   = "rpgx-model-custom";
  custom.placeholder = "Enter model name (e.g. llama3, mistral:7b)";
  custom.value       = isCustom ? currentVal : "";
  custom.style.display = isCustom ? "block" : "none";

  wrapper.appendChild(select);
  wrapper.appendChild(custom);
  input.style.display = "none";
  input.parentNode.insertBefore(wrapper, input.nextSibling);

  select.addEventListener("change", () => {
    if (select.value === "__custom__") {
      custom.style.display = "block";
      custom.focus();
      input.value = custom.value;
    } else {
      custom.style.display = "none";
      input.value = select.value;
    }
    input.dispatchEvent(new Event("change"));
  });

  custom.addEventListener("input", () => {
    input.value = custom.value;
    input.dispatchEvent(new Event("change"));
  });
}

for (const hookName of ["renderSettingsConfig","renderPackageConfiguration","renderSettings","renderApplicationV2"]) {
  Hooks.on(hookName, (app, html) => {
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root) return;
    const input = root.querySelector(`[name="${moduleName}.ollamaModel"]`);
    if (input) enhanceModelInput(input);
  });
}

Hooks.once("ready", () => {
  const observer = new MutationObserver(() => {
    const input = document.querySelector(`[name="${moduleName}.ollamaModel"]`);
    if (input && !input.dataset.rpgxEnhanced) enhanceModelInput(input);
  });
  observer.observe(document.body, { childList: true, subtree: true });
});
