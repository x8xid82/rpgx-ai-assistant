// scripts/librarian.js — Knowledge base management
// Toolbar icon, inbox-style document manager, settings panel, extraction
import { moduleName, getSetting } from "./settings.js";

// ── Cache of ingested doc IDs ──
let ingestedDocs = new Map(); // docId → { docTitle, chunks, lastIngested }

// ── Register settings panel ──
Hooks.once("init", () => {
  game.settings.registerMenu(moduleName, "librarianPanel", {
    name: "RPGX AI Librarian",
    label: "Open Knowledge Base",
    hint: "Manage your world's AI knowledge base — ingest journals, check status, or wipe data.",
    icon: "fas fa-book",
    type: RPGXLibrarianPanel,
    restricted: true,
  });
});

// ── Refresh cache + toolbar on ready ──
Hooks.once("ready", () => {
  if (game.user.isGM) refreshIngestedCache();
});

// ── Add RPGX AI button to the UI ──
Hooks.once("ready", () => {
  if (!game.user.isGM) return;

  // Create the RPGX AI toolbar button
  const btn = document.createElement("div");
  btn.id = "rpgx-ai-toolbar-btn";
  btn.innerHTML = `<i class="fa-solid fa-globe"></i>`;
  btn.title = "RPGX AI — Document Manager";
  document.body.appendChild(btn);

  btn.addEventListener("click", () => openDocumentManager());
});

async function refreshIngestedCache() {
  const ragBase = getSetting("ragBase");
  const worldId = game.world?.id;
  if (!ragBase || !worldId) return;

  try {
    const res = await fetch(`${ragBase}/status/${worldId}`);
    if (!res.ok) return;
    const data = await res.json();
    ingestedDocs.clear();
    for (const d of data.docs || []) {
      ingestedDocs.set(d.docId, {
        docTitle: d.docTitle,
        chunks: d.chunks,
        lastIngested: d.lastIngested,
      });
    }
  } catch {
    // Server not reachable
  }
}

/* =================================================================
   DOCUMENT MANAGER — Gmail-style inbox for ingesting/removing docs
   ================================================================= */

