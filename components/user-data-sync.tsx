/**
 * Keeps profile (name, avatar) + vehicles in sync with Supabase when authenticated.
 * Runs after store hydration to avoid HYDRATE overwriting freshly loaded data.
 */

import { useEffect, useRef } from "react";
import { useAuth, getSessionToken } from "@/lib/auth-context";
import { ensureValidAccessToken } from "@/lib/profile-session";
import { syncUserDataToStore } from "@/lib/load-user-data";
import { useStore } from "@/lib/store";
import { loadUserHistory, saveUserHistory } from "@/lib/user-history-cache";
import { loadVehicleApprovals } from "@/lib/vehicle-approvals";
import { fetchDispatchHistoryForUser } from "@/lib/live-dispatch";
import { buildSnapshotFromDispatchRows } from "@/lib/remote-job-history";

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
      dispatch({ type: "SET_DASHBOARD_ROLE_OVERRIDE", payload: null });
      return;
    }

    const authUser = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    // Always align app role with authenticated account role.
    dispatch({ type: "SET_ROLE", payload: authUser.role });

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

        const syncResult = await syncUserDataToStore(dispatch, authUser, sessionToken);
        const vehicleApprovals = await loadVehicleApprovals(user.id);
        if (!cancelled && Object.keys(vehicleApprovals).length > 0) {
          // Preserve locally-cached approval/doc values for specific vehicles when DB values are missing.
          const fallbackByVehicle = Object.fromEntries(
            syncResult.vehicles
              .filter((v) => !v.approvalStatus && !v.insuranceDocUri && !v.registrationStickerUri)
              .map((v) => [v.id, vehicleApprovals[v.id]])
              .filter(([, patch]) => !!patch)
          );
          if (Object.keys(fallbackByVehicle).length > 0) {
            dispatch({ type: "MERGE_VEHICLE_APPROVALS", payload: fallbackByVehicle });
          }
        }
        const cachedHistory = await loadUserHistory(user.id);
        if (!cancelled && cachedHistory) {
          dispatch({ type: "LOAD_USER_HISTORY", payload: cachedHistory });
        }
        // Critical: rebuild jobs/history from Supabase so progress survives device changes.
        try {
          const remoteRows = await fetchDispatchHistoryForUser(sessionToken, user.id);
          if (!cancelled && remoteRows.length > 0) {
            const remoteSnapshot = buildSnapshotFromDispatchRows(
              remoteRows,
              authUser,
              cachedHistory?.paymentMethods ?? state.paymentMethods,
              cachedHistory?.defaultPaymentMethodId ?? state.defaultPaymentMethodId,
            );
            dispatch({ type: "LOAD_USER_HISTORY", payload: remoteSnapshot });
          }
        } catch (remoteErr) {
          console.error("[UserDataSync] Remote job history sync failed:", remoteErr);
        }
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
  }, [state.hydrated, authLoading, user?.id, user?.email, user?.role, dispatch, state.paymentMethods, state.defaultPaymentMethodId]);

  useEffect(() => {
    if (!state.hydrated) return;
    if (!user?.id) return;
    if (lastSyncedUserIdRef.current !== user.id) return;

    void saveUserHistory(user.id, {
      jobs: state.jobs,
      activeJobId: state.activeJobId,
      mechanicJobs: state.mechanicJobs,
      mechanicActiveJobId: state.mechanicActiveJobId,
      paymentMethods: state.paymentMethods,
      defaultPaymentMethodId: state.defaultPaymentMethodId,
    });
  }, [
    state.hydrated,
    user?.id,
    state.jobs,
    state.activeJobId,
    state.mechanicJobs,
    state.mechanicActiveJobId,
    state.paymentMethods,
    state.defaultPaymentMethodId,
  ]);

  return null;
}
