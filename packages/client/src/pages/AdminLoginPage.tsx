import { useState } from "react";

interface AdminLoginPageProps {
  onLogin: () => void;
}

export function AdminLoginPage({ onLogin }: AdminLoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/auth/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json();
      if (body.success && body.data.accessToken) {
        sessionStorage.setItem("access_token", body.data.accessToken);
        onLogin();
      } else {
        setError(body.error || "Login failed");
      }
    } catch {
      setError("Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-slate-900">
      <div className="w-full max-w-sm rounded-2xl bg-slate-800 p-8 shadow-xl">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-white">Admin</h1>
          <p className="mt-2 text-sm text-slate-400">系統管理員登入</p>
        </div>

        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="mb-3 w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white placeholder-slate-400 focus:border-blue-500 focus:outline-none"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="密碼"
          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          className="mb-4 w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white placeholder-slate-400 focus:border-blue-500 focus:outline-none"
        />

        {error && <p className="mb-3 text-xs text-red-400">{error}</p>}

        <button
          onClick={handleLogin}
          disabled={loading || !email || !password}
          className="w-full rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
        >
          {loading ? "登入中..." : "登入"}
        </button>

        <div className="mt-4 text-center">
          <a href="/" className="text-xs text-slate-500 hover:text-slate-300 transition">
            ← 返回
          </a>
        </div>
      </div>
    </div>
  );
}
