// ============================================================
// Shared Constants
// ============================================================

export const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
export const MAX_MESSAGE_LENGTH = 10000;
export const DEFAULT_PAGE_SIZE = 50;
export const WS_HEARTBEAT_INTERVAL = 30_000; // 30s
export const WS_TIMEOUT = 60_000; // 60s
export const PRESENCE_BATCH_INTERVAL = 5_000; // 5s
export const MESSAGE_RATE_LIMIT = 10; // per second per user

export const ALLOWED_FILE_TYPES = [
  // Images
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",  // iOS camera default format
  "image/heif",
  // Video
  "video/mp4",
  "video/webm",
  "video/quicktime",  // MOV
  "video/x-matroska", // MKV
  "video/x-msvideo",  // AVI
  // Documents
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
] as const;
