import { useState, useCallback, useRef, useEffect } from "react";
import type { MessagePayload, WSServerEvent, WSClientEvent } from "@xekuchat/core";
import { useWebSocket } from "./useWebSocket";

interface ChatState {
  messages: MessagePayload[];
  typingUsers: Map<string, boolean>;
  readCounts: Map<string, number>;
  reactions: Map<string, Array<{ emoji: string; count: number }>>;
}

export function useChat(token: string | null, activeChannelId: string | null) {
  const [state, setState] = useState<ChatState>({
    messages: [],
    typingUsers: new Map(),
    readCounts: new Map(),
    reactions: new Map(),
  });

  const activeChannelRef = useRef(activeChannelId);
  activeChannelRef.current = activeChannelId;

  // sendRef breaks the circular dep between handleMessage and send
  const sendRef = useRef<(event: WSClientEvent) => void>(() => {});
  // Deduplicate message:new events (can arrive twice: direct + Redis subscriber)
  const seenMsgIds = useRef<Set<string>>(new Set());

  const handleMessage = useCallback((event: WSServerEvent) => {
    switch (event.type) {
      case "message:new": {
        const msgId = event.message.id;
        if (seenMsgIds.current.has(msgId)) break; // duplicate, skip
        seenMsgIds.current.add(msgId);
        setTimeout(() => seenMsgIds.current.delete(msgId), 60_000); // cleanup after 1 min

        // Notify sidebar for unread badge
        window.dispatchEvent(
          new CustomEvent("xeku:message-new", {
            detail: { channelId: event.message.channelId, senderId: event.message.senderId },
          })
        );
        if (event.message.channelId === activeChannelRef.current) {
          setState((s) => ({ ...s, messages: [...s.messages, event.message] }));
        }
        break;
      }

      case "message:retracted":
        setState((s) => ({
          ...s,
          messages: s.messages.map((m) =>
            m.id === event.messageId ? { ...m, isRetracted: true, content: "" } : m
          ),
        }));
        break;

      case "typing":
        setState((s) => {
          const newTyping = new Map(s.typingUsers);
          if (event.isTyping) {
            newTyping.set(event.userId, true);
          } else {
            newTyping.delete(event.userId);
          }
          return { ...s, typingUsers: newTyping };
        });
        break;

      case "read:updated":
        setState((s) => {
          const newCounts = new Map(s.readCounts);
          newCounts.set(event.messageId, event.readCount);
          return { ...s, readCounts: newCounts };
        });
        break;

      case "reaction:updated":
        if (event.channelId === activeChannelRef.current) {
          setState((s) => {
            const newReactions = new Map(s.reactions);
            newReactions.set(event.messageId, event.reactions);
            return { ...s, reactions: newReactions };
          });
        }
        break;

      case "channel:joined":
        // Subscribe WS to the new channel, then tell UI to reload channel list
        sendRef.current({ type: "channel:join", channelId: event.channelId });
        window.dispatchEvent(new CustomEvent("xeku:channel-joined", { detail: { channelId: event.channelId } }));
        break;
    }
  }, []);

  const { status, send } = useWebSocket({ token, onMessage: handleMessage });

  // Keep sendRef up-to-date so handleMessage can call send without being in its deps
  sendRef.current = send;

  // Subscribe to channel via WS when channel changes (handles dynamically added channels)
  useEffect(() => {
    if (!activeChannelId) return;
    send({ type: "channel:join", channelId: activeChannelId });
  }, [activeChannelId, send]);

  // Fetch initial messages when channel changes
  useEffect(() => {
    if (!activeChannelId || !token) return;

    setState({ messages: [], typingUsers: new Map(), readCounts: new Map(), reactions: new Map() });

    fetch(`/api/messages/${activeChannelId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.items) {
          // Build initial reactions map from message data
          const reactionsMap = new Map<string, Array<{ emoji: string; count: number }>>();
          for (const msg of data.items) {
            if (msg.reactions?.length) {
              const grouped = new Map<string, number>();
              for (const r of msg.reactions) {
                grouped.set(r.emoji, (grouped.get(r.emoji) ?? 0) + 1);
              }
              reactionsMap.set(msg.id, Array.from(grouped.entries()).map(([emoji, count]) => ({ emoji, count })));
            }
          }
          setState((s) => ({
            ...s,
            messages: data.items as MessagePayload[],
            reactions: reactionsMap,
          }));
        }
      })
      .catch(console.error);
  }, [activeChannelId, token]);

  const sendMessage = useCallback(
    (
      content: string,
      replyToId?: string,
      messageType?: "text" | "image" | "file",
      fileMeta?: { name: string; mimeType: string; size: number }
    ) => {
      if (!activeChannelRef.current) return;
      send({
        type: "message:send",
        channelId: activeChannelRef.current,
        content,
        replyToId,
        messageType,
        ...(fileMeta && {
          fileName: fileMeta.name,
          fileMimeType: fileMeta.mimeType,
          fileSize: fileMeta.size,
        }),
      });
    },
    [send]
  );

  const retractMessage = useCallback(
    (messageId: string) => {
      send({ type: "message:retract", messageId });
    },
    [send]
  );

  const sendTyping = useCallback(
    (isTyping: boolean) => {
      if (!activeChannelRef.current) return;
      send({
        type: isTyping ? "typing:start" : "typing:stop",
        channelId: activeChannelRef.current,
      });
    },
    [send]
  );

  const markAsRead = useCallback(
    (messageId: string) => {
      if (!activeChannelRef.current) return;
      send({
        type: "read:update",
        channelId: activeChannelRef.current,
        messageId,
      });
    },
    [send]
  );

  const sendReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!token) return;
      await fetch(`/api/reactions/${messageId}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ emoji }),
      });
    },
    [token]
  );

  return {
    ...state,
    wsStatus: status,
    sendMessage,
    retractMessage,
    sendTyping,
    markAsRead,
    sendReaction,
  };
}
