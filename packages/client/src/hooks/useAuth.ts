import { useState, useEffect, useCallback } from "react";
import type { UserProfile } from "@xekuchat/core";

interface AuthState {
  user: UserProfile | null;
  token: string | null;
  loading: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    loading: true,
  });

  // Check for token in URL (after OIDC callback redirect)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get("token");
    if (urlToken) {
      sessionStorage.setItem("access_token", urlToken);
      window.history.replaceState({}, "", window.location.pathname);
    }

    const token = urlToken || sessionStorage.getItem("access_token");
    if (token) {
      fetchUser(token);
    } else {
      setState((s) => ({ ...s, loading: false }));
    }
  }, []);

  async function fetchUser(token: string) {
    try {
      const res = await fetch("/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const { data } = await res.json();
        setState({ user: data, token, loading: false });
      } else {
        // Try refresh
        const refreshed = await refreshToken();
        if (!refreshed) {
          sessionStorage.removeItem("access_token");
          setState({ user: null, token: null, loading: false });
        }
      }
    } catch {
      sessionStorage.removeItem("access_token");
      setState({ user: null, token: null, loading: false });
    }
  }

  async function refreshToken(): Promise<boolean> {
    try {
      const res = await fetch("/auth/refresh", { method: "POST", credentials: "include" });
      if (res.ok) {
        const { accessToken } = await res.json();
        sessionStorage.setItem("access_token", accessToken);
        await fetchUser(accessToken);
        return true;
      }
    } catch {}
    return false;
  }

  const login = useCallback(() => {
    window.location.href = "/auth/login";
  }, []);

  const localLogin = useCallback(async (email: string, password: string): Promise<string | null> => {
    try {
      const res = await fetch("/auth/local-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json();
      if (body.success && body.data.accessToken) {
        sessionStorage.setItem("access_token", body.data.accessToken);
        await fetchUser(body.data.accessToken);
        return null;
      }
      return body.error || "Login failed";
    } catch {
      return "Login failed";
    }
  }, []);

  const logout = useCallback(async () => {
    await fetch("/auth/logout", { method: "POST", credentials: "include" });
    sessionStorage.removeItem("access_token");
    setState({ user: null, token: null, loading: false });
  }, []);

  return { ...state, login, localLogin, logout };
}
