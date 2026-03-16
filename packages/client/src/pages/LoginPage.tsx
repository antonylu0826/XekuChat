import { useTranslation } from "react-i18next";

interface LoginPageProps {
  onLogin: () => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const { t, i18n } = useTranslation();

  const toggleLang = () => {
    i18n.changeLanguage(i18n.language === "zh-TW" ? "en" : "zh-TW");
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
