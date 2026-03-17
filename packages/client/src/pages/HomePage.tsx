import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { UserProfile } from "@xekuchat/core";
import { useChat } from "../hooks/useChat";
import { usePushNotifications } from "../hooks/usePushNotifications";
import { useInstallPrompt } from "../hooks/useInstallPrompt";
import { MessageList } from "../components/MessageList";
import { MessageInput } from "../components/MessageInput";
import { TypingIndicator } from "../components/TypingIndicator";
import { SearchBar } from "../components/SearchBar";
import { SetupWizard } from "../components/SetupWizard";

function ChannelMenu({ orgId, channelId, token }: { orgId: string; channelId: string; token: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const clearMessages = async () => {
    if (!confirm("確定要清除此頻道的所有訊息嗎？此操作無法復原。")) return;
    setOpen(false);
    await fetch(`/api/admin/${orgId}/channels/${channelId}/messages`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    window.location.reload();
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="rounded p-1 text-slate-400 transition hover:bg-slate-700 hover:text-white"
        title="頻道設定"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-lg border border-slate-700 bg-slate-800 py-1 shadow-xl">
          <button
            onClick={clearMessages}
            className="w-full px-4 py-2 text-left text-sm text-red-400 transition hover:bg-slate-700"
          >
            清除所有訊息
          </button>
        </div>
      )}
    </div>
  );
}

