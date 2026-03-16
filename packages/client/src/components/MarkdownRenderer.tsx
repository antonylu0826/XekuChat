// ============================================================
// Lightweight Markdown Renderer
// Supports: bold, italic, code, code blocks, links, lists
// No external dependency — simple regex-based parsing
// ============================================================

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

function renderMarkdown(text: string): string {
  // Escape HTML first (prevent XSS)
  let html = escapeHtml(text);

  // Code blocks (```...```)
  html = html.replace(
    /```(\w*)\n?([\s\S]*?)```/g,
    '<pre class="my-1 rounded bg-slate-900 p-2 text-xs overflow-x-auto"><code>$2</code></pre>'
  );

  // Inline code (`...`)
  html = html.replace(
    /`([^`]+)`/g,
    '<code class="rounded bg-slate-900 px-1 py-0.5 text-xs">$1</code>'
  );

  // Bold (**...**)
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Italic (*...*)
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");

  // Strikethrough (~~...~~)
  html = html.replace(/~~(.+?)~~/g, '<del class="text-slate-500">$1</del>');

  // Links [text](url) — validate URL scheme
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-400 underline hover:text-blue-300">$1</a>'
  );

  // Auto-link bare URLs
  html = html.replace(
    /(?<!["\w])(https?:\/\/[^\s<>"]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-blue-400 underline hover:text-blue-300">$1</a>'
  );

  // Unordered lists (- item)
  html = html.replace(
    /^- (.+)$/gm,
    '<li class="ml-4 list-disc">$1</li>'
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
