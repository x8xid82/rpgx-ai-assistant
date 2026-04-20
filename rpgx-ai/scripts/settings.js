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
    name: "Language Model",
    hint: "Select a model or type a custom model name.",
    scope: "world",
    config: true,
    type: String,
    default: "qwen2.5:14b",
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

  // ── RAG server ──
  game.settings.register(M, "useRag", {
    name: "Use RAG Server",
    hint: "If enabled, the assistant checks your Proton knowledge base first for contextual answers.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,   // Off by default — requires Proton
  });

  game.settings.register(M, "ragBase", {
    name: "RAG Server Base URL",
    hint: "e.g., http://127.0.0.1:3033 (no trailing slash) — provided by RPGX Proton",
    scope: "world",
    config: true,
    type: String,
    default: "http://127.0.0.1:3033",
  });

  game.settings.register(M, "ragTopK", {
    name: "RAG Top K",
    hint: "How many chunks to retrieve for context. Higher = broader search but slower. Increase for large worlds.",
    scope: "world",
    config: true,
    type: Number,
    default: 10,
  });

  // ── Librarian settings ──
  game.settings.register(M, "chunkSize", {
    name: "Chunk Size",
    hint: "Text chunk size when indexing journals (default 1200 chars)",
    scope: "world",
    config: true,
    type: Number,
    default: 1200,
  });

  game.settings.register(M, "chunkOverlap", {
    name: "Chunk Overlap",
    hint: "Character overlap between chunks (default 200)",
    scope: "world",
    config: true,
    type: Number,
    default: 200,
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
    `You are RPGX-AI, a knowledgeable and experienced assistant ` +
    `to a game master for a group playing "${system}".\n` +
    `Give knowledgeable and creative responses to help run the game.\n` +
    `When answering questions about rules, be clean and precise with answers. ` +
    `When asked for help to create content, be elaborate and descriptive. ` +
    `Format answers with markdown when possible for added clarity.`
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
      <div style="padding:16px;overflow-y:auto;height:100%;font-size:0.9rem;line-height:1.6;">

        <p style="background:rgba(111,168,220,0.1);border-left:3px solid #6fa8dc;
           padding:10px 14px;border-radius:4px;margin-bottom:18px;">
          <strong>Free tier:</strong> RPGX AI connects directly to a local Ollama server — no cloud, no API fees.
          <strong>Premium tier (Proton):</strong> Adds a RAG knowledge base so the AI knows your world's lore.
        </p>

        <h3 style="border-bottom:1px solid rgba(128,128,128,0.3);padding-bottom:6px;">
          Option A — Ollama on the same machine as Foundry
        </h3>
        <ol style="margin:10px 0 18px;padding-left:1.4em;">
          <li>Download and install <a href="https://ollama.ai" target="_blank" style="color:#6fa8dc;">Ollama</a>.</li>
          <li>Open a terminal and run: <code style="background:rgba(0,0,0,0.2);padding:1px 5px;border-radius:3px;">ollama pull qwen2.5:14b</code></li>
          <li>Ollama starts automatically on <strong>http://127.0.0.1:11434</strong>.</li>
          <li>In RPGX AI settings, set <strong>Ollama Base URL</strong> to <code>http://127.0.0.1:11434</code>.</li>
          <li>Set your <strong>Language Model</strong> to the model you pulled (e.g. <code>qwen2.5:14b</code>).</li>
          <li>Leave <strong>Use RAG Server</strong> unchecked unless you have RPGX Proton installed.</li>
          <li>Test with <code>/rpgx Hello!</code> in the Foundry chat.</li>
        </ol>

        <h3 style="border-bottom:1px solid rgba(128,128,128,0.3);padding-bottom:6px;">
          Option B — Ollama on a separate server (network install)
        </h3>
        <ol style="margin:10px 0 18px;padding-left:1.4em;">
          <li>Install Ollama on your server machine and pull your models.</li>
          <li>By default Ollama only listens on localhost. To expose it on your network,
              set the environment variable <code>OLLAMA_HOST=0.0.0.0:11434</code> before starting Ollama.
              <ul style="margin-top:6px;">
                <li><strong>Windows:</strong> Set via System → Advanced → Environment Variables, then restart Ollama.</li>
                <li><strong>Linux:</strong> Edit <code>/etc/systemd/system/ollama.service</code>, add
                    <code>Environment="OLLAMA_HOST=0.0.0.0:11434"</code>, then <code>systemctl daemon-reload && systemctl restart ollama</code>.</li>
              </ul>
          </li>
          <li>Find your server's local IP (e.g. <code>192.168.0.134</code>).</li>
          <li>In RPGX AI settings, set <strong>Ollama Base URL</strong> to
              <code>http://192.168.0.134:11434</code> (use your actual IP).</li>
          <li>Make sure your firewall allows inbound TCP on port <strong>11434</strong> from your Foundry machine.</li>
          <li>Set your <strong>Language Model</strong> and test with <code>/rpgx Hello!</code>.</li>
        </ol>

        <h3 style="border-bottom:1px solid rgba(128,128,128,0.3);padding-bottom:6px;">
          Troubleshooting
        </h3>
        <ul style="margin:10px 0 18px;padding-left:1.4em;">
          <li><strong>No response / timeout:</strong> Check that Ollama is running
              (<code>ollama list</code> in a terminal). Verify the URL has no trailing slash.</li>
          <li><strong>CORS errors in browser console:</strong> Ollama blocks cross-origin requests by default.
              Set <code>OLLAMA_ORIGINS=*</code> environment variable and restart Ollama.</li>
          <li><strong>Model not found:</strong> Run <code>ollama pull &lt;model-name&gt;</code>
              and ensure the name in settings matches exactly (including the tag, e.g. <code>qwen2.5:14b</code>).</li>
          <li><strong>Slow responses:</strong> Close background applications. Smaller models (7b) respond
              faster. Lower <strong>Max Tokens</strong> for quicker replies.</li>
        </ul>

        <p style="text-align:center;margin-top:10px;opacity:0.7;font-size:0.82rem;">
          For knowledge base / RAG features, see
          <a href="https://RPGXStudios.com/proton" target="_blank" style="color:#6fa8dc;">RPGXStudios.com/proton</a>
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

  // ── Separator before "Use RAG Server" ──
  const useRagInput = root.querySelector(`[name="${moduleName}.useRag"]`);
  if (useRagInput) {
    const fg = useRagInput.closest(".form-group");
    if (fg && !fg.parentNode.querySelector(".rpgx-settings-separator")) {
      const sep = document.createElement("div");
      sep.className = "rpgx-settings-separator";
      sep.innerHTML = `
        <div class="rpgx-sep-inner">
          <span class="rpgx-sep-label">RPGX Proton &mdash; Premium RAG Features</span>
        </div>
        <p class="rpgx-sep-hint">
          The settings below require the
          <a href="https://RPGXStudios.com/proton" target="_blank">RPGX Proton</a>
          desktop app. Without Proton, all queries go directly to your Ollama server.
        </p>`;
      fg.parentNode.insertBefore(sep, fg);
    }
  }

  // ── Proton link after "Chunk Overlap" (last RAG setting) ──
  const chunkOverlapInput = root.querySelector(`[name="${moduleName}.chunkOverlap"]`);
  if (chunkOverlapInput) {
    const fg = chunkOverlapInput.closest(".form-group");
    if (fg && !fg.nextElementSibling?.classList.contains("rpgx-proton-link-block")) {
      const link = document.createElement("div");
      link.className = "rpgx-proton-link-block";
      link.innerHTML = `
        <i class="fas fa-arrow-up-right-from-square"></i>
        RPGX Proton powers the knowledge base features above.<br>
        <a href="https://RPGXStudios.com/proton" target="_blank">RPGXStudios.com/proton</a>`;
      fg.parentNode.insertBefore(link, fg.nextSibling);
    }
  }
}

for (const hook of ["renderSettingsConfig", "renderPackageConfiguration", "renderSettings", "renderApplicationV2"]) {
  Hooks.on(hook, (_app, html) => _injectSettingsUI(html));
}

// ── Language Model combo (dropdown + free text) ───────────────────────────────
const MODEL_SUGGESTIONS = [
  "qwen2.5:14b","qwen2.5:7b","qwen3:30b","qwen3:14b","qwen3:8b",
  "llama3.1:8b","llama3.1:70b","mistral:7b","gemma2:9b","gemma2:27b",
  "deepseek-r1:14b","deepseek-r1:32b","phi4:14b","command-r:35b",
];

function enhanceModelInput(input) {
  if (!input || input.dataset.rpgxEnhanced) return;
  input.dataset.rpgxEnhanced = "true";
  const currentVal = input.value || "qwen2.5:14b";
  const isCustom = !MODEL_SUGGESTIONS.includes(currentVal);
  const wrapper = document.createElement("div");
  wrapper.className = "rpgx-model-combo";
  const select = document.createElement("select");
  select.className = "rpgx-model-select";
  for (const m of MODEL_SUGGESTIONS) {
    const opt = document.createElement("option");
    opt.value = m; opt.textContent = m;
    if (m === currentVal) opt.selected = true;
    select.appendChild(opt);
  }
  const customOpt = document.createElement("option");
  customOpt.value = "__custom__"; customOpt.textContent = "Custom...";
  if (isCustom) customOpt.selected = true;
  select.appendChild(customOpt);
  const custom = document.createElement("input");
  custom.type = "text"; custom.className = "rpgx-model-custom";
  custom.placeholder = "Enter model name...";
  custom.value = isCustom ? currentVal : "";
  custom.style.display = isCustom ? "block" : "none";
  wrapper.appendChild(select); wrapper.appendChild(custom);
  input.style.display = "none";
  input.parentNode.insertBefore(wrapper, input.nextSibling);
  select.addEventListener("change", () => {
    if (select.value === "__custom__") { custom.style.display = "block"; custom.focus(); input.value = custom.value; }
    else { custom.style.display = "none"; input.value = select.value; }
    input.dispatchEvent(new Event("change"));
  });
  custom.addEventListener("input", () => { input.value = custom.value; input.dispatchEvent(new Event("change")); });
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
