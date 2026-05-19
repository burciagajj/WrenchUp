/**
 * Auth Context (v1.6)
 * Manages authentication state, session persistence, and login/logout
 * Now includes user data isolation: loads/clears per-user profile and vehicles
 */

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabaseAuth, type AuthUser } from "./auth-context-types";
import { supabaseUserData } from "./_core/supabase-user-data";
import { useStore } from "./store";
import type { Vehicle } from "./types";

const SESSION_TOKEN_KEY = "wrenchup_session_token";
const AUTH_USER_KEY = "wrenchup_auth_user";

export type AuthContextType = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, role: "customer" | "mechanic") => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Restore session on app launch
  const restoreSession = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Get session token
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

      console.log("[AuthContext] Cached user:", cachedUser);

      if (cachedUser) {
        setUser(cachedUser);
        console.log("[AuthContext] Session restored for user:", cachedUser.email);
      }
    } catch (err) {
      console.error("[AuthContext] Failed to restore session:", err);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Restore session on mount
  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  const saveSession = useCallback(async (authUser: AuthUser, sessionToken: string) => {
    try {
      console.log("[AuthContext] Saving session for:", authUser.email);
      
      // Set user immediately in React state (this is the source of truth)
      setUser(authUser);
      
      // Save user to persistent storage (session token is optional)
      if (Platform.OS === "web") {
        await AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify(authUser));
        if (sessionToken) {
          await AsyncStorage.setItem(SESSION_TOKEN_KEY, sessionToken);
        }
      } else {
        await SecureStore.setItemAsync(AUTH_USER_KEY, JSON.stringify(authUser));
        if (sessionToken) {
          await SecureStore.setItemAsync(SESSION_TOKEN_KEY, sessionToken);
        }
      }
      console.log("[AuthContext] Session saved successfully for", authUser.email);
    } catch (err) {
      console.error("[AuthContext] Failed to save session:", err);
      // User is already set in state, so don't throw
    }
  }, []);

  const clearSession = useCallback(async () => {
    try {
      if (Platform.OS === "web") {
        await AsyncStorage.removeItem(SESSION_TOKEN_KEY);
        await AsyncStorage.removeItem(AUTH_USER_KEY);
      } else {
        await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
        await SecureStore.deleteItemAsync(AUTH_USER_KEY);
      }
      setUser(null);
    } catch (err) {
      console.error("[AuthContext] Failed to clear session:", err);
    }
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      try {
        setError(null);
        const { user: authUser, session } = await supabaseAuth.signIn(email, password);
        await saveSession(authUser, session);
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
        const { user: authUser, session } = await supabaseAuth.signUp(email, password, role);
        await saveSession(authUser, session);
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
    try {
      setError(null);
      await clearSession();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign-out failed";
      setError(message);
      throw err;
    }
  }, [clearSession]);

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
    isAuthenticated: !!user,
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
 * Hook to load user data from Supabase when user logs in
 * Call this in profile-complete.tsx and signin.tsx after auth succeeds
 */
export function useLoadUserData() {
  const { user } = useAuth();
  const { dispatch } = useStore();

  return useCallback(
    async (sessionToken: string) => {
      if (!user) {
        console.log("[useLoadUserData] No user, skipping load");
        return;
      }

      try {
        console.log("[useLoadUserData] Loading data for user:", user.id);

        // Load user profile
        const profile = await supabaseUserData.getOrCreateProfile(
          user.id,
          user.role,
          sessionToken
        );

        // Load user vehicles
        const dbVehicles = await supabaseUserData.getUserVehicles(user.id, sessionToken);

        // Convert DB vehicles to app Vehicle type
        const vehicles: Vehicle[] = dbVehicles.map((v) => ({
          id: v.id,
          nickname: v.nickname,
          year: v.year,
          make: v.make,
          model: v.model,
          color: v.color || "",
          plate: v.plate || "",
        }));

        // Find active vehicle or use first
        const selectedVehicleId = vehicles.find((v) => v.id)?.id ?? vehicles[0]?.id ?? null;

        // Load into store
        dispatch({
          type: "LOAD_USER_DATA",
          payload: {
            userName: profile.name || user.email,
            vehicles,
            selectedVehicleId,
          },
        });

        console.log("[useLoadUserData] Data loaded successfully");
      } catch (err) {
        console.error("[useLoadUserData] Failed to load user data:", err);
        // Don't throw - let app continue with empty data
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
  const { dispatch } = useStore();

  return useCallback(() => {
    console.log("[useClearUserData] Clearing user data");
    dispatch({ type: "CLEAR_USER_DATA" });
  }, [dispatch]);
}