async function openDocumentManager() {
  await refreshIngestedCache();

  // Gather all journals and actors
  const journals = (Array.isArray(game.journal?.contents)
    ? game.journal.contents
    : Array.from(game.journal ?? [])
  ).map((j) => ({
    id: j.id,
    name: j.name,
    type: "journal",
    icon: "fa-solid fa-book-open",
    ingested: ingestedDocs.has(j.id),
    chunks: ingestedDocs.get(j.id)?.chunks || 0,
  }));

  const actors = (Array.isArray(game.actors?.contents)
    ? game.actors.contents
    : Array.from(game.actors ?? [])
  ).map((a) => ({
    id: a.id,
    name: a.name,
    type: "actor",
    icon: "fa-solid fa-user",
    ingested: ingestedDocs.has(a.id),
    chunks: ingestedDocs.get(a.id)?.chunks || 0,
  }));

  const allDocs = [...journals, ...actors].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  // Build rows
  const rows = allDocs
    .map(
      (d) => `
    <tr class="rpgx-doc-row" data-id="${d.id}" data-type="${d.type}">
      <td style="text-align:center; width:30px;">
        <input type="checkbox" class="rpgx-doc-check" data-id="${d.id}" />
      </td>
      <td style="width:24px;">
        <i class="${d.icon}" style="opacity:0.7"></i>
      </td>
      <td class="rpgx-doc-name">${d.name}</td>
      <td style="text-align:center; width:60px;">
        <span class="rpgx-doc-type">${d.type === "journal" ? "Journal" : "Character"}</span>
      </td>
      <td style="text-align:center; width:70px;">
        ${
          d.ingested
            ? `<span class="rpgx-ingested-badge" title="${d.chunks} chunks"><i class="fa-solid fa-circle-check"></i> ${d.chunks}</span>`
            : `<span class="rpgx-not-ingested">—</span>`
        }
      </td>
    </tr>`
    )
    .join("");

  const totalIngested = allDocs.filter((d) => d.ingested).length;

  const content = `
    <div class="rpgx-docmgr">
      <div class="rpgx-docmgr-toolbar">
        <label class="rpgx-select-all-label">
          <input type="checkbox" class="rpgx-select-all" />
          Select All
        </label>
        <div class="rpgx-docmgr-actions">
          <button type="button" class="rpgx-btn-ingest" title="Ingest selected documents">
            <i class="fa-solid fa-upload"></i> Ingest Selected
          </button>
          <button type="button" class="rpgx-btn-remove" title="Remove selected from database">
            <i class="fa-solid fa-trash"></i> Remove Selected
          </button>
        </div>
      </div>
      <div class="rpgx-docmgr-stats">
        ${allDocs.length} documents (${journals.length} journals, ${actors.length} characters)
        · ${totalIngested} ingested
      </div>
      <div class="rpgx-docmgr-filter">
        <input type="text" class="rpgx-filter-input" placeholder="Filter by name..." />
        <select class="rpgx-filter-type">
          <option value="all">All Types</option>
          <option value="journal">Journals</option>
          <option value="actor">Characters</option>
          <option value="ingested">Ingested Only</option>
          <option value="not-ingested">Not Ingested</option>
        </select>
      </div>
      <div class="rpgx-docmgr-list">
        <table class="rpgx-docmgr-table">
          <thead>
            <tr>
              <th style="width:30px;"></th>
              <th style="width:24px;"></th>
              <th>Name</th>
              <th style="width:60px; text-align:center;">Type</th>
              <th style="width:70px; text-align:center;">Status</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;

  const d = new Dialog(
    {
      title: "RPGX AI — Document Manager",
      content,
      buttons: {
        close: { label: "Close", icon: '<i class="fa-solid fa-xmark"></i>' },
      },
      default: "close",
      render: (html) => bindDocManagerEvents(html, allDocs, d),
    },
    {
      width: 620,
      height: 550,
      resizable: true,
      classes: ["rpgx-docmgr-dialog"],
    }
  );
  d.render(true);
}

function bindDocManagerEvents(html, allDocs, dialog) {
  // Select All
  html.find(".rpgx-select-all").on("change", function () {
    const checked = this.checked;
    html.find(".rpgx-doc-row:visible .rpgx-doc-check").prop("checked", checked);
  });

  // Filter by name
  html.find(".rpgx-filter-input").on("input", function () {
    applyFilters(html);
  });

  // Filter by type
  html.find(".rpgx-filter-type").on("change", function () {
    applyFilters(html);
  });

  // Ingest Selected
  html.find(".rpgx-btn-ingest").on("click", async () => {
    const selected = getSelectedIds(html);
    if (!selected.length) return ui.notifications.warn("No documents selected.");

    const notice = ui.notifications.info(
      `Ingesting ${selected.length} documents...`,
      { permanent: true }
    );

    try {
      const docs = [];
      for (const { id, type } of selected) {
        let doc;
        if (type === "journal") {
          const entry = game.journal.get(id);
          if (entry) doc = await collectSingleJournalDoc(entry);
        } else if (type === "actor") {
          const entry = game.actors.get(id);
          if (entry) doc = collectSingleActorDoc(entry);
        }
        if (doc) docs.push(doc);
      }

      if (!docs.length) return ui.notifications.warn("Nothing to ingest from selected documents.");

      const ragBase = getSetting("ragBase");
      const worldId = game.world?.id;
      const chunkSize = getSetting("chunkSize", 1200);
      const chunkOverlap = getSetting("chunkOverlap", 200);

      const res = await fetch(`${ragBase}/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ worldId, docs, chunkSize, chunkOverlap }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      ui.notifications.info(`Ingested ${j.added} chunks from ${j.docs} documents.`);

      // Refresh and reopen
      dialog.close();
      openDocumentManager();
    } catch (e) {
      console.error(e);
      ui.notifications.error(`Ingest failed: ${e.message}`);
    } finally {
      ui.notifications.remove(notice);
    }
  });

  // Remove Selected
  html.find(".rpgx-btn-remove").on("click", async () => {
    const selected = getSelectedIds(html).filter(({ id }) =>
      ingestedDocs.has(id)
    );
    if (!selected.length)
      return ui.notifications.warn("No ingested documents selected.");

    const yes = await Dialog.confirm({
      title: "Remove Documents",
      content: `<p>Remove <strong>${selected.length}</strong> document(s) from the database?</p>`,
    });
    if (!yes) return;

    try {
      const ragBase = getSetting("ragBase");
      const worldId = game.world?.id;
      let totalCleared = 0;

      for (const { id } of selected) {
        const res = await fetch(`${ragBase}/wipe`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ worldId, docId: id }),
        });
        if (res.ok) {
          const j = await res.json();
          totalCleared += j.cleared || 0;
        }
      }
      ui.notifications.info(`Removed ${totalCleared} chunks from ${selected.length} documents.`);

      dialog.close();
      openDocumentManager();
    } catch (e) {
      console.error(e);
      ui.notifications.error(`Remove failed: ${e.message}`);
    }
  });
}

