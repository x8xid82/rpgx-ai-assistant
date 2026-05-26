// scripts/librarian.js — Unified Knowledge Base + Document Manager
// v2.1 — Section-aware ingestion, metadata tagging, batching, progress bar, UI polish
import { moduleName, getSetting } from "./settings.js";

// ── Cache of ingested doc IDs ──────────────────────────────────────────────────
// Stores both section-level IDs (e.g. "actorId:bio") AND synthesized parent IDs
// (e.g. "actorId") so the UI can show status for a character row even though the
// actual DB records are stored at the section level.
let ingestedDocs = new Map(); // docId → { docTitle, chunks, lastIngested }

Hooks.once("init", () => {
  game.settings.registerMenu(moduleName, "librarianPanel", {
    name:       "RPGX AI Knowledge Base",
    label:      "Open Knowledge Base",
    hint:       "Manage your world's AI knowledge base — ingest, inspect, and wipe documents.",
    icon:       "fas fa-database",
    type:       RPGXKnowledgeBase,
    restricted: true,
  });
  // Note: ragToken is registered in settings.js — do NOT register it here.
  // Double-registration causes a Foundry error on startup.
});

Hooks.once("ready", () => {
  if (!game.user.isGM) return;
  refreshIngestedCache();

  const btn     = document.createElement("div");
  btn.id        = "rpgx-ai-toolbar-btn";
  btn.innerHTML = `<i class="fa-solid fa-globe"></i>`;
  btn.title     = "RPGX AI — Knowledge Base";
  document.body.appendChild(btn);
  btn.addEventListener("click", () => RPGXKnowledgeBase.openOrFocus());
});

// ── refreshIngestedCache ───────────────────────────────────────────────────────
// Fetches /status from the RAG server and rebuilds the ingestedDocs map.
//
// Section docs now use multi-level IDs: actorId:bio:allies, actorId:bio:backstory
// We climb the full parent chain so the UI row for "actorId" shows as ingested.
async function refreshIngestedCache() {
  const ragBase = getSetting("ragBase");
  const worldId = game.world?.id;
  if (!ragBase || !worldId) return;
  try {
    const res = await fetch(`${ragBase}/status/${worldId}`, { headers: ragAuthHeader() });
    if (!res.ok) return;
    const data = await res.json();

    ingestedDocs.clear();

    const directIds = new Set((data.docs || []).map(d => d.docId));

    for (const d of data.docs || []) {
      ingestedDocs.set(d.docId, {
        docTitle:      d.docTitle,
        chunks:        d.chunks,
        lastIngested:  d.lastIngested,
        characterName: d.characterName || null,
      });

      // Climb the full parent chain: actorId:bio:allies → actorId:bio → actorId
      // Each level gets a synthesized parent entry for UI status display.
      let childId = d.docId;
      while (childId.includes(":")) {
        const parentId = childId.substring(0, childId.lastIndexOf(":"));
        if (!directIds.has(parentId)) {
          const existing = ingestedDocs.get(parentId);
          if (existing) {
            existing.chunks += d.chunks || 0;
            if (d.lastIngested && (!existing.lastIngested || d.lastIngested > existing.lastIngested)) {
              existing.lastIngested = d.lastIngested;
            }
          } else {
            ingestedDocs.set(parentId, {
              docTitle:      d.docTitle,
              chunks:        d.chunks || 0,
              lastIngested:  d.lastIngested,
              characterName: d.characterName || null,
            });
          }
        }
        childId = parentId;
      }
    }
  } catch { /* Proton not running */ }
}

