/**
 * Auth Context (v1.6)
 * Manages authentication state, session persistence, and login/logout
 * Now includes user data isolation: loads/clears per-user profile and vehicles
 */

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabaseAuth } from "@/lib/_core/supabase-auth";
import { syncUserDataToStore } from "@/lib/load-user-data";
import { useStore } from "@/lib/store";
import {
  AUTH_USER_KEY,
  SESSION_TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  setMemorySessionToken,
  setMemoryRefreshToken,
  clearMemoryTokens,
  clearAllPersistedSession,
  getRefreshToken,
  updateSessionToken,
} from "@/lib/session-tokens";
import { ensureValidAccessToken } from "@/lib/profile-session";
import { saveUserHistory } from "@/lib/user-history-cache";

export { getSessionToken, getRefreshToken, updateSessionToken } from "@/lib/session-tokens";

/**
 * Auth user type - matches Supabase auth response
 */
export type AuthUser = {
  id: string;
  email: string;
  role: "customer" | "mechanic";
  profileCompleted: boolean;
  emailConfirmed: boolean;
};

export type AuthContextType = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<AuthUser>;
  signUp: (
    email: string,
    password: string,
    role: "customer" | "mechanic"
  ) => Promise<AuthUser>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [hasSession, setHasSession] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Restore session on app launch
  const restoreSession = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Get session token (may be refreshed below)
      let sessionToken: string | null = null;
      if (Platform.OS === "web") {
        sessionToken = await AsyncStorage.getItem(SESSION_TOKEN_KEY);
      } else {
        sessionToken = await SecureStore.getItemAsync(SESSION_TOKEN_KEY);
      }

      console.log("[AuthContext] Restoring session...", { sessionToken: sessionToken ? "✓ Found" : "✗ Not found" });

      // Note: We don't strictly require a session token; the user object is the source of truth
      if (!sessionToken) {
        console.log("[AuthContext] No session token found, checking for cached user...");
      }

      // Get cached user info
      let cachedUser: AuthUser | null = null;
      if (Platform.OS === "web") {
        const cached = await AsyncStorage.getItem(AUTH_USER_KEY);
        cachedUser = cached ? JSON.parse(cached) : null;
      } else {
        const cached = await SecureStore.getItemAsync(AUTH_USER_KEY);
        cachedUser = cached ? JSON.parse(cached) : null;
      }

      console.log("[AuthContext] Cached user:", cachedUser ? "yes" : "no");

      // Require both user cache and access token — avoids "logged in" UI on fresh devices with stale user only
      if (cachedUser && sessionToken) {
        setMemorySessionToken(sessionToken);
        try {
          const refreshToken = await getRefreshToken();
          if (refreshToken) {
            sessionToken = await ensureValidAccessToken(sessionToken);
            console.log("[AuthContext] Session refreshed on restore");
          }
        } catch (refreshErr) {
          console.warn("[AuthContext] Could not refresh on restore, using stored token:", refreshErr);
        }
        setUser(cachedUser);
        setHasSession(true);
        console.log("[AuthContext] Session restored for user:", cachedUser.email);
      } else {
        if (cachedUser && !sessionToken) {
          console.log("[AuthContext] Stale user cache without token — clearing");
          await clearAllPersistedSession();
        }
        setUser(null);
        setHasSession(false);
      }
    } catch (err) {
      console.error("[AuthContext] Failed to restore session:", err);
      setUser(null);
      setHasSession(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Restore session on mount
  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  const saveSession = useCallback(async (authUser: AuthUser, sessionToken: string, refreshToken?: string) => {
    try {
      console.log("[AuthContext] Saving session for:", authUser.email, {
        hasAccessToken: !!sessionToken,
        hasRefreshToken: !!refreshToken,
      });

      setUser(authUser);

      // Cache in memory first so profile-complete can read token immediately after navigate
      if (sessionToken) {
        setMemorySessionToken(sessionToken);
        setHasSession(true);
      } else {
        setHasSession(false);
      }
      if (refreshToken) setMemoryRefreshToken(refreshToken);

      if (Platform.OS === "web") {
        await AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify(authUser));
        if (sessionToken) {
          await AsyncStorage.setItem(SESSION_TOKEN_KEY, sessionToken);
        }
        if (refreshToken) {
          await AsyncStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
        }
      } else {
        await SecureStore.setItemAsync(AUTH_USER_KEY, JSON.stringify(authUser));
        if (sessionToken) {
          await SecureStore.setItemAsync(SESSION_TOKEN_KEY, sessionToken);
        }
        if (refreshToken) {
          await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
        }
      }
      console.log("[AuthContext] Session saved successfully for", authUser.email);
    } catch (err) {
      console.error("[AuthContext] Failed to save session:", err);
    }
  }, []);

  const clearSession = useCallback(async () => {
    clearMemoryTokens();
    setUser(null);
    setHasSession(false);
    try {
      await clearAllPersistedSession();
      console.log("[AuthContext] Session cleared from memory and storage");
    } catch (err) {
      console.error("[AuthContext] Failed to clear session storage:", err);
      throw err;
    }
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      try {
        setError(null);
        const { user: authUser, session, refreshToken } = await supabaseAuth.signIn(email, password);
        await saveSession(authUser, session, refreshToken);
        console.log("[AuthContext] Sign-in complete for", authUser.email);
        return authUser;
      } catch (err: any) {
        const message = err?.message || (err instanceof Error ? err.message : "Sign-in failed");
        console.error("[AuthContext] Sign-in error:", err);
        setError(message);
        throw err;
      }
    },
    [saveSession]
  );

  const signUp = useCallback(
    async (email: string, password: string, role: "customer" | "mechanic") => {
      try {
        setError(null);
        const { user: authUser, session, refreshToken } = await supabaseAuth.signUp(
          email,
          password,
          role
        );
        await saveSession(authUser, session, refreshToken);
        return authUser;
      } catch (err: any) {
        const message = err?.message || (err instanceof Error ? err.message : "Sign-up failed");
        console.error("[AuthContext] Sign-up error:", err);
        setError(message);
        throw err;
      }
    },
    [saveSession]
  );

  const signOut = useCallback(async () => {
    setError(null);
    clearMemoryTokens();
    setUser(null);
    setHasSession(false);
    try {
      await clearAllPersistedSession();
      console.log("[AuthContext] Sign-out complete");
    } catch (err) {
      console.error("[AuthContext] Sign-out storage clear failed:", err);
      const message = err instanceof Error ? err.message : "Sign-out failed";
      setError(message);
      throw err;
    }
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    try {
      setError(null);
      await supabaseAuth.resetPassword(email);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Password reset failed";
      setError(message);
      throw err;
    }
  }, []);

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user && hasSession,
    isLoading,
    error,
    signIn,
    signUp,
    signOut,
    resetPassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

/**
 * Returns a function that loads profile + vehicles from Supabase into the store.
 * Call after login, profile-complete, or any time the session token is known.
 *
 * Pass `authUserOverride` right after sign-in when React `user` state may still be stale.
 */
export function useLoadUserData() {
  const { user } = useAuth();
  const { dispatch } = useStore();

  return useCallback(
    async (sessionToken: string, authUserOverride?: AuthUser) => {
      const authUser = authUserOverride ?? user;
      if (!authUser?.id) {
        console.log("[useLoadUserData] No user, skipping load");
        return;
      }

      try {
        await syncUserDataToStore(dispatch, authUser, sessionToken);
      } catch (err) {
        console.error("[useLoadUserData] Failed to load user data:", err);
        // Don't throw — let the screen show its own error if needed
      }
    },
    [user, dispatch]
  );
}

/**
 * Hook to clear user data when user logs out
 * Call this in profile.tsx logout handler
 */
export function useClearUserData() {
  const { user } = useAuth();
  const { state, dispatch } = useStore();

  return useCallback(async () => {
    if (user?.id) {
      await saveUserHistory(user.id, {
        jobs: state.jobs,
        activeJobId: state.activeJobId,
        mechanicJobs: state.mechanicJobs,
        mechanicActiveJobId: state.mechanicActiveJobId,
        paymentMethods: state.paymentMethods,
        defaultPaymentMethodId: state.defaultPaymentMethodId,
      });
    }
    console.log("[useClearUserData] Clearing user data");
    dispatch({ type: "CLEAR_USER_DATA" });
  }, [
    user?.id,
    state.jobs,
    state.activeJobId,
    state.mechanicJobs,
    state.mechanicActiveJobId,
    state.paymentMethods,
    state.defaultPaymentMethodId,
    dispatch,
  ]);
}
