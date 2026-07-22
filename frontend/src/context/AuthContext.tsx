// Auth state provider. Stores JWT in secure storage; loads /api/auth/me on boot.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";

import { api, TOKEN_KEY } from "@/src/api/client";
import { storage } from "@/src/utils/storage";

export type User = {
  user_id: string;
  email: string;
  username: string;
  coins: number;
  avatar: string;
  created_at: string;
  streak_days?: number;
  best_streak?: number;
  phone?: string | null;
};

type AuthState = {
  user: User | null;
  loading: boolean;
  signup: (email: string, password: string, username: string, phone?: string, referralCode?: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (sessionId: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  patchCoins: (delta: number) => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const bootstrap = useCallback(async () => {
    try {
      // Web: if Emergent Google redirect returned us with #session_id=..., exchange it first.
      if (Platform.OS === "web" && typeof window !== "undefined") {
        const params = new URLSearchParams(
          (window.location.hash || "").replace(/^#/, "") ||
          (window.location.search || "").replace(/^\?/, ""),
        );
        const sessionId = params.get("session_id");
        if (sessionId) {
          try {
            const res = await api.post<{ token: string; user: User }>(
              "/api/auth/google-session",
              { session_id: sessionId },
            );
            await storage.secureSet(TOKEN_KEY, res.token);
            setUser(res.user);
            window.history.replaceState(null, "", window.location.pathname);
            return;
          } catch { /* fall through */ }
          window.history.replaceState(null, "", window.location.pathname);
        }
      }
      const token = await storage.secureGet(TOKEN_KEY, "");
      if (!token) {
        setUser(null);
        return;
      }
      const me = await api.get<User>("/api/auth/me");
      setUser(me);
    } catch {
      await storage.secureRemove(TOKEN_KEY);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { bootstrap(); }, [bootstrap]);

  const persistToken = async (token: string) => {
    await storage.secureSet(TOKEN_KEY, token);
  };

  const signup = async (email: string, password: string, username: string, phone?: string, referralCode?: string) => {
    const res = await api.post<{ token: string; user: User }>("/api/auth/signup", {
      email, password, username, phone: phone || undefined,
      referral_code: referralCode?.trim() || undefined,
    });
    await persistToken(res.token);
    setUser(res.user);
  };

  const login = async (email: string, password: string) => {
    const res = await api.post<{ token: string; user: User }>("/api/auth/login", { email, password });
    await persistToken(res.token);
    setUser(res.user);
  };

  const loginWithGoogle = async (sessionId: string) => {
    const res = await api.post<{ token: string; user: User }>("/api/auth/google-session", { session_id: sessionId });
    await persistToken(res.token);
    setUser(res.user);
  };

  const logout = async () => {
    await storage.secureRemove(TOKEN_KEY);
    setUser(null);
    // Also invalidate any cached in-memory state consumers hold; screens react
    // via context, but per-screen useState (e.g. Profile.data) will be
    // unmounted by the tab-layout redirect that fires when user turns null.
  };

  const refresh = async () => {
    try {
      const me = await api.get<User>("/api/auth/me");
      setUser(me);
    } catch { /* silent */ }
  };

  const patchCoins = (delta: number) => {
    setUser((u) => (u ? { ...u, coins: u.coins + delta } : u));
  };

  const value = useMemo(
    () => ({ user, loading, signup, login, loginWithGoogle, logout, refresh, patchCoins }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}

export const noopPlatform = Platform.OS; // keep import used
