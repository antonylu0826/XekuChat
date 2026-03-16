import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MessagePayload } from "@xekuchat/core";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { LinkPreview } from "./LinkPreview";
import { EmojiPicker, ReactionDisplay } from "./EmojiPicker";
import { ImageLightbox } from "./ImageLightbox";

interface MessageListProps {
  messages: MessagePayload[];
  currentUserId: string;
  token: string;
  readCounts: Map<string, number>;
  reactions: Map<string, Array<{ emoji: string; count: number }>>;
  onRetract: (messageId: string) => void;
  onReply: (messageId: string) => void;
  onReaction: (messageId: string, emoji: string) => void;
  onMessageVisible: (messageId: string) => void;
}

// Extract URLs from text
function extractUrls(text: string): string[] {
  const regex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
  return text.match(regex) || [];
}

export function MessageList({
  messages,
  currentUserId,
  token,
  readCounts,
  reactions,
  onRetract,
  onReply,
  onReaction,
  onMessageVisible,
}: MessageListProps) {
  const { t } = useTranslation();
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    // Show button when scrolled up more than 200px from bottom
    setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 200);
  };

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    if (messages.length > 0) {
      onMessageVisible(messages[messages.length - 1].id);
    }
  }, [messages.length, onMessageVisible]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-slate-500">
        {t("message.noMessages")}
      </div>
    );
  }

  return (
    <div ref={containerRef} onScroll={handleScroll} className="relative flex flex-1 flex-col overflow-y-auto p-4">
      <div className="flex-1" />
      {messages.map((msg) => {
        const isMine = msg.senderId === currentUserId;
        const readCount = readCounts.get(msg.id);
        const msgReactions = reactions.get(msg.id) || [];
        const urls = msg.isRetracted ? [] : extractUrls(msg.content);

        return (
          <div key={msg.id} className={`group mb-3 flex ${isMine ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-lg ${isMine ? "order-2" : ""}`}>
              {/* Reply reference */}
              {msg.replyToId && (
                <div className="mb-1 rounded border-l-2 border-slate-500 pl-2 text-xs text-slate-400">
                  Replying to a message
                </div>
              )}

              {/* Message bubble */}
              <div
                className={`rounded-2xl px-4 py-2 ${
                  msg.isRetracted
                    ? "border border-slate-600 bg-transparent italic text-slate-500"
                    : isMine
                      ? "bg-blue-600 text-white"
                      : "bg-slate-700 text-white"
                }`}
              >
                {msg.isRetracted ? (
                  <span className="text-sm">{t("message.retracted")}</span>
                ) : msg.type === "image" ? (
                  <button
                    onClick={() => setLightboxSrc(msg.attachments?.[0]?.url || msg.content)}
                    className="block overflow-hidden rounded-lg focus:outline-none"
                  >
                    <img
                      src={msg.attachments?.[0]?.url || msg.content}
                      alt="image"
                      className="h-40 w-40 object-cover transition hover:opacity-90"
                      loading="lazy"
                    />
                  </button>
                ) : msg.type === "file" ? (() => {
                  const url = msg.attachments?.[0]?.url || msg.content;
                  const mimeType = msg.attachments?.[0]?.mimeType || "";
                  const name = msg.attachments?.[0]?.name || url.split("/").pop() || "File";
                  const isPlayableVideo = mimeType === "video/mp4" || mimeType === "video/webm" ||
                    /\.(mp4|webm)$/i.test(url);
                  const isVideo = isPlayableVideo || mimeType.startsWith("video/") ||
                    /\.(mov|mkv|avi|mp4|webm)$/i.test(url);

                  if (isPlayableVideo) {
                    return (
                      <video
                        src={url}
                        controls
                        className="max-h-64 max-w-xs rounded-lg"
                        preload="metadata"
                      />
                    );
                  }
                  return (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm underline"
                    >
                      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={
                          isVideo
                            ? "M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"
                            : "M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        } />
                      </svg>
                      {name}
                    </a>
                  );
                })() : (
                  <MarkdownRenderer content={msg.content} />
                )}
              </div>

              {/* Inline images from attachments */}
              {!msg.isRetracted && msg.attachments && msg.attachments.length > 0 && msg.type === "text" && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {msg.attachments
                    .filter((a) => a.mimeType.startsWith("image/"))
                    .map((a) => (
                      <button
                        key={a.id}
                        onClick={() => setLightboxSrc(a.url)}
                        className="overflow-hidden rounded-lg focus:outline-none"
                      >
                        <img
                          src={a.url}
                          alt={a.name}
                          className="h-40 w-40 object-cover transition hover:opacity-90"
                          loading="lazy"
                        />
                      </button>
                    ))}
                </div>
              )}

              {/* URL previews */}
              {urls.slice(0, 1).map((url) => (
                <LinkPreview key={url} url={url} token={token} />
              ))}

              {/* Reactions */}
              <ReactionDisplay
                reactions={msgReactions}
                onToggle={(emoji) => onReaction(msg.id, emoji)}
              />

              {/* Meta: time + read count + actions */}
              <div
                className={`mt-1 flex items-center gap-2 text-xs text-slate-500 ${
                  isMine ? "justify-end" : ""
                }`}
              >
                <span>{formatTime(msg.createdAt)}</span>
                {isMine && readCount !== undefined && readCount > 0 && (
                  <span>{t("message.readBy", { count: readCount })}</span>
                )}

                {/* Hover actions */}
                <span className="invisible flex gap-1 group-hover:visible">
                  {!msg.isRetracted && (
                    <>
                      <EmojiPicker onSelect={(emoji) => onReaction(msg.id, emoji)} />
                      <button
                        onClick={() => onReply(msg.id)}
                        className="rounded p-1 text-slate-500 transition hover:bg-slate-700 hover:text-white"
                        title="Reply"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                        </svg>
                      </button>
                    </>
                  )}
                  {isMine && !msg.isRetracted && (
                    <button
                      onClick={() => onRetract(msg.id)}
                      className="rounded p-1 text-slate-500 transition hover:bg-slate-700 hover:text-red-400"
                      title="Retract"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </span>
              </div>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />

      {showScrollBtn && (
        <button
          onClick={scrollToBottom}
          className="sticky bottom-6 ml-auto flex h-10 w-10 shrink-0 items-center justify-center self-end rounded-full border-2 border-slate-400 bg-slate-900/80 text-slate-200 shadow-xl backdrop-blur-sm transition hover:border-slate-200 hover:text-white"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}>
            <line x1="12" y1="4" x2="12" y2="15" />
            <polyline points="8,11 12,16 16,11" />
          </svg>
        </button>
      )}

      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}
    </div>
  );
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
