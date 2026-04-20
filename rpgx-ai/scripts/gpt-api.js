// scripts/gpt-api.js — Query logic with streaming responses
import { moduleName, getSetting, buildSystemPrompt } from "./settings.js";
import { renderMarkdown } from "./markdown.js";

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
  let ragFellBack = false;

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
          // Streaming response from RAG
          const result = await readStream(res, msg);
          fullText = result.text;
          streamed = true;

          // If RAG returned NO_CONTEXT, fall back to Ollama
          if (result.noContext) {
            fullText = "";
            streamed = false;
            ragFellBack = true;
          }
        } else {
          // Non-streaming JSON (empty answer = no context match)
          const j = await res.json().catch(() => ({}));
          const ans = (j?.answer ?? "").trim();
          if (ans) {
            fullText = ans;
            streamed = true;
          }
        }
      }
    } catch (err) {
      console.warn("[RPGX AI] RAG unreachable, falling back to Ollama:", err);
    }
  }

  // ── Fallback: stream directly from Ollama ──
  if (!streamed) {
    const ollamaBase  = getSetting("ollamaBaseUrl", "http://127.0.0.1:11434");
    const model       = getSetting("ollamaModel");
    const temperature = getSetting("temperature", 0.5);
    const num_predict = getSetting("maxTokens", 4096);

    if (!ollamaBase) throw new Error("RPGX AI: Ollama Base URL is not set.");
    if (!model)      throw new Error("RPGX AI: Language Model is not set.");

    const sys      = buildSystemPrompt();
    const composed = `${sys}\nUSER: ${question}\nASSISTANT:`;

    try {
      const res = await fetch(`${ollamaBase}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt: composed,
          stream: true,
          options: { temperature, num_predict },
        }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Ollama HTTP ${res.status}: ${txt}`);
      }

      const result = await readStream(res, msg);
      fullText = result.text;
    } catch (e) {
      // Update message with error
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
 * Returns the accumulated text and whether NO_CONTEXT was signaled.
 */
async function readStream(response, msg) {
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

      // Process complete lines from the buffer
      const lines = buffer.split("\n");
      buffer = lines.pop(); // Keep incomplete last line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const parsed = JSON.parse(line);

          // Skip metadata lines (sources, no_context signal)
          if (parsed.sources) continue;
          if (parsed.no_context) {
            noContext = true;
            continue;
          }

          // Accumulate response text
          const token = parsed.response || "";
          if (token) {
            fullText += token;
            updateCounter++;

            // Update the chat message periodically (every 3 tokens)
            // to avoid hammering the DOM but still feel responsive
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

    // Process any remaining buffer
    if (buffer.trim()) {
      try {
        const parsed = JSON.parse(buffer);
        if (parsed.no_context) noContext = true;
        else if (parsed.response) fullText += parsed.response;
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
