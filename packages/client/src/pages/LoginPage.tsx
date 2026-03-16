import { useState } from "react";
import { useTranslation } from "react-i18next";

interface LoginPageProps {
  onLogin: () => void;
}

const isDev = import.meta.env.DEV;

export function LoginPage({ onLogin }: LoginPageProps) {
  const { t, i18n } = useTranslation();
  const [devName, setDevName] = useState("Test User");
  const [devEmail, setDevEmail] = useState("test@example.com");
  const [loading, setLoading] = useState(false);

  const toggleLang = () => {
    i18n.changeLanguage(i18n.language === "zh-TW" ? "en" : "zh-TW");
  };

  const handleDevLogin = async () => {
    setLoading(true);
    try {
      const res = await fetch("/auth/test-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: devEmail, name: devName }),
      });
      const body = await res.json();
      if (body.success && body.data.token) {
        sessionStorage.setItem("access_token", body.data.token);
        window.location.reload();
      }
    } catch (err) {
      console.error("Dev login failed:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-slate-900">
      <div className="w-full max-w-sm rounded-2xl bg-slate-800 p-8 shadow-xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-white">{t("app.name")}</h1>
          <p className="mt-2 text-slate-400">{t("app.tagline")}</p>
        </div>

        <button
          onClick={onLogin}
          className="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white transition hover:bg-blue-500"
        >
          {t("auth.login")}
        </button>

        {/* Dev quick login — only in development */}
        {isDev && (
          <div className="mt-6 border-t border-slate-700 pt-6">
            <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wider text-yellow-500">
              {t("auth.devLogin")}
            </p>
            <input
              type="text"
              value={devName}
              onChange={(e) => setDevName(e.target.value)}
              placeholder={t("auth.devName")}
              className="mb-2 w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white placeholder-slate-400 focus:border-yellow-500 focus:outline-none"
            />
            <input
              type="email"
              value={devEmail}
              onChange={(e) => setDevEmail(e.target.value)}
              placeholder={t("auth.devEmail")}
              className="mb-3 w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white placeholder-slate-400 focus:border-yellow-500 focus:outline-none"
            />
            <button
              onClick={handleDevLogin}
              disabled={loading || !devName || !devEmail}
              className="w-full rounded-lg bg-yellow-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-yellow-500 disabled:opacity-50"
            >
              {loading ? t("auth.loggingIn") : t("auth.devLogin")}
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
