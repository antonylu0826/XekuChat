// ============================================================
// Built-in AI Skills (Part A)
// ============================================================

import type { ToolDefinition } from "./tools";

// ---- current_datetime ----

const currentDatetime: ToolDefinition = {
  name: "current_datetime",
  description: "Get the current date and time in ISO 8601 format and Taiwan timezone.",
  parameters: {
    type: "object",
    properties: {},
    required: [],
  },
  execute: async () => {
    const now = new Date();
    const twTime = now.toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false });
    return `Current datetime (Asia/Taipei): ${twTime} | ISO: ${now.toISOString()}`;
  },
};

// ---- calculator ----

const calculator: ToolDefinition = {
  name: "calculator",
  description: "Evaluate a mathematical expression safely. Supports arithmetic, Math functions (sin, cos, sqrt, pow, abs, floor, ceil, round, log), and constants (PI, E).",
  parameters: {
    type: "object",
    properties: {
      expression: {
        type: "string",
        description: "Mathematical expression to evaluate, e.g. '2 + 3 * 4' or 'Math.sqrt(16)'",
      },
    },
    required: ["expression"],
  },
  execute: async (args) => {
    const expr = String(args.expression ?? "").trim();
    if (!expr) return "Error: empty expression";

    // Whitelist: only allow numbers, operators, spaces, Math functions, and constants
    const safe = /^[\d\s+\-*/().^%,Mathsqrtincoabflerpwodg]+$/i.test(expr)
      ? expr
      : null;

    if (!safe) return "Error: expression contains invalid characters";

    try {
      // Restricted evaluation sandbox
      const result = new Function(
        "Math",
        `"use strict"; return (${expr});`
      )(Math);

      if (typeof result !== "number" || !isFinite(result)) {
        return `Result: ${result}`;
      }
      return `Result: ${result}`;
    } catch (err) {
      return `Error: ${err instanceof Error ? err.message : "evaluation failed"}`;
    }
  },
};

// ---- fetch_url ----

const fetchUrl: ToolDefinition = {
  name: "fetch_url",
  description: "Fetch the content of a URL and return the text content (HTML stripped, max 3000 chars).",
  parameters: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The URL to fetch. Must be a valid http/https URL.",
      },
    },
    required: ["url"],
  },
  execute: async (args) => {
    const url = String(args.url ?? "").trim();
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      return "Error: URL must start with http:// or https://";
    }

    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "XekuChat-AI/1.0" },
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) return `Error: HTTP ${res.status} from ${url}`;

      const contentType = res.headers.get("content-type") ?? "";
      const text = await res.text();

      // Strip HTML tags if HTML
      const clean = contentType.includes("html")
        ? text
            .replace(/<script[\s\S]*?<\/script>/gi, "")
            .replace(/<style[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
        : text;

      const truncated = clean.length > 3000 ? clean.slice(0, 3000) + "\n[...truncated]" : clean;
      return `Content from ${url}:\n\n${truncated}`;
    } catch (err) {
      return `Error fetching ${url}: ${err instanceof Error ? err.message : "unknown error"}`;
    }
  },
};

// ---- web_search ----
// Supports Brave Search API, Tavily API, or SerpApi
// API key is read from environment variable SEARCH_API_KEY
// Provider is determined by SEARCH_PROVIDER env var: "brave" | "tavily" (default: brave)

const webSearch: ToolDefinition = {
  name: "web_search",
  description: "Search the web for current information. Returns a list of relevant search results.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query",
      },
      count: {
        type: "number",
        description: "Number of results to return (1-10, default 5)",
      },
    },
    required: ["query"],
  },
  execute: async (args) => {
    const query = String(args.query ?? "").trim();
    const count = Math.min(10, Math.max(1, Number(args.count ?? 5)));
    if (!query) return "Error: empty search query";

    const apiKey = process.env.SEARCH_API_KEY;
    if (!apiKey) return "Error: SEARCH_API_KEY not configured. Please set it in environment variables.";

    const provider = process.env.SEARCH_PROVIDER ?? "brave";

    try {
      if (provider === "tavily") {
        return await searchTavily(query, count, apiKey);
      }
      return await searchBrave(query, count, apiKey);
    } catch (err) {
      return `Search error: ${err instanceof Error ? err.message : "unknown error"}`;
    }
  },
};

async function searchBrave(query: string, count: number, apiKey: string): Promise<string> {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`;
  const res = await fetch(url, {
    headers: { "X-Subscription-Token": apiKey, Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) return `Brave Search error: HTTP ${res.status}`;
  const data = await res.json() as {
    web?: { results?: Array<{ title: string; url: string; description?: string }> };
  };

  const results = data.web?.results ?? [];
  if (!results.length) return "No search results found.";

  return results
    .map((r, i) => `[${i + 1}] ${r.title}\n    URL: ${r.url}\n    ${r.description ?? ""}`)
    .join("\n\n");
}

async function searchTavily(query: string, count: number, apiKey: string): Promise<string> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, query, max_results: count }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) return `Tavily Search error: HTTP ${res.status}`;
  const data = await res.json() as {
    results?: Array<{ title: string; url: string; content?: string }>;
  };

  const results = data.results ?? [];
  if (!results.length) return "No search results found.";

  return results
    .map((r, i) => `[${i + 1}] ${r.title}\n    URL: ${r.url}\n    ${(r.content ?? "").slice(0, 200)}`)
    .join("\n\n");
}

// ============================================================
// Registry
// ============================================================

export const BUILTIN_TOOLS: Record<string, ToolDefinition> = {
  current_datetime: currentDatetime,
  calculator,
  fetch_url: fetchUrl,
  web_search: webSearch,
};

export function getBuiltinTool(name: string): ToolDefinition | undefined {
  return BUILTIN_TOOLS[name];
}
