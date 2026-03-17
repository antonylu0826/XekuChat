import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { UserProfile } from "@xekuchat/core";
import { EmojiPickerButton } from "../components/EmojiPickerButton";

interface AdminPageProps {
  user: UserProfile;
  token: string;
  onLogout: () => void;
}

type AdminTab = "users" | "channels" | "settings" | "audit-logs" | "integrations" | "local-users" | "ai-assistants";

// ============================================================
// UsersTab
// ============================================================

interface OrgMemberRow {
  id: string;
  role: string;
  user: {
    id: string;
    name: string;
    email: string;
    avatar: string | null;
    status: string;
    isDisabled: boolean;
    createdAt: string;
  };
}

function UsersTab({ orgId, token, currentUser }: { orgId: string; token: string; currentUser: UserProfile }) {
  const { t } = useTranslation();
  const [members, setMembers] = useState<OrgMemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMembers = async () => {
    try {
      const res = await fetch(`/api/admin/${orgId}/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setMembers(data.data);
    } catch {
      setError(t("admin.users.errors.load"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, [orgId]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setError(null);
    try {
      const res = await fetch(`/api/orgs/${orgId}/members`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t("admin.users.errors.invite"));
      } else {
        setInviteEmail("");
        await fetchMembers();
      }
    } catch {
      setError(t("admin.users.errors.invite"));
    } finally {
      setInviting(false);
    }
  };

  const handleToggleDisabled = async (member: OrgMemberRow) => {
    try {
      await fetch(`/api/admin/${orgId}/users/${member.user.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ isDisabled: !member.user.isDisabled }),
      });
      await fetchMembers();
    } catch {
      setError(t("admin.users.errors.update"));
    }
  };

  const handleRemove = async (member: OrgMemberRow) => {
    if (!confirm(t("admin.users.removeConfirm", { name: member.user.name }))) return;
    try {
      await fetch(`/api/admin/${orgId}/users/${member.user.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchMembers();
    } catch {
      setError(t("admin.users.errors.remove"));
    }
  };

  if (loading) return <div className="text-slate-400">Loading...</div>;

  return (
    <div>
      <h2 className="mb-4 text-xl font-bold">{t("admin.tabs.users")}</h2>

      {error && (
        <div className="mb-4 rounded bg-red-900/50 px-4 py-2 text-sm text-red-300">{error}</div>
      )}

      {/* Invite form */}
      <form onSubmit={handleInvite} className="mb-6 flex gap-2">
        <input
          type="email"
          placeholder={t("admin.users.emailPlaceholder")}
          value={inviteEmail}
          onChange={(e) => setInviteEmail(e.target.value)}
          className="flex-1 rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white placeholder-slate-400"
          required
        />
        <select
          value={inviteRole}
          onChange={(e) => setInviteRole(e.target.value)}
          className="rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white"
        >
          <option value="member">{t("admin.users.roles.member")}</option>
          <option value="admin">{t("admin.users.roles.admin")}</option>
          <option value="guest">{t("admin.users.roles.guest")}</option>
        </select>
        <button
          type="submit"
          disabled={inviting}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {inviting ? t("admin.users.inviting") : t("admin.users.invite")}
        </button>
      </form>

      {/* Members table */}
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="border-b border-slate-700 pb-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t("admin.users.columns.user")}
            </th>
            <th className="border-b border-slate-700 pb-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t("admin.users.columns.role")}
            </th>
            <th className="border-b border-slate-700 pb-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t("admin.users.columns.disabled")}
            </th>
            <th className="border-b border-slate-700 pb-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t("admin.users.columns.actions")}
            </th>
          </tr>
        </thead>
        <tbody>
          {members
            .filter((m) => m.user.id !== currentUser.id)
            .map((m) => (
              <tr key={m.id} className="border-b border-slate-700">
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-2">
                    {m.user.avatar && /^https?:\/\//.test(m.user.avatar) ? (
                      <img src={m.user.avatar} alt="" className="h-8 w-8 rounded-full object-cover" />
                    ) : (
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium overflow-hidden ${m.user.avatar ? "bg-purple-900 text-xl" : "bg-blue-600"}`}>
                        {m.user.avatar || m.user.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium">{m.user.name}</p>
                      <p className="text-xs text-slate-400">{m.user.email}</p>
                    </div>
                  </div>
                </td>
                <td className="py-3 pr-4">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      m.role === "admin"
                        ? "bg-blue-900 text-blue-300"
                        : m.role === "guest"
                          ? "bg-yellow-900 text-yellow-300"
                          : "bg-slate-700 text-slate-300"
                    }`}
                  >
                    {m.role}
                  </span>
                </td>
                <td className="py-3 pr-4">
                  <input
                    type="checkbox"
                    checked={m.user.isDisabled}
                    onChange={() => handleToggleDisabled(m)}
                    className="h-4 w-4 cursor-pointer accent-blue-500"
                  />
                </td>
                <td className="py-3">
                  <button
                    onClick={() => handleRemove(m)}
                    className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-900/30"
                  >
                    {t("admin.users.remove")}
                  </button>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// ChannelsTab
// ============================================================

interface ChannelRow {
  id: string;
  name: string;
  icon: string | null;
  type: string;
  isPrivate: boolean;
  orgId: string;
  createdAt: string;
  _count: { members: number; messages: number };
}

function ChannelsTab({ orgId, token }: { orgId: string; token: string }) {
  const { t } = useTranslation();
  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState("");
  const [newType, setNewType] = useState("group");
  const [newPrivate, setNewPrivate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [managingChannel, setManagingChannel] = useState<ChannelRow | null>(null);
  const [editingChannel, setEditingChannel] = useState<ChannelRow | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingIcon, setEditingIcon] = useState("");

  const fetchChannels = async () => {
    try {
      const res = await fetch(`/api/admin/${orgId}/channels`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setChannels(data.data);
    } catch {
      setError(t("admin.channels.errors.load"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChannels();
  }, [orgId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/${orgId}/channels`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, type: newType, isPrivate: newPrivate, icon: newIcon || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t("admin.channels.errors.create"));
      } else {
        setNewName("");
        setNewIcon("");
        setNewType("group");
        setNewPrivate(false);
        await fetchChannels();
      }
    } catch {
      setError(t("admin.channels.errors.create"));
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async () => {
    if (!editingChannel || !editingName.trim()) return;
    try {
      await fetch(`/api/admin/${orgId}/channels/${editingChannel.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: editingName.trim(), icon: editingIcon || null }),
      });
      setEditingChannel(null);
      setEditingName("");
      setEditingIcon("");
      await fetchChannels();
    } catch {
      setError(t("admin.channels.errors.rename"));
    }
  };

  const handleDelete = async (channel: ChannelRow) => {
    if (!confirm(t("admin.channels.deleteConfirm", { name: channel.name }))) return;
    try {
      await fetch(`/api/admin/${orgId}/channels/${channel.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchChannels();
    } catch {
      setError(t("admin.channels.errors.delete"));
    }
  };

  if (loading) return <div className="text-slate-400">Loading...</div>;

  return (
    <div>
      <h2 className="mb-4 text-xl font-bold">{t("admin.channels.title")}</h2>

      {error && (
        <div className="mb-4 rounded bg-red-900/50 px-4 py-2 text-sm text-red-300">{error}</div>
      )}

      {/* Create form */}
      <form onSubmit={handleCreate} className="mb-6 flex flex-wrap gap-2">
        <EmojiPickerButton value={newIcon} onChange={setNewIcon} placeholder={t("admin.channels.iconPlaceholder")} />
        <input
          type="text"
          placeholder={t("admin.channels.namePlaceholder")}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white placeholder-slate-400"
          required
        />
        <select
          value={newType}
          onChange={(e) => setNewType(e.target.value)}
          className="rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white"
        >
          <option value="group">{t("admin.channels.types.group")}</option>
          <option value="readonly">{t("admin.channels.types.readonly")}</option>
        </select>
        <label className="flex items-center gap-1 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={newPrivate}
            onChange={(e) => setNewPrivate(e.target.checked)}
            className="accent-blue-500"
          />
          {t("admin.channels.private")}
        </label>
        <button
          type="submit"
          disabled={creating}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {creating ? t("admin.channels.creating") : t("admin.channels.create")}
        </button>
      </form>

      {/* Channels table */}
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="border-b border-slate-700 pb-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t("admin.channels.columns.name")}
            </th>
            <th className="border-b border-slate-700 pb-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t("admin.channels.columns.type")}
            </th>
            <th className="border-b border-slate-700 pb-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t("admin.channels.columns.members")}
            </th>
            <th className="border-b border-slate-700 pb-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t("admin.channels.columns.messages")}
            </th>
            <th className="border-b border-slate-700 pb-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t("admin.channels.columns.actions")}
            </th>
          </tr>
        </thead>
        <tbody>
          {channels.map((ch) => (
            <tr key={ch.id} className="border-b border-slate-700">
              <td className="py-3 pr-4 text-sm font-medium">
                {editingChannel?.id === ch.id ? (
                  <div className="flex items-center gap-1">
                    <EmojiPickerButton value={editingIcon} onChange={setEditingIcon} />
                    <input
                      autoFocus
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRename();
                        if (e.key === "Escape") { setEditingChannel(null); setEditingName(""); setEditingIcon(""); }
                      }}
                      className="rounded border border-blue-500 bg-slate-700 px-2 py-0.5 text-sm text-white focus:outline-none w-36"
                    />
                    <button onClick={handleRename} className="text-xs text-green-400 hover:text-green-300">{t("admin.channels.save")}</button>
                    <button onClick={() => { setEditingChannel(null); setEditingName(""); setEditingIcon(""); }} className="text-xs text-slate-400 hover:text-slate-300">✕</button>
                  </div>
                ) : (
                  <span
                    className="cursor-pointer hover:text-blue-400"
                    onClick={() => { setEditingChannel(ch); setEditingName(ch.name); setEditingIcon(ch.icon ?? ""); }}
                    title={t("admin.channels.clickToEdit")}
                  >
                    {ch.icon ? <span className="mr-1">{ch.icon}</span> : (ch.isPrivate ? <span className="mr-1">🔒</span> : null)}#{ch.name}
                  </span>
                )}
              </td>
              <td className="py-3 pr-4">
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${
                    ch.type === "group"
                      ? "bg-blue-900 text-blue-300"
                      : ch.type === "readonly"
                        ? "bg-purple-900 text-purple-300"
                        : "bg-slate-700 text-slate-300"
                  }`}
                >
                  {ch.type}
                </span>
              </td>
              <td className="py-3 pr-4 text-sm text-slate-300">{ch._count.members}</td>
              <td className="py-3 pr-4 text-sm text-slate-300">{ch._count.messages}</td>
              <td className="py-3 flex gap-2">
                <button
                  onClick={() => setManagingChannel(ch)}
                  className="rounded px-2 py-1 text-xs text-blue-400 hover:bg-blue-900/30"
                >
                  {t("admin.channels.members")}
                </button>
                <button
                  onClick={() => handleDelete(ch)}
                  className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-900/30"
                >
                  {t("admin.channels.delete")}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {managingChannel && (
        <ChannelMembersPanel
          orgId={orgId}
          channel={managingChannel}
          token={token}
          onClose={() => { setManagingChannel(null); fetchChannels(); }}
        />
      )}
    </div>
  );
}

// ============================================================
// ChannelMembersPanel
// ============================================================

interface ChannelMemberRow {
  id: string;
  role: string;
  user: { id: string; name: string; email: string; avatar: string | null };
}

interface OrgMemberOption {
  id: string;
  role: string;
  user: { id: string; name: string; email: string };
}

function ChannelMembersPanel({
  orgId, channel, token, onClose,
}: { orgId: string; channel: ChannelRow; token: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [members, setMembers] = useState<ChannelMemberRow[]>([]);
  const [orgMembers, setOrgMembers] = useState<OrgMemberOption[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchMembers = async () => {
    const [mRes, oRes] = await Promise.all([
      fetch(`/api/admin/${orgId}/channels/${channel.id}/members`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`/api/admin/${orgId}/users`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    const [mData, oData] = await Promise.all([mRes.json(), oRes.json()]);
    if (mData.success) setMembers(mData.data);
    if (oData.success) setOrgMembers(oData.data);
    setLoading(false);
  };

  useEffect(() => { fetchMembers(); }, []);

  const addMember = async () => {
    if (!selectedUserId) return;
    await fetch(`/api/admin/${orgId}/channels/${channel.id}/members`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ userId: selectedUserId }),
    });
    setSelectedUserId("");
    await fetchMembers();
  };

  const removeMember = async (userId: string) => {
    await fetch(`/api/admin/${orgId}/channels/${channel.id}/members/${userId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    await fetchMembers();
  };

  const memberIds = new Set(members.map((m) => m.user.id));
  const addableUsers = orgMembers.filter((m) => !memberIds.has(m.user.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-xl bg-slate-800 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-bold">{t("admin.channels.membersPanel.title", { name: channel.name })}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
        </div>

        {/* Add member */}
        <div className="mb-4 flex gap-2">
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="flex-1 rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white"
          >
            <option value="">{t("admin.channels.membersPanel.selectMember")}</option>
            {addableUsers.map((m) => (
              <option key={m.user.id} value={m.user.id}>
                {m.user.name} ({m.user.email})
              </option>
            ))}
          </select>
          <button
            onClick={addMember}
            disabled={!selectedUserId}
            className="rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {t("admin.channels.membersPanel.add")}
          </button>
        </div>

        {/* Member list */}
        {loading ? (
          <div className="text-sm text-slate-400">Loading...</div>
        ) : members.length === 0 ? (
          <div className="text-sm text-slate-400">{t("admin.channels.membersPanel.noMembers")}</div>
        ) : (
          <ul className="space-y-2">
            {members.map((m) => (
              <li key={m.id} className="flex items-center justify-between rounded bg-slate-700 px-3 py-2">
                <div>
                  <span className="text-sm font-medium">{m.user.name}</span>
                  <span className="ml-2 text-xs text-slate-400">{m.user.email}</span>
                </div>
                <button
                  onClick={() => removeMember(m.user.id)}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  {t("admin.channels.membersPanel.remove")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ============================================================
// SettingsTab
// ============================================================

function SettingsTab({ orgId, token }: { orgId: string; token: string }) {
  const { t } = useTranslation();
  const [retainDays, setRetainDays] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch(`/api/admin/${orgId}/settings`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.data) {
          setRetainDays(data.data.messageRetainDays != null ? String(data.data.messageRetainDays) : "");
        }
      })
      .catch(() => setMessage({ type: "error", text: t("admin.settings.errors.load") }))
      .finally(() => setLoading(false));
  }, [orgId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const messageRetainDays = retainDays.trim() === "" ? null : parseInt(retainDays);
      const res = await fetch(`/api/admin/${orgId}/settings`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messageRetainDays }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMessage({ type: "success", text: t("admin.settings.saved") });
      } else {
        setMessage({ type: "error", text: data.error || t("admin.settings.errors.save") });
      }
    } catch {
      setMessage({ type: "error", text: t("admin.settings.errors.save") });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-slate-400">Loading...</div>;

  return (
    <div>
      <h2 className="mb-4 text-xl font-bold">{t("admin.settings.title")}</h2>

      {message && (
        <div
          className={`mb-4 rounded px-4 py-2 text-sm ${
            message.type === "success" ? "bg-green-900/50 text-green-300" : "bg-red-900/50 text-red-300"
          }`}
        >
          {message.text}
        </div>
      )}

      <form onSubmit={handleSave} className="max-w-md space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-300">
            {t("admin.settings.messageRetention")}
          </label>
          <input
            type="number"
            placeholder={t("admin.settings.retentionPlaceholder")}
            value={retainDays}
            onChange={(e) => setRetainDays(e.target.value)}
            min={1}
            className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white placeholder-slate-400"
          />
          <p className="mt-1 text-xs text-slate-400">
            {retainDays
              ? t("admin.settings.currentRetention", { days: retainDays })
              : t("admin.settings.forever")}
          </p>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? t("admin.settings.saving") : t("admin.settings.save")}
        </button>
      </form>
    </div>
  );
}

// ============================================================
// AuditLogsTab
// ============================================================

interface AuditLogRow {
  id: string;
  orgId: string;
  action: string;
  actorId: string;
  targetId: string | null;
  meta: unknown;
  createdAt: string;
  actor: { id: string; name: string; avatar: string | null } | null;
}

const AUDIT_ACTIONS = [
  "member_invite",
  "member_kick",
  "member_role_change",
  "member_disable",
  "channel_create",
  "channel_update",
  "channel_delete",
  "message_retract",
  "org_settings_update",
  "integration_create",
  "integration_delete",
];

function AuditLogsTab({ orgId, token }: { orgId: string; token: string }) {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = async (opts: { cursor?: string; action?: string; append?: boolean } = {}) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (opts.action) params.set("action", opts.action);
      if (opts.cursor) params.set("cursor", opts.cursor);
      params.set("limit", "50");

      const res = await fetch(`/api/admin/${orgId}/audit-logs?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setLogs((prev) => (opts.append ? [...prev, ...data.items] : data.items));
        setHasMore(data.hasMore);
        setNextCursor(data.nextCursor);
      }
    } catch {
      setError(t("admin.auditLogs.errors.load"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs({ action: actionFilter || undefined });
  }, [orgId]);

  const handleFilter = (e: React.FormEvent) => {
    e.preventDefault();
    fetchLogs({ action: actionFilter || undefined });
  };

  const handleLoadMore = () => {
    if (nextCursor) {
      fetchLogs({ cursor: nextCursor, action: actionFilter || undefined, append: true });
    }
  };

  return (
    <div>
      <h2 className="mb-4 text-xl font-bold">{t("admin.auditLogs.title")}</h2>

      {error && (
        <div className="mb-4 rounded bg-red-900/50 px-4 py-2 text-sm text-red-300">{error}</div>
      )}

      {/* Filter */}
      <form onSubmit={handleFilter} className="mb-4 flex gap-2">
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white"
        >
          <option value="">{t("admin.auditLogs.allActions")}</option>
          {AUDIT_ACTIONS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {t("admin.auditLogs.filter")}
        </button>
      </form>

      {loading && logs.length === 0 ? (
        <div className="text-slate-400">{t("admin.auditLogs.loading")}</div>
      ) : (
        <>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border-b border-slate-700 pb-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {t("admin.auditLogs.columns.date")}
                </th>
                <th className="border-b border-slate-700 pb-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {t("admin.auditLogs.columns.actor")}
                </th>
                <th className="border-b border-slate-700 pb-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {t("admin.auditLogs.columns.action")}
                </th>
                <th className="border-b border-slate-700 pb-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {t("admin.auditLogs.columns.target")}
                </th>
                <th className="border-b border-slate-700 pb-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {t("admin.auditLogs.columns.meta")}
                </th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-slate-700">
                  <td className="py-2 pr-4 text-xs text-slate-400">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="py-2 pr-4">
                    {log.actor ? (
                      <div className="flex items-center gap-1">
                        {log.actor.avatar ? (
                          <img src={log.actor.avatar} alt="" className="h-5 w-5 rounded-full" />
                        ) : (
                          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-xs">
                            {log.actor.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span className="text-xs">{log.actor.name}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500">{log.actorId.slice(0, 8)}…</span>
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    <span className="rounded bg-slate-700 px-1.5 py-0.5 font-mono text-xs text-blue-300">
                      {log.action}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-xs text-slate-400">
                    {log.targetId ? `${log.targetId.slice(0, 12)}…` : "—"}
                  </td>
                  <td className="py-2 text-xs text-slate-400">
                    {log.meta
                      ? JSON.stringify(log.meta).slice(0, 80)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {hasMore && (
            <button
              onClick={handleLoadMore}
              disabled={loading}
              className="mt-4 rounded bg-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-600 disabled:opacity-50"
            >
              {loading ? t("admin.auditLogs.loading") : t("admin.auditLogs.loadMore")}
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ============================================================
// IntegrationsTab
// ============================================================

interface IntegrationRow {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  webhookUrl: string | null;
  isActive: boolean;
  createdAt: string;
}

function IntegrationsTab({ orgId, token }: { orgId: string; token: string }) {
  const { t } = useTranslation();
  const [integrations, setIntegrations] = useState<IntegrationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newWebhook, setNewWebhook] = useState("");
  const [creating, setCreating] = useState(false);
  const [plainKey, setPlainKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchIntegrations = async () => {
    try {
      const res = await fetch(`/api/admin/${orgId}/integrations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setIntegrations(data.data);
    } catch {
      setError(t("admin.integrations.errors.load"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIntegrations();
  }, [orgId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/${orgId}/integrations`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          description: newDesc || undefined,
          webhookUrl: newWebhook || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t("admin.integrations.errors.create"));
      } else {
        setPlainKey(data.data.plainKey);
        setNewName("");
        setNewDesc("");
        setNewWebhook("");
        await fetchIntegrations();
      }
    } catch {
      setError(t("admin.integrations.errors.create"));
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (integration: IntegrationRow) => {
    try {
      await fetch(`/api/admin/${orgId}/integrations/${integration.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !integration.isActive }),
      });
      await fetchIntegrations();
    } catch {
      setError(t("admin.integrations.errors.update"));
    }
  };

  const handleDelete = async (integration: IntegrationRow) => {
    if (!confirm(t("admin.integrations.deleteConfirm", { name: integration.name }))) return;
    try {
      await fetch(`/api/admin/${orgId}/integrations/${integration.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchIntegrations();
    } catch {
      setError(t("admin.integrations.errors.delete"));
    }
  };

  if (loading) return <div className="text-slate-400">Loading...</div>;

  return (
    <div>
      <h2 className="mb-4 text-xl font-bold">{t("admin.integrations.title")}</h2>

      {error && (
        <div className="mb-4 rounded bg-red-900/50 px-4 py-2 text-sm text-red-300">{error}</div>
      )}

      {/* Plain key modal */}
      {plainKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-lg bg-slate-800 p-6 shadow-xl">
            <h3 className="mb-2 text-lg font-bold text-white">{t("admin.integrations.apiKeyCreated")}</h3>
            <p className="mb-3 text-sm text-yellow-400">
              {t("admin.integrations.apiKeyWarning")}
            </p>
            <div className="mb-4 rounded bg-slate-900 px-3 py-2 font-mono text-sm text-green-300 break-all">
              {plainKey}
            </div>
            <button
              onClick={() => setPlainKey(null)}
              className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              {t("admin.integrations.apiKeyCopied")}
            </button>
          </div>
        </div>
      )}

      {/* Create form */}
      <form onSubmit={handleCreate} className="mb-6 space-y-2">
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            placeholder={t("admin.integrations.namePlaceholder")}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="flex-1 rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white placeholder-slate-400"
            required
          />
          <input
            type="text"
            placeholder={t("admin.integrations.descriptionPlaceholder")}
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            className="flex-1 rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white placeholder-slate-400"
          />
          <input
            type="url"
            placeholder={t("admin.integrations.webhookPlaceholder")}
            value={newWebhook}
            onChange={(e) => setNewWebhook(e.target.value)}
            className="flex-1 rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white placeholder-slate-400"
          />
          <button
            type="submit"
            disabled={creating}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {creating ? t("admin.integrations.creating") : t("admin.integrations.create")}
          </button>
        </div>
      </form>

      {/* Integrations table */}
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border-b border-slate-700 pb-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t("admin.integrations.columns.name")}
            </th>
            <th className="border-b border-slate-700 pb-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t("admin.integrations.columns.description")}
            </th>
            <th className="border-b border-slate-700 pb-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t("admin.integrations.columns.active")}
            </th>
            <th className="border-b border-slate-700 pb-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t("admin.integrations.columns.created")}
            </th>
            <th className="border-b border-slate-700 pb-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t("admin.integrations.columns.actions")}
            </th>
          </tr>
        </thead>
        <tbody>
          {integrations.map((int) => (
            <tr key={int.id} className="border-b border-slate-700">
              <td className="py-3 pr-4 font-medium">{int.name}</td>
              <td className="py-3 pr-4 text-slate-400">{int.description || "—"}</td>
              <td className="py-3 pr-4">
                <input
                  type="checkbox"
                  checked={int.isActive}
                  onChange={() => handleToggleActive(int)}
                  className="h-4 w-4 cursor-pointer accent-blue-500"
                />
              </td>
              <td className="py-3 pr-4 text-xs text-slate-400">
                {new Date(int.createdAt).toLocaleDateString()}
              </td>
              <td className="py-3">
                <button
                  onClick={() => handleDelete(int)}
                  className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-900/30"
                >
                  {t("admin.integrations.delete")}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// SetupOrgPrompt — shown when no org exists yet
// ============================================================

function SetupOrgPrompt({ token, onCreated }: { token: string; onCreated: (id: string) => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/orgs", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug }),
      });
      const data = await res.json();
      if (data.success) {
        onCreated(data.data.id);
      } else {
        setError(data.error || t("admin.setup.create"));
      }
    } catch {
      setError(t("admin.setup.create"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-slate-900 text-white">
      <div className="w-full max-w-sm rounded-2xl bg-slate-800 p-8 shadow-xl">
        <h2 className="mb-2 text-xl font-bold">{t("admin.setup.title")}</h2>
        <p className="mb-6 text-sm text-slate-400">{t("admin.setup.description")}</p>
        <input
          value={name}
          onChange={(e) => { setName(e.target.value); setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-")); }}
          placeholder={t("admin.setup.namePlaceholder")}
          className="mb-3 w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white placeholder-slate-400 focus:border-blue-500 focus:outline-none"
        />
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder={t("admin.setup.slugPlaceholder")}
          className="mb-4 w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white placeholder-slate-400 focus:border-blue-500 focus:outline-none"
        />
        {error && <p className="mb-3 text-xs text-red-400">{error}</p>}
        <button
          onClick={handleCreate}
          disabled={loading || !name || !slug}
          className="w-full rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
        >
          {loading ? t("admin.setup.creating") : t("admin.setup.create")}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// LocalUsersTab
// ============================================================

interface LocalUserRow {
  id: string;
  email: string;
  name: string;
  isDisabled: boolean;
  isSuperAdmin: boolean;
  createdAt: string;
}

function LocalUsersTab({ token, currentUser }: { token: string; currentUser: UserProfile }) {
  const { t } = useTranslation();
  const [users, setUsers] = useState<LocalUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/system/local-users", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setUsers(data.data);
    } catch {
      setError(t("admin.localAccounts.errors.load"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !name || !password) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/system/local-users", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t("admin.localAccounts.errors.create"));
      } else {
        setEmail(""); setName(""); setPassword("");
        await fetchUsers();
      }
    } catch {
      setError(t("admin.localAccounts.errors.create"));
    } finally {
      setCreating(false);
    }
  };

  const handleToggleDisabled = async (u: LocalUserRow) => {
    try {
      await fetch(`/api/system/local-users/${u.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ isDisabled: !u.isDisabled }),
      });
      await fetchUsers();
    } catch {
      setError(t("admin.localAccounts.errors.update"));
    }
  };

  const handleSetPassword = async (id: string) => {
    if (!newPassword) return;
    try {
      const res = await fetch(`/api/system/local-users/${id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || t("admin.localAccounts.errors.updatePassword"));
      } else {
        setEditingId(null);
        setNewPassword("");
      }
    } catch {
      setError(t("admin.localAccounts.errors.updatePassword"));
    }
  };

  const handleDelete = async (u: LocalUserRow) => {
    if (!confirm(t("admin.localAccounts.deleteConfirm", { name: u.name, email: u.email }))) return;
    try {
      const res = await fetch(`/api/system/local-users/${u.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || t("admin.localAccounts.errors.delete"));
      } else {
        await fetchUsers();
      }
    } catch {
      setError(t("admin.localAccounts.errors.delete"));
    }
  };

  if (loading) return <div className="text-slate-400">Loading...</div>;

  return (
    <div>
      <h2 className="mb-4 text-xl font-bold">{t("admin.localAccounts.title")}</h2>
      <p className="mb-6 text-sm text-slate-400">
        {t("admin.localAccounts.description")}
      </p>

      {error && (
        <div className="mb-4 rounded bg-red-900/50 px-4 py-2 text-sm text-red-300">{error}</div>
      )}

      {/* Create form */}
      <form onSubmit={handleCreate} className="mb-6 flex flex-wrap gap-2">
        <input
          type="email" placeholder={t("admin.users.emailPlaceholder")} value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white placeholder-slate-400"
          required
        />
        <input
          type="text" placeholder={t("admin.localAccounts.displayNamePlaceholder")} value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white placeholder-slate-400"
          required
        />
        <input
          type="password" placeholder={t("admin.localAccounts.passwordPlaceholder")} value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white placeholder-slate-400"
          required
        />
        <button
          type="submit" disabled={creating}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {creating ? t("admin.localAccounts.creating") : t("admin.localAccounts.create")}
        </button>
      </form>

      {/* Users table */}
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {[
              t("admin.localAccounts.columns.nameEmail"),
              t("admin.localAccounts.columns.role"),
              t("admin.localAccounts.columns.disabled"),
              t("admin.localAccounts.columns.actions"),
            ].map((h) => (
              <th key={h} className="border-b border-slate-700 pb-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b border-slate-700">
              <td className="py-3 pr-4">
                <p className="font-medium">{u.name}</p>
                <p className="text-xs text-slate-400">{u.email}</p>
              </td>
              <td className="py-3 pr-4">
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${u.isSuperAdmin ? "bg-purple-900 text-purple-300" : "bg-slate-700 text-slate-300"}`}>
                  {u.isSuperAdmin ? t("admin.localAccounts.roles.superAdmin") : t("admin.localAccounts.roles.user")}
                </span>
              </td>
              <td className="py-3 pr-4">
                {u.id !== currentUser.id && (
                  <input
                    type="checkbox" checked={u.isDisabled}
                    onChange={() => handleToggleDisabled(u)}
                    className="h-4 w-4 cursor-pointer accent-blue-500"
                  />
                )}
              </td>
              <td className="py-3">
                <div className="flex items-center gap-2">
                  {editingId === u.id ? (
                    <>
                      <input
                        type="password" placeholder={t("admin.localAccounts.newPasswordPlaceholder")} value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="rounded border border-slate-600 bg-slate-700 px-2 py-1 text-xs text-white placeholder-slate-400"
                      />
                      <button onClick={() => handleSetPassword(u.id)}
                        className="rounded px-2 py-1 text-xs text-green-400 hover:bg-green-900/30">{t("admin.localAccounts.save")}</button>
                      <button onClick={() => { setEditingId(null); setNewPassword(""); }}
                        className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-700">{t("admin.localAccounts.cancel")}</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => setEditingId(u.id)}
                        className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-700">
                        {t("admin.localAccounts.changePassword")}
                      </button>
                      {!u.isSuperAdmin && u.id !== currentUser.id && (
                        <button onClick={() => handleDelete(u)}
                          className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-900/30">
                          {t("admin.localAccounts.delete")}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// AIAssistantsTab
// ============================================================

interface AIAssistantRow {
  id: string;
  name: string;
  avatar: string | null;
  provider: string;
  model: string;
  systemPrompt: string;
  baseUrl: string;
  maxContext: number;
  isActive: boolean;
  botUserId: string;
  createdAt: string;
  channels: { channelId: string }[];
}

function AIAssistantsTab({ orgId, token }: { orgId: string; token: string }) {
  const { t } = useTranslation();
  const [assistants, setAssistants] = useState<AIAssistantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    provider: "openai",
    baseUrl: "",
    apiKey: "",
    model: "",
    systemPrompt: "",
    maxContext: 20,
    avatar: "",
  });

  // Channel assignment state
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [orgChannels, setOrgChannels] = useState<{ id: string; name: string }[]>([]);

  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const fetchAssistants = async () => {
    try {
      const res = await fetch(`/api/admin/${orgId}/ai-assistants`, { headers });
      const data = await res.json();
      if (data.success) setAssistants(data.data);
    } catch {
      setError(t("admin.aiAssistants.errors.load"));
    } finally {
      setLoading(false);
    }
  };

  const fetchChannels = async () => {
    const res = await fetch(`/api/admin/${orgId}/channels`, { headers });
    const data = await res.json();
    if (data.success) setOrgChannels(data.data.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
  };

  useEffect(() => { fetchAssistants(); fetchChannels(); }, [orgId]);

  const resetForm = () => {
    setForm({ name: "", provider: "openai", baseUrl: "", apiKey: "", model: "", systemPrompt: "", maxContext: 20, avatar: "" });
    setEditingId(null);
    setShowForm(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        const body: Record<string, unknown> = { ...form };
        if (!body.apiKey) delete body.apiKey; // don't send empty API key on edit
        await fetch(`/api/admin/${orgId}/ai-assistants/${editingId}`, {
          method: "PATCH", headers, body: JSON.stringify(body),
        });
      } else {
        await fetch(`/api/admin/${orgId}/ai-assistants`, {
          method: "POST", headers, body: JSON.stringify(form),
        });
      }
      resetForm();
      fetchAssistants();
    } catch {
      setError(editingId ? t("admin.aiAssistants.errors.update") : t("admin.aiAssistants.errors.create"));
    }
  };

  const handleEdit = (a: AIAssistantRow) => {
    setForm({
      name: a.name,
      provider: a.provider,
      baseUrl: a.baseUrl,
      apiKey: "",
      model: a.model,
      systemPrompt: a.systemPrompt,
      maxContext: a.maxContext,
      avatar: a.avatar || "",
    });
    setEditingId(a.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("common.confirmDelete"))) return;
    await fetch(`/api/admin/${orgId}/ai-assistants/${id}`, { method: "DELETE", headers });
    fetchAssistants();
  };

  const handleToggleActive = async (a: AIAssistantRow) => {
    await fetch(`/api/admin/${orgId}/ai-assistants/${a.id}`, {
      method: "PATCH", headers, body: JSON.stringify({ isActive: !a.isActive }),
    });
    fetchAssistants();
  };

  const handleToggleChannel = async (assistantId: string, channelId: string, assigned: boolean) => {
    if (assigned) {
      await fetch(`/api/admin/${orgId}/ai-assistants/${assistantId}/channels/${channelId}`, {
        method: "DELETE", headers,
      });
    } else {
      await fetch(`/api/admin/${orgId}/ai-assistants/${assistantId}/channels`, {
        method: "POST", headers, body: JSON.stringify({ channelId }),
      });
    }
    fetchAssistants();
  };

  if (loading) return <p className="text-slate-400">{t("common.loading")}</p>;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold">{t("admin.tabs.aiAssistants")}</h2>
        <button
          onClick={() => { resetForm(); setShowForm(!showForm); }}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {showForm ? t("common.cancel") : t("admin.aiAssistants.create")}
        </button>
      </div>

      {error && <p className="mb-4 text-red-400">{error}</p>}

      {/* Create / Edit Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 space-y-3 rounded-lg border border-slate-700 bg-slate-800 p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-slate-400">{t("admin.aiAssistants.name")}</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">{t("admin.aiAssistants.provider")}</label>
              <select
                value={form.provider}
                onChange={(e) => setForm({ ...form, provider: e.target.value })}
                className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white"
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">{t("admin.aiAssistants.baseUrl")}</label>
              <input
                value={form.baseUrl}
                onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                required={!editingId}
                placeholder="https://api.openai.com"
                className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">{t("admin.aiAssistants.model")}</label>
              <input
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                required={!editingId}
                placeholder="gpt-4o"
                className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">{t("admin.aiAssistants.apiKey")}</label>
              <input
                type="password"
                value={form.apiKey}
                onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                required={!editingId}
                placeholder={editingId ? t("admin.aiAssistants.apiKeyPlaceholder") : ""}
                className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">{t("admin.aiAssistants.maxContext")}</label>
              <input
                type="number"
                min={1}
                max={100}
                value={form.maxContext}
                onChange={(e) => setForm({ ...form, maxContext: parseInt(e.target.value) || 20 })}
                className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white"
              />
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-xs text-slate-400">{t("admin.aiAssistants.avatar")}</label>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-purple-900 text-xl">
                  {form.avatar ? (
                    /^https?:\/\//.test(form.avatar)
                      ? <img src={form.avatar} alt="" className="h-10 w-10 rounded-full object-cover" />
                      : <span>{form.avatar}</span>
                  ) : <span>🤖</span>}
                </div>
                <input
                  value={form.avatar}
                  onChange={(e) => setForm({ ...form, avatar: e.target.value })}
                  placeholder="🤖 or https://..."
                  className="flex-1 rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white"
                />
              </div>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">{t("admin.aiAssistants.systemPrompt")}</label>
            <textarea
              value={form.systemPrompt}
              onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
              required={!editingId}
              rows={3}
              className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white"
            />
          </div>
          <button type="submit" className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            {editingId ? t("common.save") : t("admin.aiAssistants.create")}
          </button>
        </form>
      )}

      {/* Assistants Table */}
      {assistants.length === 0 ? (
        <p className="text-slate-500">{t("admin.aiAssistants.empty")}</p>
      ) : (
        <div className="space-y-3">
          {assistants.map((a) => (
            <div key={a.id} className="rounded-lg border border-slate-700 bg-slate-800 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-purple-900 text-xl overflow-hidden">
                    {a.avatar && /^https?:\/\//.test(a.avatar)
                      ? <img src={a.avatar} alt="" className="h-10 w-10 object-cover" />
                      : <span>{a.avatar || a.name.charAt(0).toUpperCase()}</span>}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white">{a.name}</span>
                      <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300">
                        {a.provider} · {a.model}
                      </span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        a.isActive ? "bg-green-900/50 text-green-400" : "bg-red-900/50 text-red-400"
                      }`}>
                        {a.isActive ? t("admin.aiAssistants.active") : t("admin.aiAssistants.inactive")}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {t("admin.aiAssistants.channels")}: {a.channels.length} · {t("admin.aiAssistants.maxContext")}: {a.maxContext}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setAssigningId(assigningId === a.id ? null : a.id)}
                    className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-700 hover:text-white"
                  >
                    {t("admin.aiAssistants.channels")}
                  </button>
                  <button
                    onClick={() => handleToggleActive(a)}
                    className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-700 hover:text-white"
                  >
                    {a.isActive ? t("admin.aiAssistants.disable") : t("admin.aiAssistants.enable")}
                  </button>
                  <button
                    onClick={() => handleEdit(a)}
                    className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-700 hover:text-white"
                  >
                    {t("common.edit")}
                  </button>
                  <button
                    onClick={() => handleDelete(a.id)}
                    className="rounded px-2 py-1 text-xs text-red-400 hover:bg-slate-700"
                  >
                    {t("common.delete")}
                  </button>
                </div>
              </div>

              {/* Channel assignment panel */}
              {assigningId === a.id && (
                <div className="mt-3 border-t border-slate-700 pt-3">
                  <p className="mb-2 text-xs font-medium text-slate-400">{t("admin.aiAssistants.assignChannels")}</p>
                  <div className="flex flex-wrap gap-2">
                    {orgChannels.map((ch) => {
                      const assigned = a.channels.some((ac) => ac.channelId === ch.id);
                      return (
                        <button
                          key={ch.id}
                          onClick={() => handleToggleChannel(a.id, ch.id, assigned)}
                          className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                            assigned
                              ? "bg-blue-600 text-white hover:bg-blue-700"
                              : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                          }`}
                        >
                          {ch.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// AdminPage
// ============================================================

export function AdminPage({ user, token, onLogout }: AdminPageProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<AdminTab>("users");
  const [orgId, setOrgId] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Super admins always have access; just find the first org if any
    fetch("/api/orgs", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.data && data.data.length > 0) {
          setOrgId(data.data[0].id);
        }
        // No org yet is fine for super admin — will show setup prompt
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, [token]);

  if (checking) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-900 text-white">
        <div className="animate-pulse text-lg">{t("admin.checkingAccess")}</div>
      </div>
    );
  }

  if (!orgId) {
    return <SetupOrgPrompt token={token} onCreated={setOrgId} />;
  }

  const tabs: { id: AdminTab; label: string }[] = [
    { id: "users", label: t("admin.tabs.users") },
    { id: "channels", label: t("admin.tabs.channels") },
    { id: "settings", label: t("admin.tabs.settings") },
    { id: "audit-logs", label: t("admin.tabs.auditLogs") },
    { id: "integrations", label: t("admin.tabs.integrations") },
    { id: "ai-assistants", label: t("admin.tabs.aiAssistants") },
    { id: "local-users", label: t("admin.tabs.localAccounts") },
  ];

  return (
    <div className="flex h-screen bg-slate-900 text-white">
      {/* Left sidebar */}
      <aside className="flex w-52 flex-shrink-0 flex-col border-r border-slate-700 bg-slate-800">
        {/* Header */}
        <div className="border-b border-slate-700 p-4">
          <h1 className="text-base font-bold text-white">{t("admin.panel")}</h1>
          <p className="mt-0.5 truncate text-xs text-slate-400">{user.email}</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`mb-1 w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                activeTab === tab.id
                  ? "bg-slate-700 text-white"
                  : "text-slate-300 hover:bg-slate-700/50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-slate-700 p-3 space-y-1">
          <a
            href="/"
            className="block w-full rounded px-3 py-2 text-left text-sm text-slate-400 transition hover:bg-slate-700 hover:text-white"
          >
            {t("admin.backToChat")}
          </a>
          <button
            onClick={onLogout}
            className="w-full rounded px-3 py-2 text-left text-sm text-slate-400 transition hover:bg-slate-700 hover:text-white"
          >
            {t("admin.logout")}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-slate-900 p-6">
        {activeTab === "users" && (
          <UsersTab orgId={orgId} token={token} currentUser={user} />
        )}
        {activeTab === "channels" && (
          <ChannelsTab orgId={orgId} token={token} />
        )}
        {activeTab === "settings" && (
          <SettingsTab orgId={orgId} token={token} />
        )}
        {activeTab === "audit-logs" && (
          <AuditLogsTab orgId={orgId} token={token} />
        )}
        {activeTab === "integrations" && (
          <IntegrationsTab orgId={orgId} token={token} />
        )}
        {activeTab === "ai-assistants" && (
          <AIAssistantsTab orgId={orgId} token={token} />
        )}
        {activeTab === "local-users" && (
          <LocalUsersTab token={token} currentUser={user} />
        )}
      </main>
    </div>
  );
}
