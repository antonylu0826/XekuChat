import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { FileUpload } from "./FileUpload";

const EMOJI_CATEGORIES = [
  {
    label: "😊", name: "表情",
    emojis: ["😀","😂","🥹","😭","😍","🥰","😘","😎","🤩","🥳","😏","😒","😔","😤","😡","😱","😰","🤗","🤔","🤫","😶","😐","😬","🙄","😴","😷","🤒","🤢","🤮","🥵","🥶","🥴","😵","🤯","🤠","🥸"],
  },
  {
    label: "👋", name: "手勢",
    emojis: ["👋","🤚","✋","🖖","👌","🤌","✌️","🤞","👍","👎","✊","👊","🤝","🙌","👏","🫶","💪","🙏","👈","👉","👆","👇","☝️","🤙","💅","🖐️"],
  },
  {
    label: "🐶", name: "動物",
    emojis: ["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐸","🐵","🙈","🙉","🙊","🐔","🐧","🦆","🦉","🦇","🐺","🐴","🦄","🐝","🐛","🦋","🐌","🐞","🐜","🐢","🐍","🦎","🐠","🐟","🐡","🐙","🦑","🦞","🦀","🐡","🦈","🐳","🐋","🐬","🦭","🐊"],
  },
  {
    label: "🍎", name: "食物",
    emojis: ["🍎","🍊","🍋","🍇","🍓","🍑","🍒","🍌","🍉","🍏","🥑","🥦","🥕","🌽","🍄","🍞","🥐","🧀","🥚","🍳","🥞","🧇","🥓","🍔","🍟","🍕","🌭","🌮","🌯","🍜","🍝","🍛","🍣","🍱","🍙","🍚","🍘","🍥","🥮","🍢","🧆","🥗","🍿","🧂","🥤","🧃","☕","🍵","🍺","🍻","🥂","🍷","🥃","🍸","🍹"],
  },
  {
    label: "⚽", name: "活動",
    emojis: ["⚽","🏀","🏈","⚾","🎾","🏸","🥊","🏋️","🤸","🏊","🚴","🧘","🎯","🎮","🕹️","🎲","🎳","🎰","🧩","🎭","🎨","🎬","🎤","🎧","🎵","🎶","🎸","🎹","🎺","🥁","🎻","🏆","🥇","🎖️","🎗️","🎫"],
  },
  {
    label: "❤️", name: "符號",
    emojis: ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❤️‍🔥","💕","💞","💓","💗","💖","💘","💝","✨","🌟","⭐","💫","🔥","💥","❄️","🌈","☀️","🌙","⚡","🌊","💯","✅","❌","⚠️","🔔","💡","🔑","🎁","🎀","🎊","🎉","🪄"],
  },
];

function InputEmojiPicker({ onSelect, onClose }: { onSelect: (emoji: string) => void; onClose: () => void }) {
  const [tab, setTab] = useState(0);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const filtered = search.trim()
    ? EMOJI_CATEGORIES.flatMap((c) => c.emojis).filter((e) => e.includes(search))
    : EMOJI_CATEGORIES[tab].emojis;

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 z-50 mb-2 w-72 overflow-hidden rounded-xl border border-slate-700 bg-slate-800 shadow-2xl"
    >
      {/* Search */}
      <div className="border-b border-slate-700 p-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜尋 emoji..."
          className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm text-white placeholder-slate-400 outline-none focus:border-blue-500"
          autoFocus
        />
      </div>

      {/* Category tabs */}
      {!search && (
        <div className="flex border-b border-slate-700">
          {EMOJI_CATEGORIES.map((cat, i) => (
            <button
              key={i}
              onClick={() => setTab(i)}
              title={cat.name}
              className={`flex-1 py-1.5 text-base transition hover:bg-slate-700 ${tab === i ? "bg-slate-700" : ""}`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      )}

      {/* Emoji grid */}
      <div className="grid grid-cols-8 gap-0.5 p-2 max-h-48 overflow-y-auto">
        {filtered.map((emoji) => (
          <button
            key={emoji}
            onClick={() => onSelect(emoji)}
            className="rounded p-1 text-xl transition hover:bg-slate-700"
          >
            {emoji}
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="col-span-8 py-4 text-center text-xs text-slate-400">沒有結果</p>
        )}
      </div>
    </div>
  );
}

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
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertEmoji = (emoji: string) => {
    const el = textareaRef.current;
    if (!el) { setContent((c) => c + emoji); return; }
    const start = el.selectionStart ?? content.length;
    const end = el.selectionEnd ?? content.length;
    const next = content.slice(0, start) + emoji + content.slice(end);
    setContent(next);
    // Restore cursor after emoji
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };

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
    if (textareaRef.current) textareaRef.current.style.height = "auto";

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
    <div className="border-t border-slate-700 p-4" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom, 0px))" }}>
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
        className="relative flex items-end gap-2"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        {showEmojiPicker && (
          <InputEmojiPicker
            onSelect={(emoji) => { insertEmoji(emoji); setShowEmojiPicker(false); }}
            onClose={() => setShowEmojiPicker(false)}
          />
        )}
        <FileUpload token={token} onUploaded={onFileUploaded} />
        <button
          type="button"
          onClick={() => setShowEmojiPicker((o) => !o)}
          className="shrink-0 rounded-lg p-2 text-slate-400 transition hover:bg-slate-700 hover:text-white"
          title="Emoji"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>

        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            handleTyping();
            const el = e.target;
            el.style.height = "auto";
            el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
          }}
          onKeyDown={handleKeyDown}
          placeholder={t("message.placeholder")}
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
          style={{ maxHeight: "200px", overflowY: "auto" }}
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
