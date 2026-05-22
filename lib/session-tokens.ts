/**
 * Supabase session token storage (no React — safe for supabase-user-data imports).
 * Breaks require cycle: auth-context → load-user-data → supabase-user-data.
 */

import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const SESSION_TOKEN_KEY = "wrenchup_session_token";
export const REFRESH_TOKEN_KEY = "wrenchup_refresh_token";
export const AUTH_USER_KEY = "wrenchup_auth_user";

let memorySessionToken: string | null = null;
let memoryRefreshToken: string | null = null;

export function setMemorySessionToken(token: string | null): void {
  memorySessionToken = token;
}

export function setMemoryRefreshToken(token: string | null): void {
  memoryRefreshToken = token;
}

export function clearMemoryTokens(): void {
  memorySessionToken = null;
  memoryRefreshToken = null;
}

const SESSION_KEYS = [SESSION_TOKEN_KEY, REFRESH_TOKEN_KEY, AUTH_USER_KEY] as const;

/**
 * Remove all auth tokens from memory, SecureStore, and AsyncStorage.
 * Clears both native stores so nothing can restore a stale session after logout.
 */
export async function clearAllPersistedSession(): Promise<void> {
  clearMemoryTokens();

  const removeSecure = SESSION_KEYS.map((key) =>
    SecureStore.deleteItemAsync(key).catch(() => {})
  );
  const removeAsync = AsyncStorage.multiRemove([...SESSION_KEYS]).catch(() => {});

  if (Platform.OS === "web") {
    await removeAsync;
    return;
  }

  await Promise.all([...removeSecure, removeAsync]);
}

export async function getSessionToken(): Promise<string | null> {
  if (memorySessionToken) return memorySessionToken;
  try {
    if (Platform.OS === "web") {
      return await AsyncStorage.getItem(SESSION_TOKEN_KEY);
    }
    return await SecureStore.getItemAsync(SESSION_TOKEN_KEY);
  } catch (err) {
    console.error("[session-tokens] Failed to get session token:", err);
    return null;
  }
}

export async function getRefreshToken(): Promise<string | null> {
  if (memoryRefreshToken) return memoryRefreshToken;
  try {
    if (Platform.OS === "web") {
      return await AsyncStorage.getItem(REFRESH_TOKEN_KEY);
    }
    return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  } catch (err) {
    console.error("[session-tokens] Failed to get refresh token:", err);
    return null;
  }
}

export async function updateSessionToken(
  newToken: string,
  newRefreshToken?: string
): Promise<void> {
  try {
    memorySessionToken = newToken;
    if (newRefreshToken) memoryRefreshToken = newRefreshToken;
    if (Platform.OS === "web") {
      await AsyncStorage.setItem(SESSION_TOKEN_KEY, newToken);
      if (newRefreshToken) {
        await AsyncStorage.setItem(REFRESH_TOKEN_KEY, newRefreshToken);
      }
    } else {
      await SecureStore.setItemAsync(SESSION_TOKEN_KEY, newToken);
      if (newRefreshToken) {
        await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, newRefreshToken);
      }
    }
  } catch (err) {
    console.error("[session-tokens] Failed to update session token:", err);
  }
}
