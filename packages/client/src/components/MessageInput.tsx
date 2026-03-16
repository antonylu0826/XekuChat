import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { FileUpload } from "./FileUpload";

interface MessageInputProps {
  token: string;
  onSend: (content: string, replyToId?: string) => void;
  onTyping: (isTyping: boolean) => void;
  onFileUploaded: (file: { url: string; name: string; mimeType: string; size: number }) => void;
  replyToId?: string | null;
  onCancelReply?: () => void;
  disabled?: boolean;
}

export function MessageInput({
  token,
  onSend,
  onTyping,
  onFileUploaded,
  replyToId,
  onCancelReply,
  disabled,
}: MessageInputProps) {
  const { t } = useTranslation();
  const [content, setContent] = useState("");
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Handle clipboard paste for images
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (!file) continue;

          const formData = new FormData();
          formData.append("file", file, `paste-${Date.now()}.${item.type.split("/")[1] || "png"}`);

          const res = await fetch("/api/upload", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          });

          const body = await res.json();
          if (body.success) {
            onFileUploaded(body.data);
          }
        }
      }
    };

    textarea.addEventListener("paste", handlePaste);
    return () => textarea.removeEventListener("paste", handlePaste);
  }, [token, onFileUploaded]);

  // Handle drag and drop
  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (!file) return;

      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const body = await res.json();
      if (body.success) {
        onFileUploaded(body.data);
      }
    },
    [token, onFileUploaded]
  );

  const handleTyping = useCallback(() => {
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      onTyping(true);
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      onTyping(false);
    }, 2000);
  }, [onTyping]);

  const handleSubmit = () => {
    const trimmed = content.trim();
    if (!trimmed) return;

    onSend(trimmed, replyToId || undefined);
    setContent("");

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    isTypingRef.current = false;
    onTyping(false);

    if (onCancelReply) onCancelReply();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="border-t border-slate-700 p-4">
      {/* Reply indicator */}
      {replyToId && (
        <div className="mb-2 flex items-center gap-2 text-xs text-slate-400">
          <span>Replying to message</span>
          <button onClick={onCancelReply} className="text-slate-500 hover:text-white">
            ×
          </button>
        </div>
      )}

      <div
        className="flex items-end gap-2"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        <FileUpload token={token} onUploaded={onFileUploaded} />

        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            handleTyping();
          }}
          onKeyDown={handleKeyDown}
          placeholder={t("message.placeholder")}
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
        />

        <button
          onClick={handleSubmit}
          disabled={disabled || !content.trim()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
        >
          {t("message.send")}
        </button>
      </div>
    </div>
  );
}
