// ============================================================
// Open Graph URL Preview
// Fetches OG meta tags from URLs found in messages
// ============================================================

export interface OGPreview {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}

const ogCache = new Map<string, OGPreview | null>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// Extract URLs from message content
export function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
  return text.match(urlRegex) || [];
}

// Fetch Open Graph metadata from a URL
export async function fetchOGPreview(url: string): Promise<OGPreview | null> {
  // Check cache
  if (ogCache.has(url)) {
    return ogCache.get(url) || null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "XekuChat/1.0 (OG Preview Bot)",
        Accept: "text/html",
      },
    });

    clearTimeout(timeout);

    if (!res.ok || !res.headers.get("content-type")?.includes("text/html")) {
      ogCache.set(url, null);
      return null;
    }

    // Only read first 50KB to avoid large downloads
    const reader = res.body?.getReader();
    if (!reader) return null;

    let html = "";
    let totalBytes = 0;
    const maxBytes = 50 * 1024;

    while (totalBytes < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      html += new TextDecoder().decode(value);
      totalBytes += value.length;
    }
    reader.cancel();

    const preview = parseOGTags(url, html);
    ogCache.set(url, preview);

    // Auto-expire cache
    setTimeout(() => ogCache.delete(url), CACHE_TTL);

    return preview;
  } catch {
    ogCache.set(url, null);
    return null;
  }
}

function parseOGTags(url: string, html: string): OGPreview {
  const getMetaContent = (property: string): string | undefined => {
    const regex = new RegExp(
      `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']*)["']`,
      "i"
    );
    const altRegex = new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${property}["']`,
      "i"
    );
    return regex.exec(html)?.[1] || altRegex.exec(html)?.[1];
  };

  const titleMatch = /<title[^>]*>([^<]*)<\/title>/i.exec(html);

  return {
    url,
    title: getMetaContent("og:title") || titleMatch?.[1]?.trim(),
    description: getMetaContent("og:description") || getMetaContent("description"),
    image: getMetaContent("og:image"),
    siteName: getMetaContent("og:site_name"),
  };
}
