import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";

interface LoginPageProps {
  onLogin: () => void;
  onLocalLogin: (email: string, password: string) => Promise<string | null>;
}

export function LoginPage({ onLogin, onLocalLogin }: LoginPageProps) {
  const { t, i18n } = useTranslation();
  const [oidcEnabled, setOidcEnabled] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/auth/config")
      .then((r) => r.json())
      .then((data) => setOidcEnabled(data.oidcEnabled === true))
      .catch(() => {});
  }, []);

  const toggleLang = () => {
    i18n.changeLanguage(i18n.language === "zh-TW" ? "en" : "zh-TW");
  };

  const handleLocalLogin = async () => {
    if (!email || !password) return;
    setError("");
    setLoading(true);
    const err = await onLocalLogin(email, password);
    if (err) setError(err);
    setLoading(false);
  };

  return (
    <div className="flex h-screen items-center justify-center bg-slate-900">
      <div className="w-full max-w-sm rounded-2xl bg-slate-800 p-8 shadow-xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-white">{t("app.name")}</h1>
          <p className="mt-2 text-slate-400">{t("app.tagline")}</p>
        </div>

        {/* Local email/password login */}
        <div className="mb-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("auth.email")}
            autoComplete="username"
            className="mb-3 w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white placeholder-slate-400 focus:border-blue-500 focus:outline-none"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("auth.password")}
            autoComplete="current-password"
            onKeyDown={(e) => e.key === "Enter" && handleLocalLogin()}
            className="mb-4 w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white placeholder-slate-400 focus:border-blue-500 focus:outline-none"
          />
          {error && <p className="mb-3 text-xs text-red-400">{error}</p>}
          <button
            onClick={handleLocalLogin}
            disabled={loading || !email || !password}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
          >
            {loading ? t("auth.loggingIn") : t("auth.login")}
          </button>
        </div>

        {/* OIDC login — only shown when enabled */}
        {oidcEnabled && (
          <div className="mt-4">
            <div className="mb-3 flex items-center gap-2 text-xs text-slate-500">
              <div className="flex-1 border-t border-slate-700" />
              <span>{t("auth.orLoginWith")}</span>
              <div className="flex-1 border-t border-slate-700" />
            </div>
            <button
              onClick={onLogin}
              className="w-full rounded-lg border border-slate-600 bg-slate-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-600"
            >
              {t("auth.loginWith", { provider: "SSO" })}
            </button>
          </div>
        )}

        <div className="mt-6 text-center">
          <button
            onClick={toggleLang}
            className="text-sm text-slate-500 transition hover:text-slate-300"
          >
            {i18n.language === "zh-TW" ? "English" : "繁體中文"}
          </button>
        </div>
      </div>
    </div>
  );
}
