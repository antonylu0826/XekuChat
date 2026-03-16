interface TypingIndicatorProps {
  typingUsers: Map<string, boolean>;
  currentUserId: string;
}

export function TypingIndicator({ typingUsers, currentUserId }: TypingIndicatorProps) {
  const others = Array.from(typingUsers.keys()).filter((id) => id !== currentUserId);

  if (others.length === 0) return null;

  return (
    <div className="px-4 py-1 text-xs text-slate-400">
      <span className="animate-pulse">
        {others.length === 1
          ? "Someone is typing..."
          : `${others.length} people are typing...`}
      </span>
    </div>
  );
}
