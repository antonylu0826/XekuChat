// ============================================================
// MCP Client — stdio & SSE transports (Part D)
// JSON-RPC 2.0 over stdio or HTTP+SSE
// ============================================================

import type { ToolDefinition } from "./tools";

// ============================================================
// Types
// ============================================================

interface MCPToolSchema {
  name: string;
  description?: string;
  inputSchema?: {
    type: string;
    properties?: Record<string, { type: string; description?: string }>;
    required?: string[];
  };
}

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// ============================================================
// Cached MCP connections (keyed by server ID)
// ============================================================

const activeStdioConnections = new Map<string, StdioMCPClient>();

// ============================================================
// Stdio MCP Client
// ============================================================

class StdioMCPClient {
  private proc: ReturnType<typeof Bun.spawn> | null = null;
  private nextId = 1;
  private pendingRequests = new Map<number, { resolve: (r: unknown) => void; reject: (e: Error) => void }>();
  private buffer = "";
  private initialized = false;

  constructor(private command: string, private envVars: Record<string, string> = {}) {}

  private async ensureStarted(): Promise<void> {
    if (this.proc && this.initialized) return;

    const parts = this.command.split(/\s+/);
    const [cmd, ...args] = parts;

    this.proc = Bun.spawn([cmd, ...args], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      env: Object.fromEntries(
        Object.entries({ ...process.env, ...this.envVars }).filter(([, v]) => v !== undefined)
      ) as Record<string, string>,
    });

    // Read stdout line by line
    this.readLoop();

    // Initialize
    await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "XekuChat", version: "1.0" },
    });
    this.initialized = true;
  }

  private async readLoop() {
    const stdout = this.proc?.stdout;
    if (!stdout || typeof stdout === "number") return;
    const reader = (stdout as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        this.buffer += decoder.decode(value, { stream: true });
        const lines = this.buffer.split("\n");
        this.buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const msg: JsonRpcResponse = JSON.parse(trimmed);
            const pending = this.pendingRequests.get(msg.id);
            if (pending) {
              this.pendingRequests.delete(msg.id);
              if (msg.error) {
                pending.reject(new Error(msg.error.message));
              } else {
                pending.resolve(msg.result);
              }
            }
          } catch {
            // not JSON, ignore
          }
        }
      }
    } catch {
      // process ended
    }
  }

  private request(method: string, params?: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const req: JsonRpcRequest = { jsonrpc: "2.0", id, method, ...(params !== undefined ? { params } : {}) };
      this.pendingRequests.set(id, { resolve, reject });

      const line = JSON.stringify(req) + "\n";
      const stdin = this.proc?.stdin;
      if (stdin && typeof stdin !== "number") {
        (stdin as { write(data: Uint8Array): void }).write(new TextEncoder().encode(line));
      }

      // Timeout after 30s
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`MCP request timeout: ${method}`));
        }
      }, 30_000);
    });
  }

  async listTools(): Promise<MCPToolSchema[]> {
    await this.ensureStarted();
    const result = await this.request("tools/list", {}) as { tools?: MCPToolSchema[] };
    return result?.tools ?? [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    await this.ensureStarted();
    const result = await this.request("tools/call", { name, arguments: args }) as {
      content?: Array<{ type: string; text?: string }>;
      isError?: boolean;
    };
    const texts = result?.content?.filter((c) => c.type === "text").map((c) => c.text ?? "") ?? [];
    if (result?.isError) throw new Error(texts.join("\n") || "MCP tool error");
    return texts.join("\n");
  }

  close() {
    this.proc?.kill();
    this.proc = null;
    this.initialized = false;
  }
}

// ============================================================
// SSE/HTTP MCP Client (stateless HTTP requests)
// ============================================================

class SSEMCPClient {
  constructor(private url: string) {}

  private async request(method: string, params?: unknown): Promise<unknown> {
    const req: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      ...(params !== undefined ? { params } : {}),
    };

    const res = await fetch(`${this.url.replace(/\/+$/, "")}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) throw new Error(`MCP SSE HTTP ${res.status}`);
    const data: JsonRpcResponse = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.result;
  }

  async listTools(): Promise<MCPToolSchema[]> {
    const result = await this.request("tools/list", {}) as { tools?: MCPToolSchema[] };
    return result?.tools ?? [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const result = await this.request("tools/call", { name, arguments: args }) as {
      content?: Array<{ type: string; text?: string }>;
      isError?: boolean;
    };
    const texts = result?.content?.filter((c) => c.type === "text").map((c) => c.text ?? "") ?? [];
    if (result?.isError) throw new Error(texts.join("\n") || "MCP tool error");
    return texts.join("\n");
  }
}

// ============================================================
// Load tools from an MCP server config
// ============================================================

export interface MCPServerConfig {
  id: string;
  transport: "stdio" | "sse";
  command?: string | null;
  url?: string | null;
  envVars?: Record<string, string>;
}

export async function loadMCPTools(server: MCPServerConfig): Promise<ToolDefinition[]> {
  try {
    let client: StdioMCPClient | SSEMCPClient;

    if (server.transport === "stdio") {
      if (!server.command) return [];
      // Reuse existing connection
      if (!activeStdioConnections.has(server.id)) {
        activeStdioConnections.set(server.id, new StdioMCPClient(server.command, server.envVars ?? {}));
      }
      client = activeStdioConnections.get(server.id)!;
    } else {
      if (!server.url) return [];
      client = new SSEMCPClient(server.url);
    }

    const mcpTools = await client.listTools();

    return mcpTools.map((t): ToolDefinition => ({
      name: `mcp__${server.id.slice(0, 8)}__${t.name}`,
      description: `[MCP: ${t.name}] ${t.description ?? ""}`,
      parameters: {
        type: "object",
        properties: (t.inputSchema?.properties ?? {}) as import("./tools").ToolDefinition["parameters"]["properties"],
        required: t.inputSchema?.required ?? [],
      },
      execute: async (args) => {
        const c = server.transport === "stdio"
          ? activeStdioConnections.get(server.id)!
          : new SSEMCPClient(server.url!);
        return await c.callTool(t.name, args);
      },
    }));
  } catch (err) {
    console.error(`MCP load tools error (${server.id}):`, err);
    return [];
  }
}

export function closeMCPServer(serverId: string) {
  const conn = activeStdioConnections.get(serverId);
  if (conn) {
    conn.close();
    activeStdioConnections.delete(serverId);
  }
}
