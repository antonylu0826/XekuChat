// ============================================================
// Shared Types
// ============================================================

// ---- User ----
export interface UserProfile {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
  isBot: boolean;
  isDisabled: boolean;
  isSuperAdmin: boolean;
  status: UserStatus;
}

export type UserStatus = "online" | "offline" | "away";

// ---- Organization ----
export type OrgRole = "admin" | "member" | "guest";

export interface OrgInfo {
  id: string;
  name: string;
  slug: string;
}

// ---- Channel ----
export type ChannelType = "group" | "dm" | "readonly";
export type ChannelRole = "admin" | "member";

export interface ChannelInfo {
  id: string;
  name: string;
  type: ChannelType;
  isPrivate: boolean;
}

// ---- Message ----
export type MessageType = "text" | "image" | "file" | "system";

export interface MessagePayload {
  id: string;
  content: string;
  type: MessageType;
  channelId: string;
  senderId: string;
  sender?: { id: string; name: string; avatar: string | null };
  replyToId: string | null;
  isRetracted: boolean;
  attachments: AttachmentInfo[];
  createdAt: string;
}

export interface AttachmentInfo {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  size: number;
}

// ---- WebSocket Events ----
export type WSClientEvent =
  | { type: "message:send"; channelId: string; content: string; messageType?: MessageType; replyToId?: string; fileName?: string; fileMimeType?: string; fileSize?: number }
  | { type: "message:retract"; messageId: string }
  | { type: "typing:start"; channelId: string }
  | { type: "typing:stop"; channelId: string }
  | { type: "read:update"; channelId: string; messageId: string }
  | { type: "channel:join"; channelId: string };

export type WSServerEvent =
  | { type: "message:new"; message: MessagePayload }
  | { type: "message:retracted"; messageId: string; channelId: string }
  | { type: "typing"; channelId: string; userId: string; isTyping: boolean }
  | { type: "read:updated"; channelId: string; messageId: string; readCount: number }
  | { type: "reaction:updated"; messageId: string; channelId: string; reactions: Array<{ emoji: string; count: number }> }
  | { type: "presence"; userId: string; status: UserStatus }
  | { type: "channel:joined"; channelId: string }
  | { type: "error"; code: string; message: string };

// ---- Audit ----
export type AuditAction =
  | "message_retract"
  | "message_delete"
  | "member_kick"
  | "member_invite"
  | "member_role_change"
  | "member_disable"
  | "channel_create"
  | "channel_update"
  | "channel_delete"
  | "org_settings_update"
  | "integration_create"
  | "integration_delete"
  | "ai_assistant_create"
  | "ai_assistant_update";

// ---- API Response ----
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}
