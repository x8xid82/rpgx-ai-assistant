// scripts/gpt-api.js — Query logic with streaming responses + conversation memory
import { moduleName, getSetting, buildSystemPrompt } from "./settings.js";
import { renderMarkdown } from "./markdown.js";

// ── Conversation history ──────────────────────────────────────────────────────
// Only tracks direct Ollama exchanges. RAG queries are stateless by design
// (RAG builds its own context per-query from the knowledge base).
const MAX_HISTORY_EXCHANGES = 8; // Keep last 8 user/assistant pairs = 16 messages
let conversationHistory = [];

/** Clear conversation history — call this from /rpgx clear */
export function clearHistory() {
  conversationHistory = [];
}

/** Trim history to MAX_HISTORY_EXCHANGES exchanges */
function trimHistory() {
  const maxMessages = MAX_HISTORY_EXCHANGES * 2;
  if (conversationHistory.length > maxMessages) {
    conversationHistory = conversationHistory.slice(-maxMessages);
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send a question and stream the response into a Foundry chat message.
 * Creates a placeholder message, then updates it as tokens arrive.
 *
 * @param {string} question - The user's question
 * @param {User[]} users - Whisper targets (empty array for public)
 * @returns {Promise<void>}
 */
export async function streamReply(question, users) {
  const useRag     = getSetting("useRag", true);
  const ragBase    = getSetting("ragBase", "");
  const topK       = Number(getSetting("ragTopK", 6));
  const gameSystem = getSetting("gameSystem", "D&D 5e");
  const worldId    = game.world?.id || "unknown";

  // Create placeholder message
  const msg = await ChatMessage.create({
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ alias: "RPGX AI" }),
    content: buildReplyHtml('<span class="rpgx-thinking">Thinking...</span>'),
    whisper: users.map((u) => u.id),
    sound: CONFIG.sounds.notification,
  });

  let fullText = "";
  let streamed = false;
  let usedRag  = false;

  // ── Try RAG streaming first ──
  if (useRag && ragBase) {
    try {
      const res = await fetch(`${ragBase}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          worldId,
          q: question,
          k: topK,
          gameSystem,
          stream: true,
        }),
      });

      if (res.ok) {
        const contentType = res.headers.get("content-type") || "";

        if (contentType.includes("ndjson")) {
          // Streaming response from RAG — uses /api/generate format (parsed.response)
          const result = await readStream(res, msg, "generate");
          fullText = result.text;
          streamed = true;
          usedRag  = true;

          // If RAG returned NO_CONTEXT, fall back to Ollama
          if (result.noContext) {
            fullText = "";
            streamed = false;
            usedRag  = false;
          }
        } else {
          // Non-streaming JSON (empty answer = no context match)
          const j = await res.json().catch(() => ({}));
          const ans = (j?.answer ?? "").trim();
          if (ans) {
            fullText = ans;
            streamed = true;
            usedRag  = true;
          }
        }
      }
    } catch (err) {
      console.warn("[RPGX AI] RAG unreachable, falling back to Ollama:", err);
    }
  }

  // ── Fallback: stream directly from Ollama via /api/chat (supports history) ──
  if (!streamed) {
    const ollamaBase  = getSetting("ollamaBaseUrl", "http://127.0.0.1:11434");
    const model       = getSetting("ollamaModel");
    const temperature = getSetting("temperature", 0.5);
    const num_predict = getSetting("maxTokens", 4096);

    if (!ollamaBase) throw new Error("RPGX AI: Ollama Base URL is not set.");
    if (!model)      throw new Error("RPGX AI: Language Model is not set.");

    // Build message array: system + history + current question
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

      // /api/chat streaming uses parsed.message.content instead of parsed.response
      const result = await readStream(res, msg, "chat");
      fullText = result.text;

      // Save this exchange to history for next turn
      if (fullText) {
        conversationHistory.push({ role: "user",      content: question });
        conversationHistory.push({ role: "assistant", content: fullText });
        trimHistory();
      }
    } catch (e) {
      await msg.update({
        content: buildReplyHtml(`<span style="color:#cc4444;">Error: ${e.message}</span>`),
      });
      throw e;
    }
  }

  // ── Final update with full markdown rendering ──
  if (fullText) {
    await msg.update({
      content: buildReplyHtml(renderMarkdown(fullText)),
    });
  }
}

/**
 * Read an NDJSON stream from the server and update a chat message live.
 *
 * @param {Response} response - The fetch response
 * @param {ChatMessage} msg   - The Foundry message to update
 * @param {"generate"|"chat"} format
 *   "generate" — Ollama /api/generate and RAG server: token is parsed.response
 *   "chat"     — Ollama /api/chat: token is parsed.message.content
 *
 * @returns {Promise<{text: string, noContext: boolean}>}
 */
async function readStream(response, msg, format = "generate") {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  let noContext = false;
  let updateCounter = 0;
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop(); // Keep incomplete last line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const parsed = JSON.parse(line);

          // Skip metadata lines (RAG sources, no_context signal)
          if (parsed.sources) continue;
          if (parsed.no_context) {
            noContext = true;
            continue;
          }

          // Extract token depending on which Ollama endpoint we're reading
          const token =
            format === "chat"
              ? (parsed.message?.content ?? "")
              : (parsed.response ?? "");

          if (token) {
            fullText += token;
            updateCounter++;

            // Update the chat message every 3 tokens — responsive but not DOM-hammering
            if (updateCounter % 3 === 0) {
              await msg.update({
                content: buildReplyHtml(escapeHtml(fullText) + '<span class="rpgx-cursor">▊</span>'),
              });
            }
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    }

    // Process any remaining buffer content
    if (buffer.trim()) {
      try {
        const parsed = JSON.parse(buffer);
        if (parsed.no_context) {
          noContext = true;
        } else {
          const token =
            format === "chat"
              ? (parsed.message?.content ?? "")
              : (parsed.response ?? "");
          if (token) fullText += token;
        }
      } catch { /* skip */ }
    }
  } catch (e) {
    console.error("[RPGX AI] Stream read error:", e);
  }

  return { text: fullText, noContext };
}

/** Wrap reply content in the standard RPGX chat HTML */
function buildReplyHtml(content) {
  return (
    `<div class="rpgx-reply">` +
    `<abbr title="By RPGX AI (Ollama). Statements may be false." ` +
    `class="rpgx-reply-icon fa-solid fa-microchip-ai"></abbr>` +
    `<div class="rpgx-reply-body">${content}</div>` +
    `</div>`
  );
}

/** Escape HTML entities */
function escapeHtml(s) {
  return (s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
