import { useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";

interface SearchResult {
  id: string;
  content: string;
  channelId: string;
  channelName: string;
  senderId: string;
  senderName: string;
  createdAt: string;
}

interface SearchBarProps {
  token: string;
  orgId: string;
  onSelectMessage: (channelId: string, messageId: string) => void;
}

export function SearchBar({ token, orgId, onSelectMessage }: SearchBarProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(
    async (q: string) => {
      if (q.length < 2) {
        setResults([]);
        return;
      }

      setSearching(true);
      try {
        const res = await fetch(
          `/api/search/messages?q=${encodeURIComponent(q)}&orgId=${orgId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const body = await res.json();
        setResults(body.data || []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    },
    [token, orgId]
  );

  const handleInput = (value: string) => {
    setQuery(value);
    setOpen(true);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 300);
  };

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => handleInput(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder={t("message.search")}
        className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
      />

      {open && (results.length > 0 || searching) && (
        <div className="absolute top-full z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border border-slate-600 bg-slate-800 shadow-xl">
          {searching ? (
            <div className="p-3 text-center text-sm text-slate-400">
              {t("common.loading")}
            </div>
          ) : (
            results.map((r) => (
              <button
                key={r.id}
                onMouseDown={() => {
                  onSelectMessage(r.channelId, r.id);
                  setOpen(false);
                  setQuery("");
                }}
                className="block w-full border-b border-slate-700 px-3 py-2 text-left transition last:border-b-0 hover:bg-slate-700"
              >
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span>#{r.channelName}</span>
                  <span>{r.senderName}</span>
                  <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                </div>
                <p className="mt-0.5 truncate text-sm text-white">{r.content}</p>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
