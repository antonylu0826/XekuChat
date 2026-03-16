import { useState } from "react";

interface SetupWizardProps {
  token: string;
  onComplete: (orgId: string) => void;
}

export function SetupWizard({ token, onComplete }: SetupWizardProps) {
  const [step, setStep] = useState<"org" | "channel">("org");
  const [orgId, setOrgId] = useState("");
  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [channelName, setChannelName] = useState("general");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleCreateOrg = async () => {
    if (!orgName.trim() || !orgSlug.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/orgs", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: orgName.trim(), slug: orgSlug.trim() }),
      });
      const body = await res.json();
      if (!body.success) {
        setError(body.error || "Failed to create organization");
        return;
      }
      setOrgId(body.data.id);
      setStep("channel");
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateChannel = async () => {
    if (!channelName.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, name: channelName.trim(), type: "group" }),
      });
      const body = await res.json();
      if (!body.success) {
        setError(body.error || "Failed to create channel");
        return;
      }
      onComplete(orgId);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  const autoSlug = (name: string) =>
    name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-800 p-8 shadow-xl">
        {/* Steps */}
        <div className="mb-6 flex items-center gap-2">
          <div className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${step === "org" ? "bg-blue-600 text-white" : "bg-green-600 text-white"}`}>
            {step === "org" ? "1" : "✓"}
          </div>
          <div className={`h-0.5 flex-1 ${step === "channel" ? "bg-blue-600" : "bg-slate-600"}`} />
          <div className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${step === "channel" ? "bg-blue-600 text-white" : "bg-slate-600 text-slate-400"}`}>
            2
          </div>
        </div>

        {step === "org" ? (
          <>
            <h2 className="mb-1 text-xl font-bold text-white">建立組織</h2>
            <p className="mb-5 text-sm text-slate-400">設定你的工作區名稱</p>
            <label className="mb-1 block text-xs text-slate-400">組織名稱</label>
            <input
              value={orgName}
              onChange={(e) => {
                setOrgName(e.target.value);
                setOrgSlug(autoSlug(e.target.value));
              }}
              placeholder="Acme Corp"
              className="mb-3 w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
            />
            <label className="mb-1 block text-xs text-slate-400">網址識別碼（slug）</label>
            <input
              value={orgSlug}
              onChange={(e) => setOrgSlug(autoSlug(e.target.value))}
              placeholder="acme-corp"
              className="mb-5 w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
            />
            {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
            <button
              onClick={handleCreateOrg}
              disabled={loading || !orgName.trim() || !orgSlug.trim()}
              className="w-full rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
            >
              {loading ? "建立中..." : "下一步 →"}
            </button>
          </>
        ) : (
          <>
            <h2 className="mb-1 text-xl font-bold text-white">建立第一個頻道</h2>
            <p className="mb-5 text-sm text-slate-400">例如 general、announcements</p>
            <label className="mb-1 block text-xs text-slate-400">頻道名稱</label>
            <input
              value={channelName}
              onChange={(e) => setChannelName(e.target.value.replace(/\s+/g, "-"))}
              placeholder="general"
              className="mb-5 w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
            />
            {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
            <button
              onClick={handleCreateChannel}
              disabled={loading || !channelName.trim()}
              className="w-full rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
            >
              {loading ? "建立中..." : "開始使用 🎉"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
