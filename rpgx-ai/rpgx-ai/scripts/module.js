// scripts/module.js — Main entry: AI query panel + response display
import { registerSettings, moduleName, getSetting } from "./settings.js";
import { streamReply, clearHistory } from "./gpt-api.js";

Hooks.once("init", () => {
  console.log(`${moduleName} | Initializing RPGX AI v2`);
  registerSettings();
});

Hooks.once("ready", () => {
  _createQueryPanel();  // All users — players and GM both get the brain button
  _registerSocket();    // All users — everyone needs to listen on the socket
  if (game.user.isGM) {
    _showStartupReminder();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SOCKET REGISTRATION
// Called once on ready for every connected user (GM and players).
// The GM side listens for incoming player queries.
// The player side listens for deny notifications sent back by the GM.
// NOTE: streamReply() posts the ChatMessage directly to Foundry with whisper
// targets set — Foundry delivers it to the player automatically, so we don't
// need a socket event for the actual response, only for denials.
// ─────────────────────────────────────────────────────────────────────────────

function _registerSocket() {
  game.socket.on(`module.${moduleName}`, async (data) => {

    // ── GM receives a player query ──────────────────────────────────────────
    if (data.type === "player-query" && game.user.isGM) {
      // Guard: if multiple GMs are connected, only the primary active GM
      // handles it. This prevents every GM getting a simultaneous popup.
      if (game.users.activeGM?.id !== game.user.id) return;

      const autoApprove = getSetting("autoApprovePlayerQueries", false);
      if (autoApprove) {
        await _processPlayerQuery(data);
      } else {
        _showPlayerQueryApproval(data);
      }
      return;
    }

    // ── Player receives a denial notification ───────────────────────────────
    if (data.type === "query-denied" && data.targetPlayerId === game.user.id) {
      new Dialog({
        title: "Query Declined",
        content: `<p style="padding:6px 0;">Your query was declined by the GM.</p>`,
        buttons: { ok: { label: "OK" } },
        default: "ok",
      }).render(true);
    }

  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GM: Show approval dialog
// ─────────────────────────────────────────────────────────────────────────────

function _showPlayerQueryApproval(data) {
  new Dialog({
    title: `🎲 Player Query — ${data.playerName}`,
    content: `
      <div style="padding:4px 0 8px;">
        <p style="margin:0 0 8px;font-size:12px;">
          <i class="fa-solid fa-user"></i>&nbsp;<strong>${data.playerName}</strong> asks:
        </p>
        <blockquote style="
          margin:0; padding:8px 12px;
          background:rgba(168,85,247,0.08);
          border-left:3px solid rgba(168,85,247,0.5);
          border-radius:0 4px 4px 0;
          font-style:italic;
        ">${data.query.replace(/\n/g, "<br>")}</blockquote>
      </div>
    `,
    buttons: {
      approve: {
        label: "Approve",
        icon: '<i class="fa-solid fa-check"></i>',
        callback: () => _processPlayerQuery(data),
      },
      deny: {
        label: "Deny",
        icon: '<i class="fa-solid fa-xmark"></i>',
        callback: () => _denyPlayerQuery(data),
      },
    },
    default: "approve",
  }).render(true);
}

// ─────────────────────────────────────────────────────────────────────────────
// GM: Process an approved (or auto-approved) player query
// Runs the query through the GM's local RAG/Ollama stack, then posts the
// ChatMessage with appropriate whisper targets so Foundry delivers it.
// ─────────────────────────────────────────────────────────────────────────────

async function _processPlayerQuery(data) {
  const playerUser = game.users.get(data.playerId);
  const gmUsers    = game.users.filter(u => u.isGM);

  // If whisperReply: send to the querying player + all GMs (so GMs see it too).
  // If not whisperReply: empty array = public broadcast to everyone in chat.
  const whisperTargets = data.whisperReply
    ? [playerUser, ...gmUsers].filter(Boolean)
    : [];

  // Echo the question into chat, attributed to the player by name
  await _echoQuestion(
    { whisper: whisperTargets.map(u => u.id) },
    data.query,
    data.playerName
  );

  try {
    await streamReply(data.query, whisperTargets);
  } catch (e) {
    console.error(`${moduleName} | Player query failed:`, e);
    ui.notifications.error(e.message, { permanent: true, console: false });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GM: Deny — emit a denial notification back to the querying player
// ─────────────────────────────────────────────────────────────────────────────

function _denyPlayerQuery(data) {
  game.socket.emit(`module.${moduleName}`, {
    type:           "query-denied",
    targetPlayerId: data.playerId,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// AI QUERY PANEL
// ─────────────────────────────────────────────────────────────────────────────

function _createQueryPanel() {
  // ── Brain button ────────────────────────────────────────────────────────────
  const btn = document.createElement("div");
  btn.id        = "rpgx-ai-query-btn";
  btn.title     = "RPGX AI — Ask a Question";
  btn.innerHTML = `<i class="fa-solid fa-brain"></i>`;
  document.body.appendChild(btn);

  // ── Query panel — hidden by default via inline style ─────────────────────
  const panel = document.createElement("div");
  panel.id            = "rpgx-ai-query-panel";
  panel.style.display = "none";          // JS owns show/hide, not CSS
  panel.innerHTML = `
    <div class="rpgx-qp-header">
      <span class="rpgx-qp-title">
        <i class="fa-solid fa-microchip"></i> RPGX AI
      </span>
      <button class="rpgx-qp-close" title="Close">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>
    <textarea class="rpgx-qp-input" rows="3"
      placeholder="Ask your AI anything… (Enter to send, Shift+Enter for newline)"
    ></textarea>
    <div class="rpgx-qp-footer">
      <label class="rpgx-qp-toggle">
        <input type="checkbox" class="rpgx-qp-whisper" />
        <span>Whisper Reply</span>
      </label>
      <button class="rpgx-qp-send">
        <i class="fa-solid fa-paper-plane"></i> Ask
      </button>
    </div>
  `;
  document.body.appendChild(panel);

  const textarea     = panel.querySelector(".rpgx-qp-input");
  const whisperCheck = panel.querySelector(".rpgx-qp-whisper");

  // ── Button: toggle panel ──────────────────────────────────────────────────
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = panel.style.display === "flex";
    if (isOpen) {
      panel.style.display = "none";
    } else {
      panel.style.display = "flex";
      textarea.focus();
    }
  });

  // ── Close button ──────────────────────────────────────────────────────────
  panel.querySelector(".rpgx-qp-close").addEventListener("click", () => {
    panel.style.display = "none";
  });

  // ── Send ──────────────────────────────────────────────────────────────────
  panel.querySelector(".rpgx-qp-send").addEventListener("click", () =>
    _sendQuery(panel, textarea, whisperCheck)
  );

  // Enter = send, Shift+Enter = newline
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      _sendQuery(panel, textarea, whisperCheck);
    }
  });

  // Close on outside click
  document.addEventListener("click", (e) => {
    if (
      panel.style.display === "flex" &&
      !panel.contains(e.target) &&
      !btn.contains(e.target)
    ) {
      panel.style.display = "none";
    }
  });

  console.log(`${moduleName} | AI query panel ready.`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Send query — branches on GM vs. player role
// ─────────────────────────────────────────────────────────────────────────────

async function _sendQuery(panel, textarea, whisperCheck) {
  const question = textarea.value.trim();
  if (!question) return;

  const whisperReply = whisperCheck.checked;

  // ── Player path ───────────────────────────────────────────────────────────
  if (!game.user.isGM) {

    // Check whether the GM has enabled this feature
    if (!getSetting("enablePlayerQueries", false)) {
      new Dialog({
        title: "Player Queries Disabled",
        content: `<p style="padding:6px 0;">Sorry, but your host does not have player queries enabled.</p>`,
        buttons: { ok: { label: "OK" } },
        default: "ok",
      }).render(true);
      return;
    }

    // Close the panel and fire the query off via socket — the GM's instance
    // will receive it, approve or auto-approve, and post the reply to chat.
    textarea.value      = "";
    panel.style.display = "none";

    game.socket.emit(`module.${moduleName}`, {
      type:        "player-query",
      query:       question,
      whisperReply,
      playerId:    game.user.id,
      playerName:  game.user.name,
      worldId:     game.world?.id || "unknown",
    });

    return;
  }

  // ── GM path — existing direct behavior, unchanged ─────────────────────────
  const gmUsers    = whisperReply ? game.users.filter(u => u.isGM) : [];
  const whisperIds = gmUsers.map(u => u.id);

  textarea.value      = "";
  panel.style.display = "none";

  await _echoQuestion({ whisper: whisperIds }, question);

  try {
    await streamReply(question, gmUsers);
  } catch (e) {
    console.error(`${moduleName} | Query failed:`, e);
    ui.notifications.error(e.message, { permanent: true, console: false });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Startup reminder — GM only
// ─────────────────────────────────────────────────────────────────────────────

function _showStartupReminder() {
  const show = getSetting("showStartupReminder", true);
  if (!show) return;

  new Dialog({
    title: "RPGX AI — Before You Begin",
    content: `
      <div style="margin-bottom:10px;">
        <p><strong><i class="fa-solid fa-microchip"></i> RPGX AI is active.</strong></p>
        <p>RPGX AI runs language models locally. Close unnecessary background apps
        before generating responses for best performance.</p>
        <p>Use the <i class="fa-solid fa-brain"></i> brain button (bottom-left toolbar)
        to open the AI query panel.</p>
        <div style="margin-top:12px;">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
            <input type="checkbox" class="rpgx-dismiss-check" />
            Don't show this again
          </label>
        </div>
      </div>
    `,
    buttons: {
      ok: {
        label: "Got it — Let's go",
        icon: '<i class="fa-solid fa-check"></i>',
        callback: (html) => {
          if (html.find(".rpgx-dismiss-check").is(":checked")) {
            game.settings.set(moduleName, "showStartupReminder", false);
          }
        },
      },
    },
    default: "ok",
  }).render(true);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

// speakerName is used when the GM is echoing a player's question — we want
// the echo to show the player's name, not the GM's character name.
async function _echoQuestion(chatData, question, speakerName = null) {
  const header =
    '<span class="rpgx-question-header">' +
    '<i class="fa-solid fa-robot"></i> To: RPGX AI</span><br>';
  await ChatMessage.create({
    user:    game.user.id,
    speaker: speakerName
      ? { alias: speakerName }
      : ChatMessage.getSpeaker(),
    whisper: chatData?.whisper ?? [],
    content: `${header}${question.replace(/\n/g, "<br>")}`,
    sound:   CONFIG.sounds.notification,
  });
}
