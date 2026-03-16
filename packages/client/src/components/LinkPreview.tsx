import { useState, useEffect } from "react";

interface OGPreview {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}

interface LinkPreviewProps {
  url: string;
  token: string;
}

const previewCache = new Map<string, OGPreview | null>();

export function LinkPreview({ url, token }: LinkPreviewProps) {
  const [preview, setPreview] = useState<OGPreview | null | undefined>(
    previewCache.get(url)
  );

  useEffect(() => {
    if (previewCache.has(url)) {
      setPreview(previewCache.get(url));
      return;
    }

    fetch(`/api/preview?url=${encodeURIComponent(url)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((body) => {
        previewCache.set(url, body.data);
        setPreview(body.data);
      })
      .catch(() => {
        previewCache.set(url, null);
        setPreview(null);
      });
  }, [url, token]);

  if (!preview) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 block overflow-hidden rounded-lg border border-slate-600 transition hover:border-slate-500"
    >
      {preview.image && (
        <img
          src={preview.image}
          alt={preview.title || ""}
          className="h-32 w-full object-cover"
          loading="lazy"
        />
      )}
      <div className="p-3">
        {preview.siteName && (
          <p className="text-xs text-slate-400">{preview.siteName}</p>
        )}
        {preview.title && (
          <p className="text-sm font-medium text-white">{preview.title}</p>
        )}
        {preview.description && (
          <p className="mt-1 line-clamp-2 text-xs text-slate-400">{preview.description}</p>
        )}
      </div>
    </a>
  );
}
