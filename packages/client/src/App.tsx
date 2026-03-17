import { Routes, Route, useLocation } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import { LoginPage } from "./pages/LoginPage";
import { HomePage } from "./pages/HomePage";
import { AdminPage } from "./pages/AdminPage";
import { AdminLoginPage } from "./pages/AdminLoginPage";

// Shown on mobile when user rotates to landscape — iOS PWA ignores manifest orientation lock
function LandscapeBlocker() {
  return (
    <div className="landscape-blocker fixed inset-0 z-[9999] flex-col items-center justify-center gap-4 bg-slate-900 text-white">
      <div className="text-5xl">↩️</div>
      <p className="text-lg font-semibold">請旋轉至直向模式</p>
      <p className="text-sm text-slate-400">此應用程式不支援橫向顯示</p>
    </div>
  );
}

export function App() {
  const { user, token, loading, login, localLogin, logout } = useAuth();
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith("/admin");

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-900 text-white">
        <div className="animate-pulse text-lg">Loading...</div>
      </div>
    );
  }

  // Admin routes: use local admin login, not SSO
  if (isAdminRoute) {
    if (!user) {
      return <AdminLoginPage onLogin={() => window.location.reload()} />;
    }
    if (!user.isSuperAdmin) {
      return (
        <div className="flex h-full items-center justify-center bg-slate-900 text-white">
          <div className="text-center">
            <p className="text-lg">Access Denied</p>
            <a href="/" className="mt-4 block text-sm text-slate-400 hover:text-white">← Back</a>
          </div>
        </div>
      );
    }
    return (
      <Routes>
        <Route path="/admin/*" element={<AdminPage user={user} token={token!} onLogout={logout} />} />
      </Routes>
    );
  }

  // Main chat routes: use SSO
  if (!user) {
    return <LoginPage onLogin={login} onLocalLogin={localLogin} />;
  }

  return (
    <>
      <LandscapeBlocker />
      <Routes>
        <Route path="/*" element={<HomePage user={user} onLogout={logout} />} />
      </Routes>
    </>
  );
}
