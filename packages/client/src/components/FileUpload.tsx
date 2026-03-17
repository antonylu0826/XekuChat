import { useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { MAX_FILE_SIZE, ALLOWED_FILE_TYPES } from "@xekuchat/core";

interface FileUploadProps {
  token: string;
  onUploaded: (file: { url: string; name: string; mimeType: string; size: number }) => void;
}

export function FileUpload({ token, onUploaded }: FileUploadProps) {
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(
    async (file: File) => {
      if (file.size > MAX_FILE_SIZE) {
        alert(`File exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`);
        return;
      }

      setUploading(true);
      setProgress(0);

      try {
        if (file.size > 10 * 1024 * 1024) {
          // Large file: use tus resumable upload
          await tusUpload(file, token, setProgress, onUploaded);
        } else {
          // Small file: simple upload
          const formData = new FormData();
          formData.append("file", file);

          const res = await fetch("/api/upload", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          });

          const body = await res.json();
          if (body.success) {
            onUploaded(body.data);
          } else {
            alert(body.error || "Upload failed");
          }
        }
      } catch (err) {
        console.error("Upload failed:", err);
        alert("上傳失敗，請檢查網路連線");
      } finally {
        setUploading(false);
        setProgress(0);
      }
    },
    [token, onUploaded]
  );

  // Handle file input change
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = "";
  };

  // Handle drag and drop
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) uploadFile(file);
    },
    [uploadFile]
  );

  // Handle clipboard paste
  const handlePaste = useCallback(
    async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (!file) continue;

          const buffer = await file.arrayBuffer();
          const base64 = btoa(
            new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
          );

          const res = await fetch("/api/upload/paste", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ data: base64, mimeType: item.type }),
          });

          const body = await res.json();
          if (body.success) {
            onUploaded(body.data);
          }
        }
      }
    },
    [token, onUploaded]
  );

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept={ALLOWED_FILE_TYPES.join(",")}
        onChange={handleFileChange}
      />

      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-700 hover:text-white disabled:opacity-50"
        title="Upload file"
      >
        {uploading ? (
          progress > 0 ? (
            <span className="text-xs font-medium">{Math.round(progress)}%</span>
          ) : (
            <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          )
        ) : (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
        )}
      </button>
    </>
  );
}

// tus resumable upload implementation
async function tusUpload(
  file: File,
  token: string,
  onProgress: (pct: number) => void,
  onComplete: (data: { url: string; name: string; mimeType: string; size: number }) => void
) {
  // Create upload
  const createRes = await fetch("/api/tus", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Upload-Length": String(file.size),
      "Upload-Metadata": `filename ${btoa(file.name)},filetype ${btoa(file.type)}`,
      "Tus-Resumable": "1.0.0",
    },
  });

  const location = createRes.headers.get("Location");
  if (!location) throw new Error("No upload location");

  // Upload in 1MB chunks
  const chunkSize = 1024 * 1024;
  let offset = 0;

  while (offset < file.size) {
    const chunk = file.slice(offset, offset + chunkSize);
    const buffer = await chunk.arrayBuffer();

    const patchRes = await fetch(location, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Upload-Offset": String(offset),
        "Content-Type": "application/offset+octet-stream",
        "Tus-Resumable": "1.0.0",
      },
      body: buffer,
    });

    offset += buffer.byteLength;
    onProgress((offset / file.size) * 100);

    // Check if upload is complete (server returns JSON)
    if (patchRes.headers.get("content-type")?.includes("application/json")) {
      const body = await patchRes.json();
      if (body.success) {
        onComplete(body.data);
        return;
      }
    }
  }
}
