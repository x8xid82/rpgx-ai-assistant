// scripts/gpt-api.js — Query logic with streaming responses + conversation memory
import { moduleName, getSetting, buildSystemPrompt } from "./settings.js";
import { renderMarkdown } from "./markdown.js";

// ── Conversation history ──────────────────────────────────────────────────────
const MAX_HISTORY_EXCHANGES = 8; // 8 exchanges = 16 messages
let conversationHistory = [];

export function clearHistory() {
  conversationHistory = [];
}

function trimHistory() {
  const maxMessages = MAX_HISTORY_EXCHANGES * 2;
  if (conversationHistory.length > maxMessages) {
    conversationHistory = conversationHistory.slice(-maxMessages);
  }
}

function saveExchange(question, answer) {
  if (!answer) return;
  conversationHistory.push({ role: "user",      content: question });
  conversationHistory.push({ role: "assistant", content: answer  });
  trimHistory();
}

// ─────────────────────────────────────────────────────────────────────────────

export async function streamReply(question, users) {
  const useRag     = getSetting("useRag", true);
  const ragBase    = getSetting("ragBase", "");
  const gameSystem = getSetting("gameSystem", "D&D 5e");
  const worldId    = game.world?.id || "unknown";

  const msg = await ChatMessage.create({
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ alias: "RPGX AI" }),
    content: buildReplyHtml('<span class="rpgx-thinking">Thinking...</span>'),
    whisper: users.map((u) => u.id),
    sound: CONFIG.sounds.notification,
  });

  let fullText  = "";
  let streamed  = false;
  let sourceMap = {};

  // ── Try RAG first ──
  if (useRag && ragBase) {
    try {
      // Auth token — must match the token shown in RPGX Proton → Settings
      const ragToken    = getSetting("ragToken") || "";
      const authHeaders = ragToken ? { "Authorization": `Bearer ${ragToken}` } : {};

      // Send last 16 messages (8 exchanges) for conversation context
      const recentHistory = conversationHistory.slice(-16);

      const res = await fetch(`${ragBase}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          worldId,
          q: question,
          gameSystem,
          stream: true,
          history: recentHistory,
        }),
      });

      if (res.ok) {
        const contentType = res.headers.get("content-type") || "";

        if (contentType.includes("ndjson")) {
          const result = await readStream(res, msg, "generate");
          fullText  = result.text;
          sourceMap = result.sourceMap;
          streamed  = true;

          if (result.noContext) {
            fullText  = "";
            sourceMap = {};
            streamed  = false;
          }
        } else {
          const j = await res.json().catch(() => ({}));
          const ans = (j?.answer ?? "").trim();
          if (ans) {
            fullText  = ans;
            sourceMap = j?.sourceMap ?? {};
            streamed  = true;
          }
        }
      }
    } catch (err) {
      console.warn("[RPGX AI] RAG unreachable, falling back to Ollama:", err);
    }
  }

  // ── Fallback: direct Ollama via /api/chat with full history ──
  if (!streamed) {
    const ollamaBase  = getSetting("ollamaBaseUrl", "http://127.0.0.1:11434");
    const model       = getSetting("ollamaModel");
    const temperature = getSetting("temperature", 0.5);
    const num_predict = getSetting("maxTokens", 4096);

    if (!ollamaBase) throw new Error("RPGX AI: Ollama Base URL is not set.");
    if (!model)      throw new Error("RPGX AI: Language Model is not set.");

    const messages = [
      { role: "system",  content: buildSystemPrompt() },
      ...conversationHistory,
      { role: "user",    content: question },
    ];

    try {
      const res = await fetch(`${ollamaBase}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          options: { temperature, num_predict },
        }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Ollama HTTP ${res.status}: ${txt}`);
      }

      const result = await readStream(res, msg, "chat");
      fullText = result.text;
    } catch (e) {
      await msg.update({
        content: buildReplyHtml(`<span style="color:#cc4444;">Error: ${e.message}</span>`),
      });
      throw e;
    }
  }

  // Always save exchange regardless of which backend answered
  saveExchange(question, fullText);

  if (fullText) {
    await msg.update({
      content: buildReplyHtml(renderMarkdown(fullText), sourceMap, fullText),
    });
  }
}

/**
 * Read an NDJSON stream and update a chat message live.
 * Returns { text, noContext, sourceMap }
 */
async function readStream(response, msg, format = "generate") {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText  = "";
  let noContext = false;
  let sourceMap = {};
  let updateCounter = 0;
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);

          if (parsed.sourceMap) { sourceMap = parsed.sourceMap; continue; }
          if (parsed.sources && !parsed.response && !parsed.message) continue;
          if (parsed.no_context) { noContext = true; continue; }

          const token =
            format === "chat"
              ? (parsed.message?.content ?? "")
              : (parsed.response ?? "");

          if (token) {
            fullText += token;
            updateCounter++;
            if (updateCounter % 3 === 0) {
              await msg.update({
                content: buildReplyHtml(escapeHtml(fullText) + '<span class="rpgx-cursor">▊</span>'),
              });
            }
          }
        } catch { /* skip malformed lines */ }
      }
    }

    if (buffer.trim()) {
      try {
        const parsed = JSON.parse(buffer);
        if (parsed.sourceMap)  sourceMap = parsed.sourceMap;
        if (parsed.no_context) noContext  = true;
        else {
          const token = format === "chat" ? (parsed.message?.content ?? "") : (parsed.response ?? "");
          if (token) fullText += token;
        }
      } catch { /* skip */ }
    }
  } catch (e) {
    console.error("[RPGX AI] Stream read error:", e);
  }

  return { text: fullText, noContext, sourceMap };
}

/**
 * Wrap reply in RPGX chat HTML.
 * Shows source footer with actual document names for any [S#] the model cited.
 */
function buildReplyHtml(content, sourceMap = {}, rawText = "") {
  let sourceFooter = "";

  if (sourceMap && Object.keys(sourceMap).length > 0 && rawText) {
    const cited = [...new Set((rawText.match(/\[S(\d+)\]/g) || []))];
    if (cited.length > 0) {
      const tags = cited
        .map(ref => {
          const key  = ref.replace(/[\[\]]/g, "");
          const name = sourceMap[key];
          if (!name) return null;
          return `<span class="rpgx-source-tag">` +
                 `<i class="fa-solid fa-book-open"></i> ` +
                 `<span class="rpgx-source-label">${escapeHtml(key)}:</span> ` +
                 `${escapeHtml(name)}</span>`;
        })
        .filter(Boolean)
        .join("");

      if (tags) sourceFooter = `<div class="rpgx-source-footer">${tags}</div>`;
    }
  }

  return (
    `<div class="rpgx-reply">` +
    `<abbr title="By RPGX AI (Ollama). Statements may be false." ` +
    `class="rpgx-reply-icon fa-solid fa-microchip-ai"></abbr>` +
    `<div class="rpgx-reply-body">${content}${sourceFooter}</div>` +
    `</div>`
  );
}

function escapeHtml(s) {
  return (s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
