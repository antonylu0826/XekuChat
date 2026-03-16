import { useState } from "react";

const EMOJI_LIST = ["👍", "❤️", "😂", "😮", "😢", "🎉", "🔥", "👏"];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
}

export function EmojiPicker({ onSelect }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="rounded p-1 text-slate-500 transition hover:bg-slate-700 hover:text-white"
        title="Add reaction"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>

      {open && (
        <div className="absolute bottom-8 left-0 z-10 flex gap-1 rounded-lg border border-slate-600 bg-slate-800 p-2 shadow-xl">
          {EMOJI_LIST.map((emoji) => (
            <button
              key={emoji}
              onClick={() => {
                onSelect(emoji);
                setOpen(false);
              }}
              className="rounded p-1 text-lg transition hover:bg-slate-700"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Display reactions on a message
interface ReactionDisplayProps {
  reactions: Array<{ emoji: string; count: number }>;
  onToggle: (emoji: string) => void;
}

export function ReactionDisplay({ reactions, onToggle }: ReactionDisplayProps) {
  if (!reactions || reactions.length === 0) return null;

  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {reactions.map((r) => (
        <button
          key={r.emoji}
          onClick={() => onToggle(r.emoji)}
          className="inline-flex items-center gap-1 rounded-full border border-slate-600 px-2 py-0.5 text-xs transition hover:border-blue-500"
        >
          <span>{r.emoji}</span>
          <span className="text-slate-400">{r.count}</span>
        </button>
      ))}
    </div>
  );
}
