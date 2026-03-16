import { useState, useEffect } from "react";
import type { UserProfile } from "@xekuchat/core";

interface AdminPageProps {
  user: UserProfile;
  token: string;
  onLogout: () => void;
}

type AdminTab = "users" | "channels" | "settings" | "audit-logs" | "integrations";

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
      setError("Failed to load members");
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
        setError(data.error || "Failed to invite");
      } else {
        setInviteEmail("");
        await fetchMembers();
      }
    } catch {
      setError("Failed to invite user");
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
      setError("Failed to update user");
    }
  };

  const handleRemove = async (member: OrgMemberRow) => {
    if (!confirm(`Remove ${member.user.name} from the organization?`)) return;
    try {
      await fetch(`/api/admin/${orgId}/users/${member.user.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchMembers();
    } catch {
      setError("Failed to remove user");
    }
  };

  if (loading) return <div className="text-slate-400">Loading...</div>;

  return (
    <div>
      <h2 className="mb-4 text-xl font-bold">Users</h2>

      {error && (
        <div className="mb-4 rounded bg-red-900/50 px-4 py-2 text-sm text-red-300">{error}</div>
      )}

      {/* Invite form */}
      <form onSubmit={handleInvite} className="mb-6 flex gap-2">
        <input
          type="email"
          placeholder="Email address"
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
          <option value="member">Member</option>
          <option value="admin">Admin</option>
          <option value="guest">Guest</option>
        </select>
        <button
          type="submit"
          disabled={inviting}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {inviting ? "Inviting..." : "Invite"}
        </button>
      </form>

      {/* Members table */}
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="border-b border-slate-700 pb-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              User
            </th>
            <th className="border-b border-slate-700 pb-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              Role
            </th>
            <th className="border-b border-slate-700 pb-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              Disabled
            </th>
            <th className="border-b border-slate-700 pb-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              Actions
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
                    {m.user.avatar ? (
                      <img src={m.user.avatar} alt="" className="h-8 w-8 rounded-full" />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-sm font-medium">
                        {m.user.name.charAt(0).toUpperCase()}
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
                    Remove
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
  type: string;
  isPrivate: boolean;
  orgId: string;
  createdAt: string;
  _count: { members: number; messages: number };
}

function ChannelsTab({ orgId, token }: { orgId: string; token: string }) {
  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("group");
  const [newPrivate, setNewPrivate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [managingChannel, setManagingChannel] = useState<ChannelRow | null>(null);

  const fetchChannels = async () => {
    try {
      const res = await fetch(`/api/admin/${orgId}/channels`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setChannels(data.data);
    } catch {
      setError("Failed to load channels");
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
        body: JSON.stringify({ name: newName, type: newType, isPrivate: newPrivate }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create channel");
      } else {
        setNewName("");
        setNewType("group");
        setNewPrivate(false);
        await fetchChannels();
      }
    } catch {
      setError("Failed to create channel");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (channel: ChannelRow) => {
    if (!confirm(`Delete channel #${channel.name}? This will also delete all messages.`)) return;
    try {
      await fetch(`/api/admin/${orgId}/channels/${channel.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchChannels();
    } catch {
      setError("Failed to delete channel");
    }
  };

  if (loading) return <div className="text-slate-400">Loading...</div>;

  return (
    <div>
      <h2 className="mb-4 text-xl font-bold">Channels</h2>

      {error && (
        <div className="mb-4 rounded bg-red-900/50 px-4 py-2 text-sm text-red-300">{error}</div>
      )}

      {/* Create form */}
      <form onSubmit={handleCreate} className="mb-6 flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="Channel name"
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
          <option value="group">Group</option>
          <option value="readonly">Readonly</option>
        </select>
        <label className="flex items-center gap-1 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={newPrivate}
            onChange={(e) => setNewPrivate(e.target.checked)}
            className="accent-blue-500"
          />
          Private
        </label>
        <button
          type="submit"
          disabled={creating}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {creating ? "Creating..." : "Create"}
        </button>
      </form>

      {/* Channels table */}
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="border-b border-slate-700 pb-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              Name
            </th>
            <th className="border-b border-slate-700 pb-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              Type
            </th>
            <th className="border-b border-slate-700 pb-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              Members
            </th>
            <th className="border-b border-slate-700 pb-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              Messages
            </th>
            <th className="border-b border-slate-700 pb-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {channels.map((ch) => (
            <tr key={ch.id} className="border-b border-slate-700">
              <td className="py-3 pr-4 text-sm font-medium">
                {ch.isPrivate && <span className="mr-1">🔒</span>}#{ch.name}
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
                  成員
                </button>
                <button
                  onClick={() => handleDelete(ch)}
                  className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-900/30"
                >
                  Delete
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
          <h3 className="font-bold">#{channel.name} 成員管理</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
        </div>

        {/* Add member */}
        <div className="mb-4 flex gap-2">
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="flex-1 rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white"
          >
            <option value="">選擇要加入的成員</option>
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
            加入
          </button>
        </div>

        {/* Member list */}
        {loading ? (
          <div className="text-sm text-slate-400">載入中...</div>
        ) : members.length === 0 ? (
          <div className="text-sm text-slate-400">目前沒有成員</div>
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
                  移除
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
      .catch(() => setMessage({ type: "error", text: "Failed to load settings" }))
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
        setMessage({ type: "success", text: "Settings saved successfully." });
      } else {
        setMessage({ type: "error", text: data.error || "Failed to save" });
      }
    } catch {
      setMessage({ type: "error", text: "Failed to save settings" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-slate-400">Loading...</div>;

  return (
    <div>
      <h2 className="mb-4 text-xl font-bold">Settings</h2>

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
            Message Retention (days)
          </label>
          <input
            type="number"
            placeholder="Leave empty for forever"
            value={retainDays}
            onChange={(e) => setRetainDays(e.target.value)}
            min={1}
            className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white placeholder-slate-400"
          />
          <p className="mt-1 text-xs text-slate-400">
            Current value: {retainDays ? `${retainDays} days` : "Forever (no expiry)"}
          </p>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
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
      setError("Failed to load audit logs");
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
      <h2 className="mb-4 text-xl font-bold">Audit Logs</h2>

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
          <option value="">All actions</option>
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
          Filter
        </button>
      </form>

      {loading && logs.length === 0 ? (
        <div className="text-slate-400">Loading...</div>
      ) : (
        <>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border-b border-slate-700 pb-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Date
                </th>
                <th className="border-b border-slate-700 pb-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Actor
                </th>
                <th className="border-b border-slate-700 pb-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Action
                </th>
                <th className="border-b border-slate-700 pb-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Target
                </th>
                <th className="border-b border-slate-700 pb-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Meta
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
              {loading ? "Loading..." : "Load More"}
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
      setError("Failed to load integrations");
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
        setError(data.error || "Failed to create integration");
      } else {
        setPlainKey(data.data.plainKey);
        setNewName("");
        setNewDesc("");
        setNewWebhook("");
        await fetchIntegrations();
      }
    } catch {
      setError("Failed to create integration");
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
      setError("Failed to update integration");
    }
  };

  const handleDelete = async (integration: IntegrationRow) => {
    if (!confirm(`Delete integration "${integration.name}"?`)) return;
    try {
      await fetch(`/api/admin/${orgId}/integrations/${integration.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchIntegrations();
    } catch {
      setError("Failed to delete integration");
    }
  };

  if (loading) return <div className="text-slate-400">Loading...</div>;

  return (
    <div>
      <h2 className="mb-4 text-xl font-bold">Integrations</h2>

      {error && (
        <div className="mb-4 rounded bg-red-900/50 px-4 py-2 text-sm text-red-300">{error}</div>
      )}

      {/* Plain key modal */}
      {plainKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-lg bg-slate-800 p-6 shadow-xl">
            <h3 className="mb-2 text-lg font-bold text-white">API Key Created</h3>
            <p className="mb-3 text-sm text-yellow-400">
              This key will only be shown once. Copy it now and store it securely.
            </p>
            <div className="mb-4 rounded bg-slate-900 px-3 py-2 font-mono text-sm text-green-300 break-all">
              {plainKey}
            </div>
            <button
              onClick={() => setPlainKey(null)}
              className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              I have copied the key
            </button>
          </div>
        </div>
      )}

      {/* Create form */}
      <form onSubmit={handleCreate} className="mb-6 space-y-2">
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            placeholder="Integration name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="flex-1 rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white placeholder-slate-400"
            required
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            className="flex-1 rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white placeholder-slate-400"
          />
          <input
            type="url"
            placeholder="Webhook URL (optional)"
            value={newWebhook}
            onChange={(e) => setNewWebhook(e.target.value)}
            className="flex-1 rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white placeholder-slate-400"
          />
          <button
            type="submit"
            disabled={creating}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create"}
          </button>
        </div>
      </form>

      {/* Integrations table */}
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border-b border-slate-700 pb-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              Name
            </th>
            <th className="border-b border-slate-700 pb-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              Description
            </th>
            <th className="border-b border-slate-700 pb-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              Active
            </th>
            <th className="border-b border-slate-700 pb-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              Created
            </th>
            <th className="border-b border-slate-700 pb-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              Actions
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
                  Delete
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
        setError(data.error || "Failed to create organization");
      }
    } catch {
      setError("Failed to create organization");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-slate-900 text-white">
      <div className="w-full max-w-sm rounded-2xl bg-slate-800 p-8 shadow-xl">
        <h2 className="mb-2 text-xl font-bold">建立組織</h2>
        <p className="mb-6 text-sm text-slate-400">尚未建立任何組織，請先建立一個。</p>
        <input
          value={name}
          onChange={(e) => { setName(e.target.value); setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-")); }}
          placeholder="組織名稱"
          className="mb-3 w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white placeholder-slate-400 focus:border-blue-500 focus:outline-none"
        />
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="Slug（英文小寫、連字符）"
          className="mb-4 w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white placeholder-slate-400 focus:border-blue-500 focus:outline-none"
        />
        {error && <p className="mb-3 text-xs text-red-400">{error}</p>}
        <button
          onClick={handleCreate}
          disabled={loading || !name || !slug}
          className="w-full rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
        >
          {loading ? "建立中..." : "建立組織"}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// AdminPage
// ============================================================

export function AdminPage({ user, token, onLogout }: AdminPageProps) {
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
        <div className="animate-pulse text-lg">Checking access...</div>
      </div>
    );
  }

  if (!orgId) {
    return <SetupOrgPrompt token={token} onCreated={setOrgId} />;
  }

  const tabs: { id: AdminTab; label: string }[] = [
    { id: "users", label: "Users" },
    { id: "channels", label: "Channels" },
    { id: "settings", label: "Settings" },
    { id: "audit-logs", label: "Audit Logs" },
    { id: "integrations", label: "Integrations" },
  ];

  return (
    <div className="flex h-screen bg-slate-900 text-white">
      {/* Left sidebar */}
      <aside className="flex w-52 flex-shrink-0 flex-col border-r border-slate-700 bg-slate-800">
        {/* Header */}
        <div className="border-b border-slate-700 p-4">
          <h1 className="text-base font-bold text-white">Admin Panel</h1>
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
            ← Back to Chat
          </a>
          <button
            onClick={onLogout}
            className="w-full rounded px-3 py-2 text-left text-sm text-slate-400 transition hover:bg-slate-700 hover:text-white"
          >
            Logout
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
      </main>
    </div>
  );
}
