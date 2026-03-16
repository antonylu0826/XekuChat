import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { UserProfile } from "@xekuchat/core";
import { useChat } from "../hooks/useChat";
import { MessageList } from "../components/MessageList";
import { MessageInput } from "../components/MessageInput";
import { TypingIndicator } from "../components/TypingIndicator";
import { SearchBar } from "../components/SearchBar";
import { SetupWizard } from "../components/SetupWizard";

interface HomePageProps {
  user: UserProfile;
  onLogout: () => void;
}

interface ChannelListItem {
  id: string;
  name: string;
  type: string;
  isPrivate: boolean;
  _count?: { members: number; messages: number };
}

export function HomePage({ user, onLogout }: HomePageProps) {
  const { t, i18n } = useTranslation();
  const [channels, setChannels] = useState<ChannelListItem[]>([]);
  const [activeChannel, setActiveChannel] = useState<string | null>(null);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(256);
  const isResizing = useRef(false);

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

  useEffect(() => {
    setReplyToId(null);
  }, [activeChannel]);

  const activeChannelInfo = channels.find((ch) => ch.id === activeChannel);

  // Sidebar content extracted to avoid duplication
  const sidebarContent = (
    <>
      <div className="flex items-center justify-between border-b border-slate-700 p-4">
        <h1 className="text-lg font-bold">{t("app.name")}</h1>
        <div className="flex items-center gap-2">
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
          {channels.filter((ch) => ch.type === "group").length === 0 ? (
            <p className="px-2 text-sm text-slate-500">{t("message.noMessages")}</p>
          ) : (
            channels
              .filter((ch) => ch.type === "group")
              .map((ch) => (
                <button
                  key={ch.id}
                  onClick={() => handleChannelSelect(ch.id)}
                  className={`mb-1 w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                    activeChannel === ch.id ? "bg-slate-700 text-white" : "text-slate-300 hover:bg-slate-700/50"
                  }`}
                >
                  # {ch.name}
                </button>
              ))
          )}
        </div>

        <div>
          <h2 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            {t("nav.directMessages")}
          </h2>
          {channels.filter((ch) => ch.type === "dm").length === 0 ? (
            <p className="px-2 text-sm text-slate-500">{t("message.noMessages")}</p>
          ) : (
            channels
              .filter((ch) => ch.type === "dm")
              .map((ch) => (
                <button
                  key={ch.id}
                  onClick={() => handleChannelSelect(ch.id)}
                  className={`mb-1 w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                    activeChannel === ch.id ? "bg-slate-700 text-white" : "text-slate-300 hover:bg-slate-700/50"
                  }`}
                >
                  {ch.name}
                </button>
              ))
          )}
        </div>
      </nav>

      <div className="border-t border-slate-700 p-3">
        <div className="flex items-center gap-3">
          {user.avatar ? (
            <img src={user.avatar} alt="" className="h-8 w-8 rounded-full" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-sm font-medium">
              {user.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 truncate">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-slate-400">{user.email}</p>
          </div>
        </div>
        <div className="mt-2 flex gap-2">
          <button
            onClick={toggleLang}
            className="flex-1 rounded px-2 py-1 text-xs text-slate-400 transition hover:bg-slate-700"
          >
            {i18n.language === "zh-TW" ? "EN" : "中文"}
          </button>
          <button
            onClick={onLogout}
            className="flex-1 rounded px-2 py-1 text-xs text-slate-400 transition hover:bg-slate-700"
          >
            {t("auth.logout")}
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-slate-900 text-white">

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
          <SetupWizard token={token || ""} onComplete={handleSetupComplete} />
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
              <h2 className="truncate text-base font-semibold md:text-lg">
                {activeChannelInfo?.type === "dm"
                  ? activeChannelInfo?.name
                  : `# ${activeChannelInfo?.name || ""}`}
              </h2>
            </header>

            <MessageList
              messages={messages}
              currentUserId={user.id}
              token={token || ""}
              readCounts={readCounts}
              reactions={reactions}
              onRetract={retractMessage}
              onReply={handleReply}
              onReaction={sendReaction}
              onMessageVisible={markAsRead}
            />

            <TypingIndicator typingUsers={typingUsers} currentUserId={user.id} />

            <MessageInput
              token={token || ""}
              onSend={sendMessage}
              onTyping={sendTyping}
              onFileUploaded={handleFileUploaded}
              replyToId={replyToId}
              onCancelReply={handleCancelReply}
              disabled={wsStatus !== "connected"}
            />
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
    </div>
  );
}