function UserMenuTrigger({
  user,
  isSuperAdmin,
  lang,
  pushPermission,
  pushSubscribed,
  onEditProfile,
  onToggleLang,
  onTogglePush,
  onLogout,
}: {
  user: { name: string; email: string; avatar: string | null };
  isSuperAdmin: boolean;
  lang: string;
  pushPermission: string;
  pushSubscribed: boolean;
  onEditProfile: () => void;
  onToggleLang: () => void;
  onTogglePush: () => void;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative border-t border-slate-700 p-2">
      {/* Popup menu — opens upward */}
      {open && (
        <div className="absolute bottom-full left-2 right-2 mb-1 overflow-hidden rounded-xl border border-slate-700 bg-slate-800 shadow-2xl">
          {/* User info header */}
          <div className="flex items-center gap-3 border-b border-slate-700 px-4 py-3">
            {user.avatar ? (
              <img src={user.avatar} alt="" className="h-10 w-10 rounded-full object-cover" />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 font-medium">
                {user.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{user.name}</p>
              <p className="truncate text-xs text-slate-400">{user.email}</p>
            </div>
          </div>

          {/* Actions */}
          <div className="py-1">
            <button
              onClick={() => { setOpen(false); onEditProfile(); }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-slate-200 transition hover:bg-slate-700"
            >
              <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              編輯個人資料
            </button>

            <button
              onClick={() => { setOpen(false); onToggleLang(); }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-slate-200 transition hover:bg-slate-700"
            >
              <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
              </svg>
              {lang === "zh-TW" ? "Switch to English" : "切換為中文"}
            </button>

            {pushPermission !== "unsupported" && (
              <button
                onClick={() => { setOpen(false); onTogglePush(); }}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-slate-200 transition hover:bg-slate-700"
              >
                <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {pushPermission === "denied"
                  ? "通知已被封鎖"
                  : pushSubscribed
                    ? "關閉推播通知"
                    : "開啟推播通知"}
              </button>
            )}

            {isSuperAdmin && (
              <>
                <div className="my-1 border-t border-slate-700" />
                <a
                  href="/admin"
                  onClick={() => setOpen(false)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-slate-200 transition hover:bg-slate-700"
                >
                  <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Admin 後台
                </a>
              </>
            )}

            <div className="my-1 border-t border-slate-700" />
            <button
              onClick={() => { setOpen(false); onLogout(); }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-400 transition hover:bg-slate-700"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              登出
            </button>
          </div>
        </div>
      )}

      {/* Trigger button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition ${open ? "bg-slate-700" : "hover:bg-slate-700/50"}`}
      >
        {user.avatar ? (
          <img src={user.avatar} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-medium">
            {user.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">{user.name}</p>
          <p className="truncate text-xs text-slate-400">{user.email}</p>
        </div>
        <svg
          className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>
      </button>
    </div>
  );
}

function ProfileModal({
  user,
  token,
  onClose,
  onUpdated,
}: {
  user: UserProfile;
  token: string;
  onClose: () => void;
  onUpdated: (name: string, avatar: string | null) => void;
}) {
  const [name, setName] = useState(user.name);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user.avatar);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setAvatarPreview(preview);

    const form = new FormData();
    form.append("file", file);
    setSaving(true);
    try {
      const res = await fetch("/api/users/me/avatar", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json();
      if (data?.data?.avatar) {
        setAvatarPreview(data.data.avatar);
        onUpdated(name, data.data.avatar);
      }
    } catch {
      setError("頭像上傳失敗");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) { setError("名稱不能為空"); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (data?.data) {
        onUpdated(data.data.name, data.data.avatar);
        onClose();
      } else {
        setError(data.error || "儲存失敗");
      }
    } catch {
      setError("儲存失敗");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-80 rounded-xl border border-slate-700 bg-slate-800 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-sm font-semibold text-slate-200">編輯個人資料</h3>

        {/* Avatar */}
        <div className="mb-4 flex flex-col items-center gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            className="group relative"
            title="點擊更換頭像"
          >
            {avatarPreview ? (
              <img src={avatarPreview} alt="" className="h-16 w-16 rounded-full object-cover" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-600 text-xl font-medium">
                {name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition group-hover:opacity-100">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          <p className="text-xs text-slate-400">點擊頭像更換（最大 5MB）</p>
        </div>

        {/* Name */}
        <div className="mb-4">
          <label className="mb-1 block text-xs text-slate-400">顯示名稱</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
            maxLength={50}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
        </div>

        {error && <p className="mb-3 text-xs text-red-400">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg px-3 py-2 text-sm text-slate-400 transition hover:bg-slate-700"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "儲存中..." : "儲存"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface HomePageProps {
  user: UserProfile;
  onLogout: () => void;
}

interface ChannelMember {
  userId: string;
  isMuted: boolean;
  user: { id: string; name: string; avatar: string | null; isBot?: boolean };
}

interface ChannelListItem {
  id: string;
  name: string;
  icon: string | null;
  type: string;
  isPrivate: boolean;
  _count?: { members: number; messages: number };
  members?: ChannelMember[];
}

interface OrgMember {
  id: string;
  role: string;
  user: { id: string; name: string; email: string; avatar: string | null; status: string };
}

function NewDMModal({
  orgId,
  currentUserId,
  token,
  onSelect,
  onClose,
}: {
  orgId: string;
  currentUserId: string;
  token: string;
  onSelect: (targetUserId: string) => void;
  onClose: () => void;
}) {
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/orgs/${orgId}/members`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => {
        if (data?.data) setMembers(data.data.filter((m: OrgMember) => m.user.id !== currentUserId));
      })
      .finally(() => setLoading(false));
  }, [orgId, token, currentUserId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-80 rounded-xl border border-slate-700 bg-slate-800 p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-3 text-sm font-semibold text-slate-200">選擇聊天對象</h3>
        {loading ? (
          <p className="text-sm text-slate-400">載入中...</p>
        ) : members.length === 0 ? (
          <p className="text-sm text-slate-400">沒有其他成員</p>
        ) : (
          <ul className="max-h-60 overflow-y-auto">
            {members.map((m) => (
              <li key={m.user.id}>
                <button
                  onClick={() => onSelect(m.user.id)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-slate-700"
                >
                  {m.user.avatar ? (
                    <img src={m.user.avatar} alt="" className="h-8 w-8 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-600 text-sm font-medium">
                      {m.user.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-slate-200">{m.user.name}</p>
                    <p className="text-xs text-slate-400">{m.user.email}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function HomePage({ user, onLogout }: HomePageProps) {
  const { t, i18n } = useTranslation();
  const [channels, setChannels] = useState<ChannelListItem[]>([]);
  const [activeChannel, setActiveChannel] = useState<string | null>(null);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [showNewDM, setShowNewDM] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [localUser, setLocalUser] = useState(user);
  const [unreadCounts, setUnreadCounts] = useState<Map<string, number>>(new Map());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(256);
  const isResizing = useRef(false);
  const activeChannelRef = useRef<string | null>(null);

  const startResize = (e: React.MouseEvent) => {
    isResizing.current = true;
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    document.body.style.userSelect = "none";

    const onMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const newWidth = Math.min(480, Math.max(180, startWidth + e.clientX - startX));
      setSidebarWidth(newWidth);
    };
    const onUp = () => {
      isResizing.current = false;
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const token = sessionStorage.getItem("access_token");

  const { permission: pushPermission, subscribed: pushSubscribed, subscribe: pushSubscribe, unsubscribe: pushUnsubscribe } =
    usePushNotifications(token);
  const { canInstall, install } = useInstallPrompt();

  const togglePush = () => {
    if (pushSubscribed) pushUnsubscribe();
    else pushSubscribe();
  };

  const toggleMute = useCallback(async (channelId: string, currentlyMuted: boolean) => {
    if (!token) return;
    await fetch(`/api/push/mute/${channelId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ muted: !currentlyMuted }),
    });
    // Update local channel member isMuted
    setChannels((prev) =>
      prev.map((ch) =>
        ch.id !== channelId ? ch : {
          ...ch,
          members: ch.members?.map((m) =>
            m.userId === user.id ? { ...m, isMuted: !currentlyMuted } : m
          ),
        }
      )
    );
  }, [token, user.id]);

  const {
    messages,
    typingUsers,
    readCounts,
    reactions,
    wsStatus,
    sendMessage,
    retractMessage,
    sendTyping,
    markAsRead,
    sendReaction,
  } = useChat(token, activeChannel);

  const toggleLang = () => {
    i18n.changeLanguage(i18n.language === "zh-TW" ? "en" : "zh-TW");
  };

  // Load orgs and channels
  useEffect(() => {
    if (!token) return;

    fetch("/api/orgs", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then(async (data) => {
        if (!data.data || data.data.length === 0) {
          setNeedsSetup(true);
          return;
        }
        const orgId = data.data[0].id;
        setActiveOrgId(orgId);
        const chRes = await fetch(`/api/channels/org/${orgId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const chData = await chRes.json();
        if (chData?.data) {
          setChannels(chData.data);
          if (chData.data.length > 0) setActiveChannel(chData.data[0].id);
        }
      })
      .catch(console.error);
  }, [token]);

  const loadChannels = useCallback(
    async (orgId: string, autoSelect = false) => {
      if (!token) return;
      const res = await fetch(`/api/channels/org/${orgId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data?.data) {
        setChannels(data.data);
        // Initialize unread counts from API response, but skip the currently active channel
        const initial = new Map<string, number>(
          data.data
            .filter((ch: ChannelListItem & { unreadCount?: number }) =>
              (ch.unreadCount ?? 0) > 0 && ch.id !== activeChannelRef.current
            )
            .map((ch: ChannelListItem & { unreadCount?: number }) => [ch.id, ch.unreadCount!])
        );
        setUnreadCounts(initial);
        if (autoSelect && data.data.length > 0) {
          setActiveChannel(data.data[0].id);
        }
      }
    },
    [token]
  );

  const handleSetupComplete = useCallback(
    (orgId: string) => {
      setNeedsSetup(false);
      setActiveOrgId(orgId);
      loadChannels(orgId, true);
    },
    [loadChannels]
  );

  const handleFileUploaded = useCallback(
    (file: { url: string; name: string; mimeType: string; size: number }) => {
      if (!activeChannel || !token) return;
      const isImage = file.mimeType.startsWith("image/");
      sendMessage(
        file.url,
        replyToId || undefined,
        isImage ? "image" : "file",
        { name: file.name, mimeType: file.mimeType, size: file.size }
      );
      setReplyToId(null);
    },
    [activeChannel, token, sendMessage, replyToId]
  );

  const handleSearchSelect = useCallback((channelId: string, _messageId: string) => {
    setActiveChannel(channelId);
    setSidebarOpen(false);
  }, []);

  const handleReply = useCallback((messageId: string) => {
    setReplyToId(messageId);
  }, []);

  const handleCancelReply = useCallback(() => {
    setReplyToId(null);
  }, []);

  const handleChannelSelect = (channelId: string) => {
    setActiveChannel(channelId);
    setSidebarOpen(false); // close sidebar on mobile after selecting
  };

  const leaveDM = useCallback(async (channelId: string) => {
    if (!token || !activeOrgId) return;
    await fetch(`/api/channels/${channelId}/leave`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (activeChannel === channelId) setActiveChannel(null);
    await loadChannels(activeOrgId);
  }, [token, activeOrgId, activeChannel, loadChannels]);

  const startDM = useCallback(async (targetUserId: string) => {
    if (!activeOrgId || !token) return;
    setShowNewDM(false);
    const res = await fetch("/api/channels/dm", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ orgId: activeOrgId, targetUserId }),
    });
    const data = await res.json();
    if (data?.data?.id) {
      await loadChannels(activeOrgId);
      setActiveChannel(data.data.id);
      setSidebarOpen(false);
    }
  }, [activeOrgId, token, loadChannels]);

  useEffect(() => {
    setReplyToId(null);
  }, [activeChannel]);

  // Reload channels when server notifies us of a new channel (e.g. someone opened a DM with us)
  useEffect(() => {
    if (!activeOrgId) return;
    const handler = () => loadChannels(activeOrgId);
    window.addEventListener("xeku:channel-joined", handler);
    return () => window.removeEventListener("xeku:channel-joined", handler);
  }, [activeOrgId, loadChannels]);

  // Update channel name/icon in sidebar when admin renames/re-icons a channel
  useEffect(() => {
    const handler = (e: Event) => {
      const { channelId, name, icon } = (e as CustomEvent<{ channelId: string; name: string; icon: string | null }>).detail;
      setChannels((prev) => prev.map((ch) => ch.id === channelId ? { ...ch, name, icon } : ch));
    };
    window.addEventListener("xeku:channel-updated", handler);
    return () => window.removeEventListener("xeku:channel-updated", handler);
  }, []);

  // Navigate to channel from push notification click
  useEffect(() => {
    const handler = (e: Event) => {
      const { channelId } = (e as CustomEvent<{ channelId: string }>).detail;
      if (channelId) setActiveChannel(channelId);
    };
    window.addEventListener("xeku:navigate-channel", handler);
    return () => window.removeEventListener("xeku:navigate-channel", handler);
  }, []);

  // Increment unread count when a message arrives in a non-active channel
  useEffect(() => {
    const handler = (e: Event) => {
      const { channelId, senderId } = (e as CustomEvent<{ channelId: string; senderId: string }>).detail;
      if (channelId === activeChannel) return; // already viewing it
      if (senderId === user.id) return; // own message
      setUnreadCounts((prev) => {
        const next = new Map(prev);
        next.set(channelId, (next.get(channelId) ?? 0) + 1);
        return next;
      });
    };
    window.addEventListener("xeku:message-new", handler);
    return () => window.removeEventListener("xeku:message-new", handler);
  }, [activeChannel, user.id]);

  // Clear unread when switching to a channel
  useEffect(() => {
    if (activeChannel) {
      setUnreadCounts((prev) => {
        if (!prev.has(activeChannel)) return prev;
        const next = new Map(prev);
        next.delete(activeChannel);
        return next;
      });
    }
  }, [activeChannel]);

  activeChannelRef.current = activeChannel;
  const activeChannelInfo = channels.find((ch) => ch.id === activeChannel);

  // Sidebar content extracted to avoid duplication
  const sidebarContent = (
    <>
      <div className="flex items-center justify-between border-b border-slate-700 p-4">
        <h1 className="text-lg font-bold">{t("app.name")}</h1>
        <div className="flex items-center gap-2">
          {canInstall && (
            <button
              onClick={install}
              title="安裝應用程式"
              className="rounded p-1 text-slate-400 transition hover:bg-slate-700 hover:text-white"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>
          )}
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              wsStatus === "connected"
                ? "bg-green-400"
                : wsStatus === "connecting"
                  ? "bg-yellow-400"
                  : "bg-red-400"
            }`}
          />
          {/* Close button — mobile only */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="rounded p-1 text-slate-400 hover:text-white md:hidden"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {activeOrgId && token && (
        <div className="border-b border-slate-700 p-3">
          <SearchBar token={token} orgId={activeOrgId} onSelectMessage={handleSearchSelect} />
        </div>
      )}

      <nav className="flex-1 overflow-y-auto p-3">
        <div className="mb-4">
          <h2 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            {t("nav.channels")}
          </h2>
          {channels.filter((ch) => ch.type === "group" || ch.type === "readonly").length === 0 ? (
            <p className="px-2 text-sm text-slate-500">{t("message.noMessages")}</p>
          ) : (
            channels
              .filter((ch) => ch.type === "group" || ch.type === "readonly")
              .map((ch) => {
                const unread = unreadCounts.get(ch.id) ?? 0;
                const myMember = ch.members?.find((m) => m.userId === user.id);
                const isMuted = myMember?.isMuted ?? false;
                return (
                  <div key={ch.id} className="group/ch relative mb-1">
                    <button
                      onClick={() => handleChannelSelect(ch.id)}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 pr-8 text-left text-sm transition ${
                        activeChannel === ch.id ? "bg-slate-700 text-white" : "text-slate-300 hover:bg-slate-700/50"
                      }`}
                    >
                      <span className="truncate">
                        {ch.icon ? `${ch.icon} ` : ch.type === "readonly" ? "📢 " : ""}
                        {isMuted ? "🔕 " : ""}
                        {ch.name}
                      </span>
                      {unread > 0 && (
                        <span className="ml-1 shrink-0 rounded-full bg-red-500 px-1.5 py-0.5 text-xs font-bold text-white">
                          {unread > 99 ? "99+" : unread}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleMute(ch.id, isMuted); }}
                      className="absolute right-1 top-1/2 -translate-y-1/2 hidden rounded p-1 text-slate-500 transition hover:bg-slate-600 hover:text-white group-hover/ch:block"
                      title={isMuted ? "取消靜音" : "靜音頻道"}
                    >
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        {isMuted
                          ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                          : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                        }
                      </svg>
                    </button>
                  </div>
                );
              })
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between px-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t("nav.directMessages")}
            </h2>
            {activeOrgId && (
              <button
                onClick={() => setShowNewDM(true)}
                className="rounded p-0.5 text-slate-400 transition hover:bg-slate-700 hover:text-white"
                title="新增私訊"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            )}
          </div>
          {channels.filter((ch) => ch.type === "dm").length === 0 ? (
            <p className="px-2 text-sm text-slate-500">尚無私訊</p>
          ) : (
            channels
              .filter((ch) => ch.type === "dm")
              .map((ch) => {
                const partner = ch.members?.find((m) => m.userId !== user.id);
                const displayName = partner?.user.name ?? ch.name;
                const avatar = partner?.user.avatar;
                const unread = unreadCounts.get(ch.id) ?? 0;
                const myMember = ch.members?.find((m) => m.userId === user.id);
                const isMuted = myMember?.isMuted ?? false;
                return (
                  <div key={ch.id} className="group/dm relative mb-1">
                    <button
                      onClick={() => handleChannelSelect(ch.id)}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 pr-16 text-left text-sm transition ${
                        activeChannel === ch.id ? "bg-slate-700 text-white" : "text-slate-300 hover:bg-slate-700/50"
                      }`}
                    >
                      {avatar && /^https?:\/\//.test(avatar) ? (
                        <img src={avatar} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
                      ) : (
                        <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${partner?.user.isBot ? "bg-purple-900 text-base" : "bg-slate-600 text-xs font-medium"}`}>
                          {avatar || displayName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="flex-1 truncate">
                        {isMuted ? "🔕 " : ""}{displayName}
                        {partner?.user.isBot && (
                          <span className="ml-1 rounded bg-purple-900/60 px-1 py-0.5 text-[9px] font-semibold uppercase text-purple-300">AI</span>
                        )}
                      </span>
                      {unread > 0 && (
                        <span className="shrink-0 rounded-full bg-red-500 px-1.5 py-0.5 text-xs font-bold text-white">
                          {unread > 99 ? "99+" : unread}
                        </span>
                      )}
                    </button>
                    {/* Mute + leave buttons — shown on hover */}
                    <div className="absolute right-1 top-1/2 -translate-y-1/2 hidden items-center gap-0.5 group-hover/dm:flex">
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleMute(ch.id, isMuted); }}
                        className="rounded p-1 text-slate-500 transition hover:bg-slate-600 hover:text-white"
                        title={isMuted ? "取消靜音" : "靜音"}
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          {isMuted
                            ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                            : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                          }
                        </svg>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); leaveDM(ch.id); }}
                        className="rounded p-1 text-slate-500 transition hover:bg-slate-600 hover:text-white"
                        title="離開對話"
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })
          )}
        </div>
      </nav>

      <UserMenuTrigger
        user={localUser}
        isSuperAdmin={user.isSuperAdmin}
        lang={i18n.language}
        pushPermission={pushPermission}
        pushSubscribed={pushSubscribed}
        onEditProfile={() => setShowProfile(true)}
        onToggleLang={toggleLang}
        onTogglePush={togglePush}
        onLogout={onLogout}
      />
    </>
  );

  return (
    <div className="flex h-full bg-slate-900 text-white">

      {/* Sidebar — desktop: always visible / mobile: drawer */}
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar panel */}
      <aside
        style={{ width: sidebarWidth }}
        className={`fixed inset-y-0 left-0 z-30 flex flex-shrink-0 flex-col border-r border-slate-700 bg-slate-800 transition-transform duration-200
          md:static md:translate-x-0
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        {sidebarContent}

        {/* Resize handle — desktop only */}
        <div
          onMouseDown={startResize}
          className="absolute inset-y-0 right-0 hidden w-1 cursor-col-resize hover:bg-blue-500/50 active:bg-blue-500 md:block"
        />
      </aside>

      {/* Main chat area */}
      <main className="flex min-w-0 flex-1 flex-col">
        {needsSetup ? (
          user.isSuperAdmin ? (
            <SetupWizard token={token || ""} onComplete={handleSetupComplete} />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
              <div className="text-4xl">⏳</div>
              <p className="text-lg font-medium">{t("app.name")}</p>
              <p className="text-sm text-slate-400">系統尚未設定，請聯絡管理員。</p>
              <button onClick={onLogout} className="mt-2 rounded px-4 py-2 text-sm text-slate-400 hover:bg-slate-800 transition">
                {t("auth.logout")}
              </button>
            </div>
          )
        ) : activeChannel ? (
          <>
            {/* Channel header */}
            <header className="flex items-center gap-3 border-b border-slate-700 px-4 py-3">
              {/* Hamburger — mobile only */}
              <button
                onClick={() => setSidebarOpen(true)}
                className="rounded p-1 text-slate-400 hover:text-white md:hidden"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              {activeChannelInfo?.type === "dm" && (() => {
                const partner = activeChannelInfo.members?.find((m) => m.userId !== user.id)?.user;
                return (
                  <>
                    {partner?.avatar && /^https?:\/\//.test(partner.avatar) ? (
                      <img src={partner.avatar} alt="" className="h-8 w-8 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${partner?.isBot ? "bg-purple-900 text-xl" : "bg-blue-600 text-sm font-medium"}`}>
                        {partner?.avatar || (partner?.name ?? "?").charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 truncate">
                      <h2 className="flex items-center gap-1.5 text-base font-semibold md:text-lg">
                        {partner?.name ?? activeChannelInfo.name}
                        {partner?.isBot && (
                          <span className="rounded bg-purple-900/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-purple-300">
                            AI
                          </span>
                        )}
                      </h2>
                    </div>
                  </>
                );
              })()}
              {activeChannelInfo?.type !== "dm" && (
                <h2 className="flex-1 truncate text-base font-semibold md:text-lg">
                  {activeChannelInfo?.icon
                    ? `${activeChannelInfo.icon} ${activeChannelInfo.name}`
                    : activeChannelInfo?.type === "readonly"
                      ? `📢 ${activeChannelInfo?.name || ""}`
                      : activeChannelInfo?.name || ""}
                </h2>
              )}
              {user.isSuperAdmin && activeOrgId && (
                <ChannelMenu orgId={activeOrgId} channelId={activeChannel!} token={token || ""} />
              )}
            </header>

            <MessageList
              messages={messages}
              currentUserId={user.id}
              isAdmin={user.isSuperAdmin}
              token={token || ""}
              readCounts={readCounts}
              reactions={reactions}
              onRetract={retractMessage}
              onReply={handleReply}
              onReaction={sendReaction}
              onMessageVisible={markAsRead}
            />

            <TypingIndicator typingUsers={typingUsers} currentUserId={user.id} />

            {activeChannelInfo?.type === "readonly" && !user.isSuperAdmin ? (
              <div className="border-t border-slate-700 px-4 py-3 text-center text-sm text-slate-500">
                此為公告頻道，僅管理員可以發送訊息
              </div>
            ) : (
              <MessageInput
                token={token || ""}
                channelId={activeChannel || undefined}
                isDM={activeChannelInfo?.type === "dm"}
                onSend={sendMessage}
                onTyping={sendTyping}
                onFileUploaded={handleFileUploaded}
                replyToId={replyToId}
                onCancelReply={handleCancelReply}
                disabled={wsStatus !== "connected"}
              />
            )}
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            {/* Hamburger shown when no channel selected on mobile */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-400 transition hover:bg-slate-800 md:hidden"
            >
              開啟頻道列表
            </button>
            <div className="text-center text-slate-500">
              <p className="text-lg">{t("app.name")}</p>
              <p className="mt-1 text-sm">{t("app.tagline")}</p>
            </div>
          </div>
        )}
      </main>

      {showProfile && token && (
        <ProfileModal
          user={localUser}
          token={token}
          onClose={() => setShowProfile(false)}
          onUpdated={(name, avatar) => setLocalUser((u: typeof localUser) => ({ ...u, name, avatar }))}
        />
      )}

      {showNewDM && activeOrgId && token && (
        <NewDMModal
          orgId={activeOrgId}
          currentUserId={user.id}
          token={token}
          onSelect={startDM}
          onClose={() => setShowNewDM(false)}
        />
      )}
    </div>
  );
}
