// ============================================================
// Lightweight Markdown Renderer
// Supports: bold, italic, code, code blocks, links, lists, @mentions
// No external dependency — simple regex-based parsing
// ============================================================

import { MENTION_PATTERN } from "@xekuchat/core";

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const html = renderMarkdown(content);
  return (
    <div
      className="markdown-content text-sm"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// Module-level regex constants (compiled once, not on every call)
const RE_CODE_BLOCK = /```(\w*)\n?([\s\S]*?)```/g;
const RE_INLINE_CODE = /`([^`]+)`/g;
const RE_BOLD = /\*\*(.+?)\*\*/g;
const RE_ITALIC = /(?<!\*)\*([^*]+)\*(?!\*)/g;
const RE_STRIKETHROUGH = /~~(.+?)~~/g;
const RE_LINK = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
const RE_AUTO_LINK = /(?<!["\w])(https?:\/\/[^\s<>"]+)/g;
const RE_LIST = /^- (.+)$/gm;
const RE_MENTION = new RegExp(MENTION_PATTERN, "gu");

function renderMarkdown(text: string): string {
  // Escape HTML first (prevent XSS)
  let html = escapeHtml(text);

  // Code blocks (```...```)
  html = html.replace(
    RE_CODE_BLOCK,
    '<pre class="my-1 rounded bg-slate-900 p-2 text-xs overflow-x-auto"><code>$2</code></pre>'
  );

  // Inline code (`...`)
  html = html.replace(
    RE_INLINE_CODE,
    '<code class="rounded bg-slate-900 px-1 py-0.5 text-xs">$1</code>'
  );

  // Bold (**...**)
  html = html.replace(RE_BOLD, "<strong>$1</strong>");

  // Italic (*...*)
  html = html.replace(RE_ITALIC, "<em>$1</em>");

  // Strikethrough (~~...~~)
  html = html.replace(RE_STRIKETHROUGH, '<del class="text-slate-500">$1</del>');

  // Links [text](url) — validate URL scheme
  html = html.replace(
    RE_LINK,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-400 underline hover:text-blue-300">$1</a>'
  );

  // Auto-link bare URLs
  html = html.replace(
    RE_AUTO_LINK,
    '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-blue-400 underline hover:text-blue-300">$1</a>'
  );

  // Unordered lists (- item)
  html = html.replace(
    RE_LIST,
    '<li class="ml-4 list-disc">$1</li>'
  );

  // @mentions
  html = html.replace(
    RE_MENTION,
    '<span class="inline-block rounded bg-slate-400/40 px-1 py-0.5 text-xs font-medium text-white">@$1</span>'
  );

  // Line breaks
  html = html.replace(/\n/g, "<br>");

  return html;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