function applyFilters(html) {
  const text = html.find(".rpgx-filter-input").val().toLowerCase();
  const typeFilter = html.find(".rpgx-filter-type").val();

  html.find(".rpgx-doc-row").each(function () {
    const row = $(this);
    const name = row.find(".rpgx-doc-name").text().toLowerCase();
    const type = row.data("type");
    const id = row.data("id");
    const isIngested = ingestedDocs.has(id);

    let show = true;
    if (text && !name.includes(text)) show = false;
    if (typeFilter === "journal" && type !== "journal") show = false;
    if (typeFilter === "actor" && type !== "actor") show = false;
    if (typeFilter === "ingested" && !isIngested) show = false;
    if (typeFilter === "not-ingested" && isIngested) show = false;

    row.toggle(show);
  });
}

function getSelectedIds(html) {
  const selected = [];
  html.find(".rpgx-doc-check:checked").each(function () {
    const row = $(this).closest("tr");
    selected.push({
      id: row.data("id"),
      type: row.data("type"),
    });
  });
  return selected;
}

/* ========================= Settings Panel ========================= */

class RPGXLibrarianPanel extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "rpgx-ai-librarian-panel",
      title: "RPGX AI — Knowledge Base",
      width: 580,
      height: 600,
      resizable: true,
      closeOnSubmit: false,
      template: `templates/none`,
    });
  }

  async getData() { return {}; }

  async _renderInner() { return $("<div></div>"); }

  async render(force = false, options = {}) {
    await super.render(force, options);
    setTimeout(() => this._populateContent(), 50);
    return this;
  }

  async _populateContent() {
    const el = this.element;
    if (!el?.length) return;

    await refreshIngestedCache();

    const ragBase = getSetting("ragBase");
    const worldId = game.world?.id || "unknown";
    const journalCount = game.journal.size ?? game.journal?.contents?.length ?? 0;
    const actorCount = game.actors.size ?? game.actors?.contents?.length ?? 0;

    // Build ingested docs table
    let docsHtml = "";
    if (ingestedDocs.size > 0) {
      const rows = [...ingestedDocs.entries()]
        .map(([docId, info]) => {
          const date = info.lastIngested
            ? new Date(info.lastIngested * 1000).toLocaleDateString()
            : "—";
          return `<tr>
            <td>${info.docTitle}</td>
            <td style="text-align:center">${info.chunks}</td>
            <td style="text-align:center">${date}</td>
            <td style="text-align:center">
              <a class="wipe-doc" data-doc-id="${docId}" title="Remove from database">
                <i class="fa-solid fa-trash"></i>
              </a>
            </td>
          </tr>`;
        })
        .join("");

      docsHtml = `
        <table class="rpgx-status-table">
          <thead><tr><th>Document</th><th>Chunks</th><th>Ingested</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`;
    } else {
      docsHtml = `<p class="notes">No documents ingested yet for this world.</p>`;
    }

    const content = `
      <div class="rpgx-panel">
        <div class="rpgx-panel-info">
          <div class="form-group"><label>RAG Server</label><span>${ragBase}</span></div>
          <div class="form-group"><label>World</label><span>${worldId}</span></div>
          <div class="form-group"><label>Journals / Characters</label><span>${journalCount} / ${actorCount}</span></div>
        </div>

        <h3>Bulk Actions</h3>
        <div class="rpgx-panel-actions">
          <button type="button" class="ingest-all"><i class="fa-solid fa-upload"></i> Ingest Entire World</button>
          <button type="button" class="wipe-world"><i class="fa-solid fa-trash"></i> Wipe Entire Database</button>
          <button type="button" class="ping"><i class="fa-solid fa-plug"></i> Ping Server</button>
        </div>

        <div class="rpgx-proton-promo">
          <i class="fa-solid fa-circle-info rpgx-proton-promo-icon"></i>
          <span>
            Knowledge base features require the <strong>RPGX Proton</strong> desktop app.
            <a href="https://RPGXStudios.com/proton" target="_blank">RPGXStudios.com/proton</a>
          </span>
        </div>

        <h3>Ingested Documents</h3>
        ${docsHtml}
      </div>
    `;

    const form = el.find("form");
    if (form.length) form.html(content);
    else el.find(".window-content").html(content);

    el.find("button.ingest-all").on("click", () => this._ingestAll());
    el.find("button.wipe-world").on("click", () => this._wipeWorld());
    el.find("button.ping").on("click", () => this._ping());
    el.find("a.wipe-doc").on("click", (ev) => {
      this._wipeDoc(ev.currentTarget.dataset.docId);
    });
  }

  async _updateObject() {}

  async _ping() {
    try {
      const ragBase = getSetting("ragBase");
      const res = await fetch(`${ragBase}/ping`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      ui.notifications.info(`RAG Server OK (v${j.version || "?"}) | LLM: ${j.llm} | Embed: ${j.embed}`);
    } catch (e) {
      console.error(e);
      ui.notifications.error(`RAG ping failed: ${e.message}`);
    }
  }

  async _ingestAll() {
    if (!game.user.isGM) return ui.notifications.error("GM only.");

    const ragBase = getSetting("ragBase");
    const worldId = game.world?.id;
    const chunkSize = getSetting("chunkSize", 1200);
    const chunkOverlap = getSetting("chunkOverlap", 200);

    const docs = await collectAllDocs();
    if (!docs.length) return ui.notifications.warn("No journals or actors found to ingest.");

    const notice = ui.notifications.info(
      `Indexing ${docs.length} documents into knowledge base...`,
      { permanent: true }
    );
    try {
      const res = await fetch(`${ragBase}/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ worldId, docs, chunkSize, chunkOverlap }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      ui.notifications.info(`Ingest complete: ${j.added} chunks from ${j.docs} documents.`);
      await refreshIngestedCache();
      this._populateContent();
    } catch (e) {
      console.error(e);
      ui.notifications.error(`Ingest failed: ${e.message}`);
    } finally {
      ui.notifications.remove(notice);
    }
  }

  async _wipeWorld() {
    const yes = await Dialog.confirm({
      title: "Wipe Entire Database",
      content: "<p>This will remove <strong>all</strong> ingested data for this world. Continue?</p>",
    });
    if (!yes) return;

    try {
      const ragBase = getSetting("ragBase");
      const worldId = game.world?.id;
      const res = await fetch(`${ragBase}/wipe`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ worldId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      ui.notifications.info(`Database cleared (${j.cleared} chunks removed).`);
      await refreshIngestedCache();
      this._populateContent();
    } catch (e) {
      console.error(e);
      ui.notifications.error(`Wipe failed: ${e.message}`);
    }
  }

  async _wipeDoc(docId) {
    const info = ingestedDocs.get(docId);
    const title = info?.docTitle || docId;

    const yes = await Dialog.confirm({
      title: "Remove Document",
      content: `<p>Remove <strong>"${title}"</strong> from the database?</p>`,
    });
    if (!yes) return;

    try {
      const ragBase = getSetting("ragBase");
      const worldId = game.world?.id;
      const res = await fetch(`${ragBase}/wipe`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ worldId, docId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      ui.notifications.info(`Removed "${title}" (${j.cleared} chunks).`);
      await refreshIngestedCache();
      this._populateContent();
    } catch (e) {
      console.error(e);
      ui.notifications.error(`Remove failed: ${e.message}`);
    }
  }
}

/* =================== Document Extraction =================== */

async function collectAllDocs() {
  const out = [];

  const journals = Array.isArray(game.journal?.contents)
    ? game.journal.contents : Array.from(game.journal ?? []);
  for (const entry of journals) {
    const doc = await collectSingleJournalDoc(entry);
    if (doc) out.push(doc);
  }

  const actors = Array.isArray(game.actors?.contents)
    ? game.actors.contents : Array.from(game.actors ?? []);
  for (const actor of actors) {
    const doc = collectSingleActorDoc(actor);
    if (doc) out.push(doc);
  }

  return out;
}

async function collectSingleJournalDoc(entry) {
  try {
    let content = "";

    if (entry.pages) {
      const pages = Array.isArray(entry.pages.contents)
        ? entry.pages.contents : [];
      for (const p of pages) {
        if (p.type === "text") {
          if (p.text?.content) content += "\n\n" + stripToPlain(p.text.content);
          else if (p.text?.markdown) content += "\n\n" + p.text.markdown;
        }
      }
    }

    if (!content) {
      const legacyHtml = entry.data?.content ?? entry.content ?? entry.text?.content;
      if (legacyHtml) content = stripToPlain(legacyHtml);
    }

    content = (content ?? "").trim();
    if (!content) return null;

    return { id: entry.id, title: entry.name ?? "Untitled", content, docType: "journal" };
  } catch (e) {
    console.error("RPGX AI | collectSingleJournalDoc failed:", e);
    return null;
  }
}

function collectSingleActorDoc(actor) {
  try {
    const parts = [];
    const name = actor.name ?? "Unnamed";
    const sys = actor.system || actor.data?.data || {};

    parts.push(`Character: ${name}`);
    parts.push(`Type: ${actor.type || "unknown"}`);

    const race = sys.details?.race || sys.details?.ancestry?.value || "";
    if (race) parts.push(`Race: ${race}`);

    const cls = sys.details?.class || "";
    if (cls) parts.push(`Class: ${cls}`);

    const level = sys.details?.level?.value ?? sys.details?.level ?? "";
    if (level) parts.push(`Level: ${level}`);

    const abilities = sys.abilities || sys.attributes || {};
    const abilityParts = [];
    for (const [key, val] of Object.entries(abilities)) {
      const score = val?.value ?? val;
      if (typeof score === "number") abilityParts.push(`${key.toUpperCase()}: ${score}`);
    }
    if (abilityParts.length) parts.push(`Abilities: ${abilityParts.join(", ")}`);

    const hp = sys.attributes?.hp;
    if (hp) parts.push(`HP: ${hp.value ?? "?"}/${hp.max ?? "?"}`);

    const bio = sys.details?.biography?.value || sys.details?.biography || "";
    if (bio) parts.push(`\nBiography:\n${stripToPlain(bio)}`);

    const items = actor.items?.contents || [];
    if (items.length) {
      const itemsByType = {};
      for (const item of items) {
        const t = item.type || "other";
        if (!itemsByType[t]) itemsByType[t] = [];
        itemsByType[t].push(item.name);
      }
      for (const [type, names] of Object.entries(itemsByType)) {
        parts.push(`${type.charAt(0).toUpperCase() + type.slice(1)}s: ${names.join(", ")}`);
      }
    }

    const content = parts.join("\n").trim();
    if (!content || content.length < 10) return null;

    return { id: actor.id, title: name, content, docType: "actor" };
  } catch (e) {
    console.error("RPGX AI | collectSingleActorDoc failed:", e);
    return null;
  }
}

function stripToPlain(html) {
  try {
    if (globalThis.TextEditor?.extractPlainText)
      return TextEditor.extractPlainText(html);
  } catch { /* fallback */ }
  const tmp = document.createElement("div");
  tmp.innerHTML = html ?? "";
  const text = tmp.textContent ?? tmp.innerText ?? "";
  return text.replace(/\u00A0/g, " ").trim();
}

/* =====================================================================
   RPGX PROTON — BROADCAST POLLING
   Polls the RAG server every 5 seconds for messages queued by RPGX
   Proton and posts them to Foundry chat. Added non-destructively to
   the existing librarian — nothing above this line was changed.
   ===================================================================== */

const _RPGX_BROADCAST_MS = 5000;
let   _rpgxPollInterval   = null;

Hooks.once("ready", () => {
  if (!game.user?.isGM) return;
  if (_rpgxPollInterval) clearInterval(_rpgxPollInterval);
  _rpgxPollInterval = setInterval(_rpgxPollBroadcast, _RPGX_BROADCAST_MS);
  console.log("[RPGX AI] Broadcast polling active");
});

async function _rpgxPollBroadcast() {
  if (!game.user?.isGM) return;
  const ragBase = getSetting("ragBase", "");
  if (!ragBase) return;

  try {
    const r = await fetch(`${ragBase}/broadcast/pending`,
      { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return;
    const { messages } = await r.json();
    if (!messages?.length) return;

    for (const msg of messages) {
      await ChatMessage.create({
        user:    game.user.id,
        speaker: ChatMessage.getSpeaker({ alias: msg.speaker || "RPGX Proton" }),
        content: `<div class="rpgx-reply"><div>${_rpgxMd(msg.answer)}</div></div>`,
        sound: CONFIG.sounds.notification,
      });
    }

    await fetch(`${ragBase}/broadcast/clear`,
      { method: "DELETE", signal: AbortSignal.timeout(3000) });

    console.log(`[RPGX AI] Delivered ${messages.length} broadcast(s) to chat`);
  } catch {
    // Silent — Proton not running
  }
}

function _rpgxEsc(s) {
  return (s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function _rpgxMd(t) {
  if (!t) return "";
  let h = _rpgxEsc(t);
  h = h.replace(/\*\*(.+?)\*\*/g,  "<strong>$1</strong>");
  h = h.replace(/\*(.+?)\*/g,       "<em>$1</em>");
  h = h.replace(/^#{1,3} (.+)$/gm,  "<strong>$1</strong>");
  h = h.replace(/^[\-\*] (.+)$/gm,  "<li>$1</li>");
  h = h.replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>");
  h = h.replace(/\n\n+/g, "<br><br>").replace(/\n/g, "<br>");
  return h;
}
