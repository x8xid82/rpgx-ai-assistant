// scripts/markdown.js — Lightweight Markdown → HTML for Foundry chat
// Handles the common patterns LLMs produce: headers, bold, italic,
// lists, inline code, code blocks, and line breaks.

/**
 * Convert a markdown string to safe HTML for display in Foundry chat.
 * Not a full CommonMark parser — just the patterns Ollama models actually use.
 */
export function renderMarkdown(text) {
  if (!text) return "";

  let html = text;

  // ── Code blocks (``` ... ```) — must come first to protect contents ──
  const codeBlocks = [];
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_m, lang, code) => {
    const idx = codeBlocks.length;
    const escaped = escapeHtml(code.trim());
    codeBlocks.push(
      `<pre class="rpgx-code"><code>${escaped}</code></pre>`
    );
    return `%%CODEBLOCK_${idx}%%`;
  });

  // ── Inline code (`...`) ──
  const inlineCode = [];
  html = html.replace(/`([^`]+)`/g, (_m, code) => {
    const idx = inlineCode.length;
    inlineCode.push(`<code class="rpgx-inline-code">${escapeHtml(code)}</code>`);
    return `%%INLINE_${idx}%%`;
  });

  // ── Escape remaining HTML ──
  html = escapeHtml(html);

  // ── Headers (### ... ) ──
  html = html.replace(/^#### (.+)$/gm, "<h4>$1</h4>");
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  // ── Bold + Italic (***text*** or ___text___) ──
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  html = html.replace(/___(.+?)___/g, "<strong><em>$1</em></strong>");

  // ── Bold (**text** or __text__) ──
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__(.+?)__/g, "<strong>$1</strong>");

  // ── Italic (*text* or _text_) ──
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(/(?<!\w)_(.+?)_(?!\w)/g, "<em>$1</em>");

  // ── Unordered lists (- item or * item) ──
  html = html.replace(/^[\-\*] (.+)$/gm, "<li>$1</li>");
  // Wrap consecutive <li> elements in <ul>
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>");

  // ── Ordered lists (1. item) ──
  html = html.replace(/^\d+\. (.+)$/gm, "<li>$1</li>");
  // Wrap consecutive <li> not already in <ul> in <ol>
  html = html.replace(
    /(?<!<\/ul>)((?:<li>.*<\/li>\n?)+)/g,
    "<ol>$1</ol>"
  );

  // ── Horizontal rules ──
  html = html.replace(/^---+$/gm, "<hr>");

  // ── Line breaks (double newline = paragraph, single = <br>) ──
  html = html.replace(/\n\n+/g, "</p><p>");
  html = html.replace(/\n/g, "<br>");
  html = `<p>${html}</p>`;

  // Clean up empty paragraphs around block elements
  html = html.replace(/<p><\/p>/g, "");
  html = html.replace(/<p>(<h[1-4]>)/g, "$1");
  html = html.replace(/(<\/h[1-4]>)<\/p>/g, "$1");
  html = html.replace(/<p>(<ul>)/g, "$1");
  html = html.replace(/(<\/ul>)<\/p>/g, "$1");
  html = html.replace(/<p>(<ol>)/g, "$1");
  html = html.replace(/(<\/ol>)<\/p>/g, "$1");
  html = html.replace(/<p>(<pre)/g, "$1");
  html = html.replace(/(<\/pre>)<\/p>/g, "$1");
  html = html.replace(/<p>(<hr>)<\/p>/g, "$1");

  // ── Restore code blocks and inline code ──
  codeBlocks.forEach((block, i) => {
    html = html.replace(`%%CODEBLOCK_${i}%%`, block);
  });
  inlineCode.forEach((code, i) => {
    html = html.replace(`%%INLINE_${i}%%`, code);
  });

  return html;
}

/** Escape HTML entities */
function escapeHtml(s) {
  return (s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
