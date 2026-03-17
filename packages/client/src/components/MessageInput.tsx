import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { FileUpload } from "./FileUpload";
import { MENTION_PATTERN } from "@xekuchat/core";

interface ChannelAssistant {
  id: string;
  name: string;
  avatar: string | null;
}

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
  channelId?: string;
  isDM?: boolean;
  onSend: (content: string, replyToId?: string) => void;
  onTyping: (isTyping: boolean) => void;
  onFileUploaded: (file: { url: string; name: string; mimeType: string; size: number }) => void;
  replyToId?: string | null;
  onCancelReply?: () => void;
  disabled?: boolean;
}

const MENTION_REGEX = new RegExp(MENTION_PATTERN, "u");

export function MessageInput({
  token,
  channelId,
  isDM,
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

  // @mention autocomplete
  const [assistants, setAssistants] = useState<ChannelAssistant[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState(0);
  const [mentionIndex, setMentionIndex] = useState(0);

  // Fetch channel assistants (only for non-DM channels); abort on channel change
  useEffect(() => {
    if (!channelId || isDM) { setAssistants([]); return; }
    const controller = new AbortController();
    fetch(`/api/channels/${channelId}/assistants`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((d) => { if (d.success) setAssistants(d.data); })
      .catch((err) => { if (err.name !== "AbortError") console.error(err); });
    return () => controller.abort();
  }, [channelId, isDM, token]);

  const mentionMatches = mentionQuery !== null
    ? assistants.filter((a) => a.name.toLowerCase().startsWith(mentionQuery.toLowerCase()))
    : [];

  const closeMention = useCallback(() => {
    setMentionQuery(null);
    setMentionIndex(0);
  }, []);

  const insertMention = (name: string) => {
    const after = content.slice(mentionStart + 1 + (mentionQuery?.length ?? 0));
    const next = content.slice(0, mentionStart) + "@" + name + " " + after;
    setContent(next);
    closeMention();
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      const pos = mentionStart + name.length + 2;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

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

  const detectMention = (text: string, cursor: number) => {
    if (assistants.length === 0) { closeMention(); return; }
    const before = text.slice(0, cursor);
    const atIdx = before.lastIndexOf("@");
    if (atIdx === -1) { closeMention(); return; }
    const afterAt = before.slice(atIdx + 1);
    if (/\s/.test(afterAt)) { closeMention(); return; }
    // Check the partial text is a valid mention start
    if (afterAt.length > 0 && !MENTION_REGEX.test("@" + afterAt)) { closeMention(); return; }
    setShowEmojiPicker(false); // Close emoji picker if mention dropdown opens
    setMentionStart(atIdx);
    setMentionQuery(afterAt);
    setMentionIndex(0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Handle mention navigation
    if (mentionQuery !== null && mentionMatches.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % mentionMatches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((i) => (i - 1 + mentionMatches.length) % mentionMatches.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(mentionMatches[mentionIndex].name);
        return;
      }
      if (e.key === "Escape") {
        closeMention();
        return;
      }
    }

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

        {/* @mention autocomplete dropdown */}
        {mentionQuery !== null && mentionMatches.length > 0 && (
          <div className="absolute bottom-full left-0 z-50 mb-1 w-max min-w-[10rem] max-w-xs overflow-hidden rounded-xl border border-slate-700 bg-slate-800 shadow-2xl">
            {mentionMatches.map((a, i) => (
              <button
                key={a.id}
                onMouseDown={(e) => { e.preventDefault(); insertMention(a.name); }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition ${i === mentionIndex ? "bg-slate-700 text-white" : "text-slate-300 hover:bg-slate-700"}`}
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-purple-900 text-base">
                  {a.avatar && /^https?:\/\//.test(a.avatar)
                    ? <img src={a.avatar} alt="" className="h-7 w-7 object-cover" />
                    : <span>{a.avatar || "🤖"}</span>}
                </div>
                <span className="font-medium">@{a.name}</span>
              </button>
            ))}
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            handleTyping();
            detectMention(e.target.value, e.target.selectionStart ?? e.target.value.length);
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
