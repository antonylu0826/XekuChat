import { useEffect, useRef, useCallback, useState } from "react";
import type { WSClientEvent, WSServerEvent } from "@xekuchat/core";
import { WS_HEARTBEAT_INTERVAL } from "@xekuchat/core";

type WSStatus = "connecting" | "connected" | "disconnected";

interface UseWebSocketOptions {
  token: string | null;
  onMessage: (event: WSServerEvent) => void;
}

export function useWebSocket({ token, onMessage }: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempts = useRef(0);
  const [status, setStatus] = useState<WSStatus>("disconnected");

  const connect = useCallback(() => {
    if (!token) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws?token=${token}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    setStatus("connecting");

    ws.onopen = () => {
      setStatus("connected");
      reconnectAttempts.current = 0;

      // Start heartbeat
      heartbeatRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send("ping");
        }
      }, WS_HEARTBEAT_INTERVAL);
    };

    ws.onmessage = (e) => {
      if (e.data === "pong") return;
      try {
        const event = JSON.parse(e.data) as WSServerEvent;
        onMessage(event);
      } catch {
        console.error("WS: Failed to parse message");
      }
    };

    ws.onclose = () => {
      setStatus("disconnected");
      cleanup();

      // Auto-reconnect with exponential backoff
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30_000);
      reconnectAttempts.current++;

      reconnectRef.current = setTimeout(() => {
        connect();
      }, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [token, onMessage]);

  function cleanup() {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }

  // Send event through WebSocket
  const send = useCallback((event: WSClientEvent) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(event));
    }
  }, []);

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    connect();
    return () => {
      cleanup();
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
      }
      wsRef.current?.close();
    };
  }, [connect]);

  return { status, send };
}
