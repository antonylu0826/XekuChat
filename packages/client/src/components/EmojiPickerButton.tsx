import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import Picker from "@emoji-mart/react";
import data from "@emoji-mart/data";

interface EmojiPickerButtonProps {
  value: string;
  onChange: (emoji: string) => void;
  placeholder?: string;
}

export function EmojiPickerButton({ value, onChange, placeholder = "😀" }: EmojiPickerButtonProps) {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const locale = i18n.language === "zh-TW" ? "zh" : "en";

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-9 items-center justify-center rounded border border-slate-600 bg-slate-700 text-lg hover:bg-slate-600"
        title="Pick emoji"
      >
        {value || <span className="text-slate-400 text-sm">{placeholder}</span>}
      </button>

      {open && (
        <div className="absolute left-0 top-10 z-50">
          <Picker
            data={data}
            onEmojiSelect={(e: { native: string }) => {
              onChange(e.native);
              setOpen(false);
            }}
            theme="dark"
            locale={locale}
            previewPosition="none"
            skinTonePosition="none"
          />
        </div>
      )}
    </div>
  );
}
