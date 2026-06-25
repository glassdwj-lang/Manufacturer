import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, setToken, clearToken, User } from "@/src/api/client";
import { storage } from "@/src/utils/storage";

type AuthState = {
  user: User | null;
  loading: boolean;
  /**
   * Bumped whenever the signed-in user changes their manual display
   * language. Any screen that caches localized server payloads (orders,
   * step lists, etc.) should listen to this value and re-fetch when it
   * changes — that way the cards on the dashboard, the phase sections on
   * the order detail and the step content all re-localize instantly,
   * without waiting for a navigation event.
   */
  languageVersion: number;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  /**
   * Persist the manual language override on the server, refresh the
   * in-memory user, and bump `languageVersion` so subscribers re-fetch.
   * Pass `null` (or empty) to clear the override and fall back to the
   * country-derived language.
   */
  setLanguage: (lang: string | null) => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

const TOKEN_KEY = "somnio_token";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [languageVersion, setLanguageVersion] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const token = await storage.getItem<string>(TOKEN_KEY, "");
      if (!token) {
        setUser(null);
        return;
      }
      const me = await api.me();
      setUser(me);
    } catch {
      setUser(null);
      await clearToken();
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const signIn = async (email: string, password: string) => {
    const res = await api.login(email, password);
    await setToken(res.access_token);
    setUser(res.user);
  };

  const signOut = async () => {
    await clearToken();
    setUser(null);
  };

  const setLanguage = useCallback(
    async (lang: string | null) => {
      const next = await api.setMyLanguage(lang);
      // Update the user reference immediately so any consumer reading the
      // user object sees the new `preferred_language` right away.
      setUser(next);
      // Bump regardless of whether the value actually changed so a re-pick
      // of the *same* language still kicks off a fresh fetch (useful if a
      // translation came back stale on a previous fetch).
      setLanguageVersion((v) => v + 1);
    },
    []
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        languageVersion,
        signIn,
        signOut,
        refresh,
        setLanguage,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
