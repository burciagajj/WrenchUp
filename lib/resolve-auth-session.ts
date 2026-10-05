/**
 * Resolves a valid Supabase access token for profile/vehicle saves.
 * Handles: in-memory cache after signup, SecureStore, and refresh-token recovery.
 */

import type { AuthUser } from "@/lib/auth-context";
import {
  getSessionToken,
  getRefreshToken,
  updateSessionToken,
} from "@/lib/session-tokens";
import { supabaseAuth } from "@/lib/_core/supabase-auth";
import { ensureValidAccessToken } from "@/lib/profile-session";

export type ResolvedSession = {
  sessionToken: string;
  userId: string;
};

export type ResolveSessionError = {
  code: "no_session" | "no_user";
  message: string;
};

const REFRESH_RETRY_BACKOFF_MS = 30_000;
let lastRefreshFailureAt = 0;

/**
 * Obtain session token + user id for authenticated API calls.
 * Returns null with a user-facing message via onError callback.
 */
export async function resolveAuthSession(
  authUser: AuthUser | null | undefined,
  onError?: (err: ResolveSessionError) => void
): Promise<ResolvedSession | null> {
  let sessionToken = await getSessionToken();

  // Keep token valid without hammering refresh endpoint.
  if (sessionToken) {
    try {
      sessionToken = await ensureValidAccessToken(sessionToken);
    } catch (err) {
      console.warn("[resolveAuthSession] Token validation failed:", err);
      sessionToken = null;
    }
  }

  // Recover session via refresh token only when needed and not in backoff.
  if (!sessionToken) {
    const now = Date.now();
    if (now - lastRefreshFailureAt < REFRESH_RETRY_BACKOFF_MS) {
      onError?.({
        code: "no_session",
        message: "Please wait a few seconds and try again.",
      });
      return null;
    }
    const refreshToken = await getRefreshToken();
    if (refreshToken) {
      try {
        console.log("[resolveAuthSession] No access token — trying refresh...");
        const refreshed = await supabaseAuth.refreshSession(refreshToken);
        sessionToken = refreshed.access_token;
        await updateSessionToken(sessionToken, refreshed.refresh_token);
        console.log("[resolveAuthSession] Session recovered via refresh token");
        lastRefreshFailureAt = 0;
      } catch (err) {
        lastRefreshFailureAt = Date.now();
        console.warn("[resolveAuthSession] Refresh failed:", err);
      }
    }
  }

  if (!sessionToken) {
    onError?.({
      code: "no_session",
      message: "Please sign in again to continue.",
    });
    return null;
  }

  let userId = authUser?.id;
  if (!userId) {
    const current = await supabaseAuth.getCurrentUser(sessionToken);
    userId = current?.id;
  }

  if (!userId) {
    onError?.({
      code: "no_user",
      message: "Could not load your account. Please sign in again.",
    });
    return null;
  }

  return { sessionToken, userId };
}
