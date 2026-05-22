/**
 * Shared session helpers for profile / vehicle API calls.
 * Refreshes Supabase JWT before requests and on PGRST303 "JWT expired".
 */

import { supabaseAuth } from "@/lib/_core/supabase-auth";
import { getSessionToken, getRefreshToken, updateSessionToken } from "@/lib/session-tokens";

/** Read Supabase access token (memory cache + SecureStore). */
export async function getProfileSessionToken(): Promise<string | null> {
  return getSessionToken();
}

/** True when PostgREST reports an expired or invalid JWT. */
export function isJwtExpiredError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as {
    code?: string;
    message?: string;
    details?: { code?: string; message?: string };
  };
  const code = e.code ?? e.details?.code ?? "";
  const msg = (e.message ?? e.details?.message ?? "").toLowerCase();
  return (
    code === "PGRST303" ||
    code === "401" ||
    msg.includes("jwt expired") ||
    msg.includes("invalid jwt")
  );
}

/** Exchange refresh token for a new access token and persist both. */
export async function refreshAccessToken(): Promise<string> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) {
    throw new Error("No refresh token available. Please sign in again.");
  }

  console.log("[profile-session] Refreshing Supabase session...");
  const refreshResult = await supabaseAuth.refreshSession(refreshToken);
  await updateSessionToken(refreshResult.access_token, refreshResult.refresh_token);
  console.log("[profile-session] Session refreshed successfully");
  return refreshResult.access_token;
}

/**
 * Return a valid access token for PostgREST calls.
 * Proactively refreshes when a refresh token is stored (avoids PGRST303 on cold start).
 */
export async function ensureValidAccessToken(
  currentToken?: string | null
): Promise<string> {
  const refreshToken = await getRefreshToken();
  if (refreshToken) {
    try {
      return await refreshAccessToken();
    } catch (err) {
      console.warn("[profile-session] Proactive refresh failed:", err);
      const fallback = currentToken ?? (await getSessionToken());
      if (fallback) return fallback;
      throw err;
    }
  }

  const token = currentToken ?? (await getSessionToken());
  if (!token) {
    throw new Error("No session token. Please sign in again.");
  }
  return token;
}

/** @deprecated Use ensureValidAccessToken — kept for existing call sites */
export async function refreshProfileSessionToken(
  sessionToken: string
): Promise<string> {
  return ensureValidAccessToken(sessionToken);
}
