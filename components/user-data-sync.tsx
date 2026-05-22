/**
 * Keeps profile (name, avatar) + vehicles in sync with Supabase when authenticated.
 * Runs after store hydration to avoid HYDRATE overwriting freshly loaded data.
 */

import { useEffect, useRef } from "react";
import { useAuth, getSessionToken } from "@/lib/auth-context";
import { ensureValidAccessToken } from "@/lib/profile-session";
import { syncUserDataToStore } from "@/lib/load-user-data";
import { useStore } from "@/lib/store";

export function UserDataSync() {
  const { user, isLoading: authLoading } = useAuth();
  const { state, dispatch } = useStore();
  const inFlightRef = useRef(false);
  const lastSyncedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Wait until persisted local state is applied before writing Supabase data
    if (!state.hydrated || authLoading) return;

    if (!user?.id) {
      lastSyncedUserIdRef.current = null;
      return;
    }

    // Different account signed in — drop cached profile/vehicles before fetching
    if (
      lastSyncedUserIdRef.current &&
      lastSyncedUserIdRef.current !== user.id
    ) {
      dispatch({ type: "CLEAR_USER_DATA" });
      lastSyncedUserIdRef.current = null;
    }

    // Skip if already synced this session (cleared on logout when user becomes null)
    if (lastSyncedUserIdRef.current === user.id || inFlightRef.current) return;

    let cancelled = false;

    (async () => {
      inFlightRef.current = true;
      dispatch({ type: "SET_USER_DATA_STATUS", payload: "loading" });
      try {
        const storedToken = await getSessionToken();
        if (cancelled || !storedToken) {
          console.log("[UserDataSync] No session token — skipping profile/vehicle load");
          dispatch({ type: "SET_USER_DATA_STATUS", payload: "idle" });
          return;
        }

        const sessionToken = await ensureValidAccessToken(storedToken);
        if (cancelled) return;

        await syncUserDataToStore(dispatch, user, sessionToken);
        if (!cancelled) {
          lastSyncedUserIdRef.current = user.id;
        }
      } catch (err) {
        console.error("[UserDataSync] Failed to sync user data:", err);
        if (!cancelled) {
          dispatch({ type: "SET_USER_DATA_STATUS", payload: "idle" });
        }
      } finally {
        inFlightRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [state.hydrated, authLoading, user?.id, user?.email, user?.role, dispatch]);

  return null;
}