// ── Date helper ────────────────────────────────────────────────────────────────
// Handles both ISO strings ("2025-05-18T...") and Unix timestamps (seconds).
function formatDate(lastIngested) {
  if (!lastIngested) return "";
  let d;
  if (typeof lastIngested === "number") {
    d = new Date(lastIngested * 1000);
  } else {
    d = new Date(lastIngested);
  }
  if (isNaN(d.getTime())) return "";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

// ── ragAuthHeader ──────────────────────────────────────────────────────────────
// Returns an Authorization header object if a token is configured,
// or an empty object if not (backward compatible with unprotected installs).
// Merge into fetch headers: { "Content-Type": "application/json", ...ragAuthHeader() }
function ragAuthHeader() {
  const token = getSetting("ragToken") || "";
  return token ? { "Authorization": `Bearer ${token}` } : {};
}

// ── arrayBufferToBase64 ────────────────────────────────────────────────────────
// Safe base64 encoding for ArrayBuffers of any size.
// The spread-operator approach (btoa(String.fromCharCode(...bytes))) throws
// a "Maximum call stack size exceeded" error for files over ~100KB.
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary  = '';
  const CHUNK = 8192;
  for (let i = 0; i < bytes.byteLength; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/* =====================================================================
   UNIFIED KNOWLEDGE BASE WINDOW
   ===================================================================== */

class RPGXKnowledgeBase extends FormApplication {

  static _instance = null;

  static openOrFocus() {
    if (RPGXKnowledgeBase._instance?.rendered) {
      RPGXKnowledgeBase._instance.bringToTop();
      return;
    }
    const inst = new RPGXKnowledgeBase();
    RPGXKnowledgeBase._instance = inst;
    inst.render(true);
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id:            "rpgx-knowledge-base",
      title:         "RPGX AI — Knowledge Base",
      width:         760,
      height:        640,
      resizable:     true,
      closeOnSubmit: false,
      template:      `templates/none`,
    });
  }

  async getData()       { return {}; }
  async _updateObject() {}
  async _renderInner()  { return $("<div></div>"); }

  async render(force = false, options = {}) {
    await super.render(force, options);
    setTimeout(() => this._build(), 60);
    return this;
  }

  async _build() {
    const el = this.element;
    if (!el?.length) return;

    await refreshIngestedCache();

    const ragBase = getSetting("ragBase", "http://127.0.0.1:3033");
    const worldId = game.world?.id || "unknown";

    // ── Gather all document types ──────────────────────────────────────────────
    const journals = (Array.isArray(game.journal?.contents)
      ? game.journal.contents : Array.from(game.journal ?? []))
      .map(j => ({ id: j.id, name: j.name, type: "journal", icon: "fa-solid fa-book-open" }));

    const actors = (Array.isArray(game.actors?.contents)
      ? game.actors.contents : Array.from(game.actors ?? []))
      .map(a => ({ id: a.id, name: a.name, type: "actor", icon: "fa-solid fa-user" }));

    const quests = [];
    if (game.rpgxQuestLog?.store) {
      for (const q of game.rpgxQuestLog.store.getAll()) {
        quests.push({
          id:   `quest:${q.id}`,
          name: q.title || "Untitled Quest",
          type: "quest",
          icon: "fa-solid fa-scroll",
        });
      }
    }

    const allDocs = [...actors, ...journals, ...quests]
      .sort((a, b) => a.name.localeCompare(b.name));

    const totalIngested = allDocs.filter(d => ingestedDocs.has(d.id)).length;
    const totalChunks   = [...ingestedDocs.values()].reduce((s, d) => s + (d.chunks || 0), 0);

    // ── Stats bar ──────────────────────────────────────────────────────────────
    const statsHtml = `
      <div class="rpgxkb-stats">
        <span><i class="fa-solid fa-database"></i> ${ingestedDocs.size} docs &middot; ${totalChunks} chunks</span>
        <span><i class="fa-solid fa-book"></i> ${journals.length} journals</span>
        <span><i class="fa-solid fa-user"></i> ${actors.length} characters</span>
        ${quests.length ? `<span><i class="fa-solid fa-scroll"></i> ${quests.length} quests</span>` : ""}
        <span class="rpgxkb-stat-right">${totalIngested} / ${allDocs.length} ingested</span>
      </div>`;

    // ── Action bar ─────────────────────────────────────────────────────────────
    const actionsHtml = `
      <div class="rpgxkb-actions">
        <button type="button" class="rpgxkb-btn rpgxkb-btn-primary kb-ingest-all" title="Ingest all documents">
          <i class="fa-solid fa-database"></i> Ingest All
        </button>
        <button type="button" class="rpgxkb-btn rpgxkb-btn-primary kb-ingest-sel">
          <i class="fa-solid fa-upload"></i> Ingest Selected
        </button>
        <button type="button" class="rpgxkb-btn rpgxkb-btn-danger kb-remove-sel">
          <i class="fa-solid fa-minus-circle"></i> Remove Selected
        </button>
        <button type="button" class="rpgxkb-btn rpgxkb-btn-danger kb-wipe-world" title="Remove all ingested data for this world">
          <i class="fa-solid fa-trash"></i> Wipe All
        </button>
        <button type="button" class="rpgxkb-btn rpgxkb-btn-neutral kb-ingest-pdf" title="Ingest a PDF file (text-based)">
          <i class="fa-solid fa-file-pdf"></i> Ingest PDF
        </button>
        <button type="button" class="rpgxkb-btn rpgxkb-btn-neutral kb-ping" title="Check server connection">
          <i class="fa-solid fa-plug"></i> Ping
        </button>
      </div>`;

    // ── Filter bar ─────────────────────────────────────────────────────────────
    // The <style> block below fixes the dropdown readability issue.
    // Browser-native <select> dropdowns inherit game theme colors that make
    // option text invisible. Explicit background + color overrides fix this.
    const questOption = quests.length ? `<option value="quest">Quests</option>` : "";
    const filterHtml = `
      <style>
        .rpgxkb-type-filter,
        .rpgxkb-type-filter option {
          background-color: #1a1a2e !important;
          color: #c9c9e0 !important;
        }
        .rpgxkb-type-filter option:hover,
        .rpgxkb-type-filter option:checked {
          background-color: #2a2a50 !important;
          color: #ffffff !important;
        }
      </style>
      <div class="rpgxkb-filter">
        <label class="rpgxkb-select-all-wrap">
          <input type="checkbox" class="kb-select-all" /> All
        </label>
        <input type="text" class="rpgxkb-search" placeholder="Filter by name&hellip;" />
        <select class="rpgxkb-type-filter">
          <option value="all">All Types</option>
          <option value="actor">Characters</option>
          <option value="journal">Journals</option>
          ${questOption}
          <option value="ingested">Ingested</option>
          <option value="not-ingested">Not Ingested</option>
        </select>
      </div>`;

    // ── Document table ─────────────────────────────────────────────────────────
    const typeLabel = { journal: "JOURNAL", actor: "CHARACTER", quest: "QUEST" };

    const rows = allDocs.map(d => {
      const info     = ingestedDocs.get(d.id);
      const ingested = !!info;
      const chunks   = info?.chunks || 0;
      const dateStr  = formatDate(info?.lastIngested);

      const badge = ingested
        ? `<span class="rpgxkb-badge-ingested" title="${chunks} chunks">
             <i class="fa-solid fa-circle-check"></i> ${chunks}
           </span>`
        : `<span class="rpgxkb-badge-none">&mdash;</span>`;

      // ── Actions: ingest + trash side by side ─────────────────────────────────
      // Both buttons are always rendered; trash is hidden when not ingested so
      // layout stays stable (no column width jump).
      const actionsCell = `
        <td class="rpgxkb-td-actions">
          <div class="rpgxkb-row-actions-wrap">
            <button type="button" class="rpgxkb-row-btn kb-row-ingest"
              data-id="${d.id}" data-type="${d.type}" title="Ingest this document">
              <i class="fa-solid fa-upload"></i>
            </button>
            <button type="button" class="rpgxkb-row-btn rpgxkb-row-btn-danger kb-row-remove"
              data-id="${d.id}" title="Remove from knowledge base"
              style="display:${ingested ? "inline-flex" : "none"};">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </td>`;

      return `
        <tr class="rpgxkb-row" data-id="${d.id}" data-type="${d.type}" data-ingested="${ingested}">
          <td class="rpgxkb-td-check">
            <input type="checkbox" class="kb-doc-check" />
          </td>
          <td class="rpgxkb-td-icon"><i class="${d.icon}"></i></td>
          <td class="rpgxkb-td-name">${d.name}</td>
          <td class="rpgxkb-td-type">
            <span class="rpgxkb-type-tag rpgxkb-type-${d.type}">${typeLabel[d.type] ?? d.type}</span>
          </td>
          <td class="rpgxkb-td-date">${dateStr}</td>
          <td class="rpgxkb-td-status">${badge}</td>
          ${actionsCell}
        </tr>`;
    }).join("");

    // Width increased slightly for date column (was 90+80+60 = 230, now adds 90 more)
    const tableHtml = `
      <div class="rpgxkb-table-wrap">
        <table class="rpgxkb-table">
          <thead>
            <tr>
              <th style="width:28px;"></th>
              <th style="width:22px;"></th>
              <th>Name</th>
              <th style="width:90px; text-align:center;">Type</th>
              <th style="width:90px; text-align:center;">Last Ingested</th>
              <th style="width:70px; text-align:center;">Status</th>
              <th style="width:72px; text-align:center;">Actions</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;

    // ── Progress bar ───────────────────────────────────────────────────────────
    // Shown during bulk ingest operations. Hidden by default.
    const progressHtml = `
      <div class="rpgxkb-progress" id="rpgxkb-progress" style="display:none;">
        <div class="rpgxkb-progress-bar">
          <div class="rpgxkb-progress-fill" id="rpgxkb-fill"></div>
        </div>
        <div class="rpgxkb-progress-label" id="rpgxkb-label">Preparing&hellip;</div>
        <div class="rpgxkb-progress-log"   id="rpgxkb-log"></div>
      </div>`;

    // ── Final layout ───────────────────────────────────────────────────────────
    // Hidden file inputs for PDF and image ingestion — triggered by the action bar
    // buttons. type="file" inputs must live in the DOM; they can't be created
    // and clicked on the fly in some browsers.
    const html = `
      <div class="rpgxkb-root">
        <div class="rpgxkb-header">
          <span class="rpgxkb-title"><i class="fa-solid fa-database"></i> Knowledge Base</span>
          <span class="rpgxkb-world"><i class="fa-solid fa-globe"></i> ${worldId}</span>
          <span class="rpgxkb-server">${ragBase}</span>
        </div>
        ${statsHtml}
        ${actionsHtml}
        ${filterHtml}
        ${tableHtml}
        ${progressHtml}
        <input type="file" id="rpgxkb-pdf-input"   accept=".pdf"
               style="display:none;position:absolute;" />
      </div>`;

    const wc = el.find(".window-content");
    wc.css({ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" });
    wc.html(html);

    this._bindEvents(el, allDocs);
  }

  // ── Event binding ────────────────────────────────────────────────────────────
  _bindEvents(el, allDocs) {
    el.find(".kb-select-all").on("change", function() {
      el.find(".rpgxkb-row:visible .kb-doc-check").prop("checked", this.checked);
    });

    el.find(".rpgxkb-search").on("input",     () => this._applyFilters(el));
    el.find(".rpgxkb-type-filter").on("change", () => this._applyFilters(el));

    el.find(".kb-ingest-all").on("click",    () => this._ingestAll());
    el.find(".kb-ingest-sel").on("click",    () => this._ingestSelected(el, allDocs));
    el.find(".kb-remove-sel").on("click",    () => this._removeSelected(el));
    el.find(".kb-wipe-world").on("click",    () => this._wipeWorld());
    el.find(".kb-ping").on("click",          () => this._ping());

    // PDF ingest — trigger hidden file input
    el.find(".kb-ingest-pdf").on("click", () => {
      const input = document.getElementById("rpgxkb-pdf-input");
      if (input) { input.value = ''; input.click(); }
    });

    // File input change handler — addEventListener for CSP compliance (no inline onclick)
    const pdfInput = document.getElementById("rpgxkb-pdf-input");
    if (pdfInput) {
      pdfInput.addEventListener("change", (e) => {
        const file = e.target.files?.[0];
        if (file) this._ingestPDF(file);
      });
    }

    el.find(".kb-row-ingest").on("click", async (ev) => {
      const { id, type } = ev.currentTarget.dataset;
      await this._ingestOne(id, type, allDocs);
    });

    el.find(".kb-row-remove").on("click", async (ev) => {
      await this._removeDoc(ev.currentTarget.dataset.id);
    });
  }

  // ── Filters ──────────────────────────────────────────────────────────────────
  _applyFilters(el) {
    const text = el.find(".rpgxkb-search").val().toLowerCase();
    const type = el.find(".rpgxkb-type-filter").val();

    el.find(".rpgxkb-row").each(function() {
      const row     = $(this);
      const name    = row.find(".rpgxkb-td-name").text().toLowerCase();
      const rowType = row.data("type");
      const isIng   = row.data("ingested") === true || row.data("ingested") === "true";
      let show = true;
      if (text && !name.includes(text))              show = false;
      if (type === "actor"        && rowType !== "actor")   show = false;
      if (type === "journal"      && rowType !== "journal") show = false;
      if (type === "quest"        && rowType !== "quest")   show = false;
      if (type === "ingested"     && !isIng)                show = false;
      if (type === "not-ingested" && isIng)                 show = false;
      row.toggle(show);
    });
  }

  _getSelectedIds(el) {
    const sel = [];
    el.find(".rpgxkb-row:visible .kb-doc-check:checked").each(function() {
      const row = $(this).closest("tr");
      sel.push({ id: row.data("id"), type: row.data("type") });
    });
    return sel;
  }

  // ── Progress bar helpers ──────────────────────────────────────────────────────
  _showProgress(show) {
    const p = document.getElementById("rpgxkb-progress");
    if (p) p.style.display = show ? "block" : "none";
    if (!show) {
      const fill = document.getElementById("rpgxkb-fill");
      if (fill) fill.style.width = "0%";
      const log = document.getElementById("rpgxkb-log");
      if (log) log.innerHTML = "";
    }
  }

  _setProgress(pct, label) {
    const fill = document.getElementById("rpgxkb-fill");
    if (fill) fill.style.width = Math.min(100, Math.max(0, pct)) + "%";
    const lbl = document.getElementById("rpgxkb-label");
    if (lbl && label !== undefined) lbl.textContent = label;
  }

  _logProgress(msg) {
    const log = document.getElementById("rpgxkb-log");
    if (!log) return;
    const line = document.createElement("div");
    line.textContent = msg;
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
  }

  // ── Collect a Foundry doc into section docs ───────────────────────────────────
  // Always returns an ARRAY of docs (may be empty). Callers spread the result.
  async _collectDoc(id, type) {
    if (type === "journal") {
      const entry = game.journal.get(id);
      if (!entry) return [];
      const docs = await collectSingleJournalDoc(entry);
      return Array.isArray(docs) ? docs : (docs ? [docs] : []);
    }
    if (type === "actor") {
      const entry = game.actors.get(id);
      if (!entry) return [];
      const docs = collectSingleActorDoc(entry);
      return Array.isArray(docs) ? docs : (docs ? [docs] : []);
    }
    if (type === "quest") {
      const questId = id.replace(/^quest:/, "");
      const quest   = game.rpgxQuestLog?.store?.getById(questId);
      if (!quest) return [];
      const doc = collectSingleQuestDoc(quest);
      return doc ? [doc] : [];
    }
    return [];
  }

  // ── Core ingest sender ────────────────────────────────────────────────────────
  // Handles two doc types transparently:
  //   • docType "pdf"  → fetched from Foundry URL, sent to /ingest/pdf (one at a time)
  //   • everything else → batched 3 at a time to /ingest (existing behavior)
  //
  // onProgress({ batchNum, totalBatches, processed, total, docNames }) is called
  // before each batch/doc so the caller can update the progress bar.
  async _ingestDocs(docs, onProgress) {
    const ragBase      = getSetting("ragBase");
    const worldId      = game.world?.id;
    const chunkSize    = 400;
    const chunkOverlap = 0;
    const BATCH_SIZE   = 3;
    const BATCH_DELAY  = 300;

    // Split: PDF marker objects (journal PDF pages) go through /ingest/pdf;
    // everything else goes through the normal /ingest batching pipeline.
    const pdfDocs  = docs.filter(d => d.docType === "pdf");
    const textDocs = docs.filter(d => d.docType !== "pdf");

    let totalAdded     = 0;
    let totalDocs      = 0;
    let processedSoFar = 0;

    const totalBatches = pdfDocs.length + Math.ceil(textDocs.length / BATCH_SIZE);

    // ── PDF docs: one at a time (heavier per-request — fetches a whole file) ──
    for (let i = 0; i < pdfDocs.length; i++) {
      const d        = pdfDocs[i];
      const pdfLabel = d.pageTitle ? `${d.title} — ${d.pageTitle}` : d.title;

      if (onProgress) {
        onProgress({
          batchNum:    i + 1,
          totalBatches,
          processed:   processedSoFar,
          total:       docs.length,
          docNames:    [`📄 ${pdfLabel}`],
        });
      }

      try {
        const added = await this._ingestPDFFromSrc(d, worldId, ragBase);
        totalAdded += added;
        totalDocs++;
      } catch (e) {
        // Log and continue — one bad PDF page shouldn't stop the whole ingest
        console.warn(`RPGX AI | PDF page skipped — ${d.title}: ${e.message}`);
      }
      processedSoFar++;
    }

    // ── Text docs: batches of 3 ────────────────────────────────────────────────
    for (let i = 0; i < textDocs.length; i += BATCH_SIZE) {
      const batch    = textDocs.slice(i, i + BATCH_SIZE);
      const batchNum = pdfDocs.length + Math.floor(i / BATCH_SIZE) + 1;

      if (onProgress) {
        onProgress({
          batchNum,
          totalBatches,
          processed: processedSoFar,
          total:     docs.length,
          docNames:  batch.map(d => d.title),
        });
      }

      const res = await fetch(`${ragBase}/ingest`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", ...ragAuthHeader() },
        body:    JSON.stringify({ worldId, docs: batch, chunkSize, chunkOverlap }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j    = await res.json();
      totalAdded += j.added || 0;
      totalDocs  += j.docs  || 0;

      processedSoFar += batch.length;

      if (i + BATCH_SIZE < textDocs.length) {
        await new Promise(r => setTimeout(r, BATCH_DELAY));
      }
    }

    return { added: totalAdded, docs: totalDocs };
  }

  // ── Ingest PDF from Foundry URL (automatic — called during normal journal ingest)
  // Fetches the PDF from Foundry's file server, converts to base64, and posts to
  // /ingest/pdf for server-side text extraction. Works on remote, LAN, and local
  // Foundry because the browser is always on the same origin as the file server.
  // Scanned PDFs (no text layer) are silently skipped with a console note.
  async _ingestPDFFromSrc(doc, worldId, ragBase) {
    const { id: docId, title: docTitle, pdfSrc, pageTitle } = doc;
    if (!pdfSrc) return 0;

    // Resolve relative paths to a full URL.
    // Foundry typically returns relative paths like "worlds/my-world/files/book.pdf".
    // The browser is on the Foundry origin, so prepending the origin works universally.
    let pdfUrl = pdfSrc;
    if (pdfUrl && !pdfUrl.startsWith("http") && !pdfUrl.startsWith("//")) {
      pdfUrl = `${window.location.origin}/${pdfUrl.replace(/^\//, "")}`;
    }

    const response = await fetch(pdfUrl);
    if (!response.ok) throw new Error(`Cannot fetch PDF: HTTP ${response.status}`);

    const arrayBuffer = await response.arrayBuffer();

    // 15 MB raw ≈ 20 MB base64 — just under the server's 20 MB body limit.
    // Oversized PDFs are skipped silently; the GM can use the manual "Ingest PDF"
    // button if they need to split or compress the file first.
    if (arrayBuffer.byteLength > 15 * 1024 * 1024) {
      console.warn(
        `RPGX AI | Auto-ingest skipped — PDF too large: ${docTitle} ` +
        `(${(arrayBuffer.byteLength / 1024 / 1024).toFixed(1)} MB > 15 MB limit). ` +
        `Use the manual "Ingest PDF" button.`
      );
      return 0;
    }

    const base64 = arrayBufferToBase64(arrayBuffer);
    const label  = pageTitle ? `${docTitle} — ${pageTitle}` : docTitle;

    const res = await fetch(`${ragBase}/ingest/pdf`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", ...ragAuthHeader() },
      body:    JSON.stringify({ worldId, docId, docTitle: label, base64 }),
    });

    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || `HTTP ${res.status}`);
    }

    const j = await res.json();

    if (j.isScanned) {
      // Scanned PDFs have no text layer — skip silently. OCR is a future Proton feature.
      console.info(`RPGX AI | Skipped scanned PDF (no text layer): ${label}`);
      return 0;
    }

    return j.added || 0;
  }

  // ── Ingest All ────────────────────────────────────────────────────────────────
  async _ingestAll() {
    const docs = await collectAllDocs();
    if (!docs.length) return ui.notifications.warn("No documents found to ingest.");

    this._showProgress(true);
    this._setProgress(0, `Preparing ${docs.length} document sections across ${Math.ceil(docs.length / 3)} batches…`);
    this._logProgress(`Starting: ${docs.length} sections | ${Math.ceil(docs.length / 3)} batches`);

    try {
      const j = await this._ingestDocs(docs, ({ batchNum, totalBatches, processed, total, docNames }) => {
        const pct = Math.round((processed / total) * 100);
        this._setProgress(pct, `Batch ${batchNum} / ${totalBatches}`);
        this._logProgress(`  ↳ ${docNames.join(", ")}`);
      });

      this._setProgress(100, "Complete!");
      this._logProgress(`✓ Done — ${j.added} chunks from ${j.docs} sections.`);
      ui.notifications.info(`Ingest complete: ${j.added} chunks.`);
    } catch (e) {
      this._logProgress(`✗ Error: ${e.message}`);
      ui.notifications.error(`Ingest failed: ${e.message}`);
    }

    await refreshIngestedCache();
    setTimeout(() => { this._showProgress(false); this._build(); }, 2000);
  }

  // ── Ingest Selected ───────────────────────────────────────────────────────────
  async _ingestSelected(el, _allDocs) {
    const selected = this._getSelectedIds(el);
    if (!selected.length) return ui.notifications.warn("No documents selected.");

    const docs = [];
    for (const { id, type } of selected) {
      const sections = await this._collectDoc(id, type);
      docs.push(...sections);
    }
    if (!docs.length) return ui.notifications.warn("Nothing to ingest from selection.");

    this._showProgress(true);
    this._setProgress(0, `Ingesting ${docs.length} sections…`);
    this._logProgress(`Selected: ${selected.length} document(s) → ${docs.length} section(s)`);

    try {
      const j = await this._ingestDocs(docs, ({ batchNum, totalBatches, processed, total, docNames }) => {
        const pct = Math.round((processed / total) * 100);
        this._setProgress(pct, `Batch ${batchNum} / ${totalBatches}`);
        this._logProgress(`  ↳ ${docNames.join(", ")}`);
      });

      this._setProgress(100, "Complete!");
      this._logProgress(`✓ Done — ${j.added} chunks.`);
      ui.notifications.info(`Ingested ${j.added} chunks from ${selected.length} document(s).`);
    } catch (e) {
      this._logProgress(`✗ Error: ${e.message}`);
      ui.notifications.error(`Ingest failed: ${e.message}`);
    }

    await refreshIngestedCache();
    setTimeout(() => { this._showProgress(false); this._build(); }, 2000);
  }

  // ── Ingest One (row button) ───────────────────────────────────────────────────
  async _ingestOne(id, type) {
    const docs = await this._collectDoc(id, type);
    if (!docs.length) return ui.notifications.warn("Could not collect document.");

    try {
      const j = await this._ingestDocs(docs);
      ui.notifications.info(`"${docs[0].title}" — ${j.added} chunks ingested (${docs.length} section(s)).`);
    } catch (e) {
      ui.notifications.error(`Ingest failed: ${e.message}`);
    }

    await refreshIngestedCache();
    this._build();
  }

  // ── Ingest PDF ────────────────────────────────────────────────────────────────
  // Reads a PDF file from the manual "Ingest PDF" button and sends it to /ingest/pdf
  // for server-side text extraction. Scanned (image-based) PDFs have no text layer
  // and are flagged clearly to the user — OCR support is planned for RPGX Proton.
  async _ingestPDF(file) {
    if (!file) return;

    // 15MB raw ≈ 20MB base64 — stays under the server's 20mb body limit
    if (file.size > 15 * 1024 * 1024) {
      ui.notifications.error(`PDF is too large (${(file.size/1024/1024).toFixed(1)} MB). Maximum is 15 MB.`);
      return;
    }

    const ragBase  = getSetting("ragBase");
    const worldId  = game.world?.id;
    const safeName = file.name.replace(/[^a-zA-Z0-9_\-]/g, '_');
    const docId    = `pdf:${safeName}`;
    const docTitle = file.name.replace(/\.pdf$/i, '');

    this._showProgress(true);
    this._setProgress(10, `Reading ${file.name}…`);
    this._logProgress(`📄 PDF: ${file.name}`);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const base64      = arrayBufferToBase64(arrayBuffer);

      this._setProgress(30, 'Extracting text…');
      const res = await fetch(`${ragBase}/ingest/pdf`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', ...ragAuthHeader() },
        body:    JSON.stringify({ worldId, docId, docTitle, base64 }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }

      const j = await res.json();

      if (j.isScanned) {
        this._setProgress(100, 'Scanned PDF');
        this._logProgress(`⚠ ${docTitle} is a scanned (image-based) PDF — text extraction is not supported yet.`);
        this._logProgress(`  OCR-based PDF conversion is planned for a future RPGX Proton release.`);
        ui.notifications.warn(`"${docTitle}" is a scanned PDF. Text extraction is not yet supported.`);
      } else {
        this._setProgress(100, 'Complete!');
        this._logProgress(`✓ ${docTitle} — ${j.added} chunks from ${j.pages} pages`);
        ui.notifications.info(`PDF ingested: ${j.added} chunks.`);
      }

    } catch (e) {
      this._logProgress(`✗ Error: ${e.message}`);
      ui.notifications.error(`PDF ingest failed: ${e.message}`);
    }

    await refreshIngestedCache();
    setTimeout(() => { this._showProgress(false); this._build(); }, 2000);
  }

  // ── Remove Selected ───────────────────────────────────────────────────────────
  async _removeSelected(el) {
    const selected = this._getSelectedIds(el).filter(({ id }) => ingestedDocs.has(id));
    if (!selected.length) return ui.notifications.warn("No ingested documents selected.");

    const yes = await Dialog.confirm({
      title:   "Remove Documents",
      content: `<p>Remove <strong>${selected.length}</strong> document(s) from the knowledge base?</p>`,
    });
    if (!yes) return;

    const ragBase = getSetting("ragBase");
    const worldId = game.world?.id;
    let total = 0;

    for (const { id } of selected) {
      // Remove the bare ID and all section sub-IDs (e.g. "actorId:bio", "actorId:stats")
      const toRemove = [...ingestedDocs.keys()].filter(k => k === id || k.startsWith(id + ":"));
      for (const docId of toRemove) {
        try {
          const r = await fetch(`${ragBase}/wipe`, {
            method: "DELETE", headers: { "Content-Type": "application/json", ...ragAuthHeader() },
            body: JSON.stringify({ worldId, docId }),
          });
          if (r.ok) { const j = await r.json(); total += j.cleared || 0; }
        } catch {}
      }
    }

    ui.notifications.info(`Removed ${total} chunks from ${selected.length} documents.`);
    await refreshIngestedCache();
    this._build();
  }

  // ── Remove One (row trash button) ─────────────────────────────────────────────
  async _removeDoc(docId) {
    const title = ingestedDocs.get(docId)?.docTitle || docId;
    const yes   = await Dialog.confirm({
      title:   "Remove Document",
      content: `<p>Remove <strong>"${title}"</strong> from the knowledge base?</p>`,
    });
    if (!yes) return;

    try {
      const ragBase = getSetting("ragBase");
      const worldId = game.world?.id;

      // Remove the bare ID and all section sub-IDs
      const toRemove = [...ingestedDocs.keys()].filter(k => k === docId || k.startsWith(docId + ":"));
      let totalCleared = 0;

      for (const id of toRemove) {
        const r = await fetch(`${ragBase}/wipe`, {
          method: "DELETE", headers: { "Content-Type": "application/json", ...ragAuthHeader() },
          body: JSON.stringify({ worldId, docId: id }),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        totalCleared += j.cleared || 0;
      }

      ui.notifications.info(`Removed "${title}" (${totalCleared} chunks, ${toRemove.length} section(s)).`);
    } catch (e) {
      ui.notifications.error(`Remove failed: ${e.message}`);
    }

    await refreshIngestedCache();
    this._build();
  }

  // ── Wipe World ────────────────────────────────────────────────────────────────
  async _wipeWorld() {
    const yes = await Dialog.confirm({
      title:   "Wipe Entire Knowledge Base",
      content: "<p>Remove <strong>all</strong> ingested data for this world? This cannot be undone.</p>",
    });
    if (!yes) return;

    try {
      const ragBase = getSetting("ragBase");
      const worldId = game.world?.id;
      const r = await fetch(`${ragBase}/wipe`, {
        method: "DELETE", headers: { "Content-Type": "application/json", ...ragAuthHeader() },
        body: JSON.stringify({ worldId }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      ui.notifications.info(`Knowledge base cleared — ${j.cleared} chunks removed.`);
    } catch (e) {
      ui.notifications.error(`Wipe failed: ${e.message}`);
    }

    await refreshIngestedCache();
    this._build();
  }

  // ── Ping ──────────────────────────────────────────────────────────────────────
  async _ping() {
    try {
      const ragBase = getSetting("ragBase");
      const r = await fetch(`${ragBase}/ping`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      ui.notifications.info(`RAG Server OK — LLM: ${j.llm} | Embed: ${j.embed} | Rerank: ${j.rerank}`);
    } catch (e) {
      ui.notifications.error(`Server not reachable: ${e.message}`);
    }
  }

  close(...args) {
    RPGXKnowledgeBase._instance = null;
    return super.close(...args);
  }
}

/* =====================================================================
   DOCUMENT EXTRACTION — per-section splitting with metadata
   ===================================================================== */

// ── collectAllDocs ────────────────────────────────────────────────────────────
// Returns a flat array of all section docs from all Foundry documents.
// Actor and journal collectors now return arrays; we spread them all.
async function collectAllDocs() {
  const out = [];

  const journals = Array.isArray(game.journal?.contents)
    ? game.journal.contents : Array.from(game.journal ?? []);
  for (const entry of journals) {
    const docs = await collectSingleJournalDoc(entry);
    if (Array.isArray(docs)) out.push(...docs);
    else if (docs) out.push(docs);
  }

  const actors = Array.isArray(game.actors?.contents)
    ? game.actors.contents : Array.from(game.actors ?? []);
  for (const actor of actors) {
    const docs = collectSingleActorDoc(actor);
    if (Array.isArray(docs)) out.push(...docs);
    else if (docs) out.push(docs);
  }

  if (game.rpgxQuestLog?.store) {
    for (const quest of game.rpgxQuestLog.store.getAll()) {
      const doc = collectSingleQuestDoc(quest);
      if (doc) out.push(doc);
    }
  }

  return out;
}

// ── collectSingleJournalDoc ───────────────────────────────────────────────────
// Returns an ARRAY of docs — one per journal page.
// Each doc carries:
//   - docType:    "journal"
//   - sectionName / pageTitle: the page's name (e.g. "Chapter 1", "NPC List")
//   - ingestedAt: handled by the server
//
// Why per-page? A journal about Waterdeep might have 12 pages. Mixing them into
// one doc means "taverns" and "political history" end up in the same chunks.
async function collectSingleJournalDoc(entry) {
  const results = [];
  const modifiedTime = entry._stats?.modifiedTime ?? Math.floor(Date.now() / 1000);

  if (entry.pages) {
    const pages = Array.isArray(entry.pages.contents) ? entry.pages.contents : [];
    for (const p of pages) {
      // PDF pages — marker object for silent background text extraction via /ingest/pdf.
      // The src URL is fetchable from the browser because it's served by Foundry's own
      // file server (works on remote, LAN, and local Foundry alike).
      if (p.type === "pdf" && p.src) {
        results.push({
          id:        `${entry.id}:${p.id}`,
          title:     entry.name ?? "Untitled",
          docType:   "pdf",
          pdfSrc:    p.src,
          pageTitle: p.name || "",
        });
        continue;
      }
      if (p.type !== "text") continue;
      let content = "";
      if (p.text?.content)  content = stripToPlain(p.text.content);
      else if (p.text?.markdown) content = p.text.markdown;
      content = content.trim();
      if (!content || content.length < 10) continue;

      // Prepend page name + journal name so chunks always carry identity context
      const pageHeader = p.name ? `${entry.name ?? "Untitled"} — ${p.name}\n\n` : "";

      results.push({
        id:          `${entry.id}:${p.id}`,      // unique per page
        title:       entry.name ?? "Untitled",
        content:     pageHeader + content,
        docType:     "journal",
        pageTitle:   p.name || "",
        sectionName: p.name || null,
        docWeight:   3.0,
        modifiedTime,
      });
    }
  }

  // Legacy fallback: journals without pages (pre-v10 Foundry data)
  if (!results.length) {
    try {
      const legacyHtml = entry.data?.content ?? entry.content ?? entry.text?.content;
      if (legacyHtml) {
        const content = stripToPlain(legacyHtml).trim();
        if (content && content.length >= 10) {
          results.push({
            id:          entry.id,
            title:       entry.name ?? "Untitled",
            content,
            docType:     "journal",
            pageTitle:   "",
            sectionName: null,
            docWeight:   3.0,
            modifiedTime,
          });
        }
      }
    } catch {}
  }

  return results.length > 0 ? results : null;
}

// ── collectSingleActorDoc ─────────────────────────────────────────────────────
// Returns an ARRAY of docs — one per meaningful section of the character sheet:
//   ":stats"  — identity, race, class, abilities, HP
//   ":bio"    — biography, backstory, personality, appearance
//   ":items"  — spells, weapons, equipment
//
// Each doc carries:
//   - docType:      "character"
//   - characterName: the character's name (travels with every chunk)
//   - sectionName:   "Stats & Abilities" / "Biography" / "Equipment & Abilities"
//
// Why split? Biography text about Octavia's brothers should never be in the
// same chunk as Albus's stat block. Splitting lets the reranker score each
// section independently.
function collectSingleActorDoc(actor) {
  try {
    const results     = [];
    const name        = actor.name ?? "Unnamed";
    const sys         = actor.system || actor.data?.data || {};
    const modifiedTime = actor._stats?.modifiedTime ?? Math.floor(Date.now() / 1000);

    // ── Section 1: Stats & Abilities ─────────────────────────────────────────
    const statsParts = [];
    statsParts.push(`Character: ${name}`);
    statsParts.push(`Type: ${actor.type || "unknown"}`);

    const race = sys.details?.race || sys.details?.ancestry?.value || "";
    if (race) statsParts.push(`Race: ${race}`);

    const cls = sys.details?.class || "";
    if (cls) statsParts.push(`Class: ${cls}`);

    const level = sys.details?.level?.value ?? sys.details?.level ?? "";
    if (level) statsParts.push(`Level: ${level}`);

    const abilities    = sys.abilities || sys.attributes || {};
    const abilityParts = [];
    for (const [key, val] of Object.entries(abilities)) {
      const score = val?.value ?? val;
      if (typeof score === "number") abilityParts.push(`${key.toUpperCase()}: ${score}`);
    }
    if (abilityParts.length) statsParts.push(`Abilities: ${abilityParts.join(", ")}`);

    const hp = sys.attributes?.hp;
    if (hp) statsParts.push(`HP: ${hp.value ?? "?"}/${hp.max ?? "?"}`);

    const statsContent = statsParts.join("\n").trim();
    if (statsContent.length >= 10) {
      results.push({
        id:           `${actor.id}:stats`,
        title:        name,
        content:      statsContent,
        docType:      "character",
        characterName: name,
        sectionName:  "Stats & Abilities",
        docWeight:    3.0,
        modifiedTime,
      });
    }

    // ── Section 2: Biography ──────────────────────────────────────────────────
    // Send the entire biography as one document. The server stamps every chunk
    // with the header "MM/DD/YY; CharacterName; Biography - " so every chunk
    // carries full attribution regardless of where the chunker splits.
    // No HTML parsing needed — the header handles it all.
    const mainBioHtml = sys.details?.biography?.value || "";
    const bioText = mainBioHtml
      ? stripToPlain(mainBioHtml)
      : (typeof sys.details?.biography === "string" ? sys.details.biography : "");
    if (bioText.trim().length >= 10) {
      results.push({
        id:            `${actor.id}:bio`,
        title:         name,
        content:       bioText.trim(),
        docType:       "character",
        characterName: name,
        sectionName:   "Biography",
        docWeight:     5.0,
        modifiedTime,
      });
    }

    // Personality fields — separate from biography in dnd5e
    const trait = sys.details?.trait?.value || sys.details?.trait || "";
    if (trait) results.push({
      id: `${actor.id}:bio:traits`, title: name,
      content: stripToPlain(trait), docType: "character",
      characterName: name, sectionName: "Personality Traits",
      docWeight: 4.0, modifiedTime,
    });
    const ideal = sys.details?.ideal?.value || sys.details?.ideal || "";
    if (ideal) results.push({
      id: `${actor.id}:bio:ideals`, title: name,
      content: stripToPlain(ideal), docType: "character",
      characterName: name, sectionName: "Ideals",
      docWeight: 4.0, modifiedTime,
    });
    const bond = sys.details?.bond?.value || sys.details?.bond || "";
    if (bond) results.push({
      id: `${actor.id}:bio:bonds`, title: name,
      content: stripToPlain(bond), docType: "character",
      characterName: name, sectionName: "Bonds",
      docWeight: 4.0, modifiedTime,
    });
    const flaw = sys.details?.flaw?.value || sys.details?.flaw || "";
    if (flaw) results.push({
      id: `${actor.id}:bio:flaws`, title: name,
      content: stripToPlain(flaw), docType: "character",
      characterName: name, sectionName: "Flaws",
      docWeight: 4.0, modifiedTime,
    });
    const appearance = sys.details?.appearance?.value || sys.details?.appearance || "";
    if (appearance) results.push({
      id: `${actor.id}:bio:appearance`, title: name,
      content: stripToPlain(appearance), docType: "character",
      characterName: name, sectionName: "Appearance",
      docWeight: 3.0, modifiedTime,
    });

    // ── Section 3: Equipment & Abilities ──────────────────────────────────────
    const items = actor.items?.contents || [];
    if (items.length) {
      const itemsByType = {};
      for (const item of items) {
        const t = item.type || "other";
        if (!itemsByType[t]) itemsByType[t] = [];
        itemsByType[t].push(item.name);
      }
      const itemParts = [`Character: ${name}`, "EQUIPMENT & ABILITIES:"];
      for (const [type, names] of Object.entries(itemsByType)) {
        itemParts.push(`${type.charAt(0).toUpperCase() + type.slice(1)}s: ${names.join(", ")}`);
      }
      const itemsContent = itemParts.join("\n").trim();
      if (itemsContent.length >= 10) {
        results.push({
          id:           `${actor.id}:items`,
          title:        name,
          content:      itemsContent,
          docType:      "character",
          characterName: name,
          sectionName:  "Equipment & Abilities",
          docWeight:    2.0,
          modifiedTime,
        });
      }
    }

    return results.length > 0 ? results : null;
  } catch (e) {
    console.error("RPGX AI | collectSingleActorDoc failed:", e);
    return null;
  }
}

// ── collectSingleQuestDoc ─────────────────────────────────────────────────────
// Returns a single doc (not an array — quests are compact enough to stay as one).
// Now carries questCharacters so the reranker knows which characters are involved.
function collectSingleQuestDoc(quest) {
  try {
    const parts = [];
    const title = quest.title || "Untitled Quest";
    parts.push(`Quest: ${title}`);
    parts.push(`Status: ${quest.status || "active"}`);

    const questCharacters = [];

    if (quest.assigners?.length) {
      const names = quest.assigners.map(a => a.name).filter(Boolean);
      if (names.length) parts.push(`Quest Giver(s): ${names.join(", ")}`);
    }

    if (quest.assignees?.length) {
      const names = quest.assignees.map(a => a.name).filter(Boolean);
      if (names.length) {
        parts.push(`Assigned Characters: ${names.join(", ")}`);
        questCharacters.push(...names);
      }
    }

    if (quest.description?.trim()) parts.push(`\nDescription:\n${stripToPlain(quest.description)}`);
    if (quest.gmNotes?.trim())     parts.push(`\nGM Notes:\n${quest.gmNotes.trim()}`);

    const milestones = (quest.milestones || []).filter(m => m.text?.trim());
    if (milestones.length) {
      parts.push(`\nMilestones:\n${milestones.map(m => `  - [${m.status || "pending"}] ${m.text}`).join("\n")}`);
    }

    if (quest.rewards) {
      const r  = quest.rewards;
      const rp = [];
      if (r.xp > 0) rp.push(`${r.xp} XP`);
      if (r.gp > 0) rp.push(`${r.gp} GP`);
      if (r.sp > 0) rp.push(`${r.sp} SP`);
      if (r.cp > 0) rp.push(`${r.cp} CP`);
      if (r.items?.length) rp.push(`Items: ${r.items.map(i => i.name).join(", ")}`);
      if (rp.length) parts.push(`\nRewards: ${rp.join(", ")}`);
    }

    const content = parts.join("\n").trim();
    if (!content || content.length < 10) return null;

    return {
      id:              `quest:${quest.id}`,
      title,
      content,
      docType:         "quest",
      questCharacters: questCharacters.length > 0 ? questCharacters : null,
      docWeight:       1.0,
      modifiedTime:    quest.updatedAt ?? quest.createdAt ?? Math.floor(Date.now() / 1000),
    };
  } catch (e) {
    console.error("RPGX AI | collectSingleQuestDoc failed:", e);
    return null;
  }
}

// ── stripToPlain ──────────────────────────────────────────────────────────────
function stripToPlain(html) {
  try {
    if (globalThis.TextEditor?.extractPlainText) return TextEditor.extractPlainText(html);
  } catch {}
  const tmp = document.createElement("div");
  tmp.innerHTML = html ?? "";
  return (tmp.textContent ?? tmp.innerText ?? "").replace(/\u00A0/g, " ").trim();
}

/* =====================================================================
   RPGX PROTON — BROADCAST POLLING
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
    const r = await fetch(`${ragBase}/broadcast/pending`, { headers: ragAuthHeader(), signal: AbortSignal.timeout(3000) });
    if (!r.ok) return;
    const { messages } = await r.json();
    if (!messages?.length) return;
    for (const msg of messages) {
      await ChatMessage.create({
        user:    game.user.id,
        speaker: ChatMessage.getSpeaker({ alias: msg.speaker || "RPGX Proton" }),
        content: `<div class="rpgx-reply"><div>${_rpgxMd(msg.answer)}</div></div>`,
        sound:   CONFIG.sounds.notification,
      });
    }
    await fetch(`${ragBase}/broadcast/clear`, { method: "DELETE", headers: ragAuthHeader(), signal: AbortSignal.timeout(3000) });
    console.log(`[RPGX AI] Delivered ${messages.length} broadcast(s) to chat`);
  } catch { /* Proton not running */ }
}

function _rpgxEsc(s) {
  return (s ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
}
function _rpgxMd(t) {
  if (!t) return "";
  let h = _rpgxEsc(t);
  h = h.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  h = h.replace(/\*(.+?)\*/g,     "<em>$1</em>");
  h = h.replace(/^#{1,3} (.+)$/gm, "<strong>$1</strong>");
  h = h.replace(/^[\-\*] (.+)$/gm, "<li>$1</li>");
  h = h.replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>");
  h = h.replace(/\n\n+/g, "<br><br>").replace(/\n/g, "<br>");
  return h;
}
