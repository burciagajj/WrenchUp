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

export type ResolvedSession = {
  sessionToken: string;
  userId: string;
};

export type ResolveSessionError = {
  code: "no_session" | "no_user";
  message: string;
};

/**
 * Obtain session token + user id for authenticated API calls.
 * Returns null with a user-facing message via onError callback.
 */
export async function resolveAuthSession(
  authUser: AuthUser | null | undefined,
  onError?: (err: ResolveSessionError) => void
): Promise<ResolvedSession | null> {
  let sessionToken = await getSessionToken();

  // Recover session via refresh token (e.g. access token not returned on signup)
  if (!sessionToken) {
    const refreshToken = await getRefreshToken();
    if (refreshToken) {
      try {
        console.log("[resolveAuthSession] No access token — trying refresh...");
        const refreshed = await supabaseAuth.refreshSession(refreshToken);
        sessionToken = refreshed.access_token;
        await updateSessionToken(sessionToken, refreshed.refresh_token);
        console.log("[resolveAuthSession] Session recovered via refresh token");
      } catch (err) {
        console.warn("[resolveAuthSession] Refresh failed:", err);
      }
    }
  } else {
    // Refresh if we have a refresh token (keeps token valid)
    try {
      const refreshToken = await getRefreshToken();
      if (refreshToken) {
        const refreshed = await supabaseAuth.refreshSession(refreshToken);
        sessionToken = refreshed.access_token;
        await updateSessionToken(sessionToken, refreshed.refresh_token);
      }
    } catch {
      // Keep existing access token
    }
  }

  if (!sessionToken) {
    const needsVerify = authUser && !authUser.emailConfirmed;
    onError?.({
      code: "no_session",
      message: needsVerify
        ? "Please verify your email, then sign in to complete your profile."
        : "Please sign in again to continue.",
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
