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

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function UserDataSync() {
  const { user, isLoading: authLoading } = useAuth();
  const { state, dispatch } = useStore();
  const inFlightRef = useRef(false);
  const lastSyncedUserIdRef = useRef<string | null>(null);
  const stateSnapshotRef = useRef({
    jobs: state.jobs,
    mechanicJobs: state.mechanicJobs,
    paymentMethods: state.paymentMethods,
    defaultPaymentMethodId: state.defaultPaymentMethodId,
    recentCancellations: state.recentCancellations,
  });

  useEffect(() => {
    stateSnapshotRef.current = {
      jobs: state.jobs,
      mechanicJobs: state.mechanicJobs,
      paymentMethods: state.paymentMethods,
      defaultPaymentMethodId: state.defaultPaymentMethodId,
      recentCancellations: state.recentCancellations,
    };
  }, [state.jobs, state.mechanicJobs, state.paymentMethods, state.defaultPaymentMethodId, state.recentCancellations]);

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
      fullName: user.fullName,
      displayName: user.displayName,
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

      let done = false;
      const loadTimeout = setTimeout(() => {
        if (!cancelled && !done) {
          console.warn("[UserDataSync] User data load timed out — forcing idle to prevent permanent buffering on home screen");
          dispatch({ type: "SET_USER_DATA_STATUS", payload: "idle" });
        }
      }, 9000);

      try {
        let storedToken = await getSessionToken();
        if (!storedToken) {
          await wait(250);
          storedToken = await getSessionToken();
        }
        if (cancelled || !storedToken) {
          console.log("[UserDataSync] No session token — skipping profile/vehicle load");
          dispatch({ type: "SET_USER_DATA_STATUS", payload: "idle" });
          done = true;
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
        // Merge remote (authoritative for cross-device) with any legacy local-only jobs.
        try {
          const remoteRows = await fetchDispatchHistoryForUser(sessionToken, user.id);
          if (!cancelled && remoteRows.length > 0) {
            const snapshot = stateSnapshotRef.current;
            const recentCancellationIds = [
              ...new Set([
                ...(cachedHistory?.jobs ?? snapshot.jobs)
                  .filter((job) => job.status === "cancelled" && !!job.remoteRequestId)
                  .map((job) => job.remoteRequestId as string),
                ...(cachedHistory?.mechanicJobs ?? snapshot.mechanicJobs)
                  .filter((job) => job.status === "cancelled" && !!job.remoteRequestId)
                  .map((job) => job.remoteRequestId as string),
                ...stateSnapshotRef.current.recentCancellations.map((item) => item.jobId),
              ]),
            ];
            const remoteSnapshot = buildSnapshotFromDispatchRows(
              remoteRows,
              authUser,
              cachedHistory?.paymentMethods ?? snapshot.paymentMethods,
              cachedHistory?.defaultPaymentMethodId ?? snapshot.defaultPaymentMethodId,
              recentCancellationIds,
            );
            // Merge: remote jobs take precedence; keep legacy local jobs that have no remoteRequestId
            const existingJobs = cachedHistory?.jobs ?? snapshot.jobs;
            const localOnlyJobs = existingJobs.filter((j: any) => !j.remoteRequestId);
            const remoteIds = new Set(remoteSnapshot.jobs.map((j: any) => j.remoteRequestId).filter(Boolean));
            const mergedJobs = [
              ...remoteSnapshot.jobs,
              ...localOnlyJobs.filter((j: any) => !j.remoteRequestId || !remoteIds.has(j.remoteRequestId)),
            ];
            const existingMJobs = cachedHistory?.mechanicJobs ?? snapshot.mechanicJobs;
            const localOnlyMJobs = existingMJobs.filter((j: any) => !j.remoteRequestId);
            const remoteMIds = new Set(remoteSnapshot.mechanicJobs.map((j: any) => j.remoteRequestId || j.id).filter(Boolean));
            const mergedMJobs = [
              ...remoteSnapshot.mechanicJobs,
              ...localOnlyMJobs.filter((j: any) => !(j.remoteRequestId && remoteMIds.has(j.remoteRequestId)) && !remoteMIds.has(j.id)),
            ];
            dispatch({
              type: "LOAD_USER_HISTORY",
              payload: {
                ...remoteSnapshot,
                jobs: mergedJobs,
                mechanicJobs: mergedMJobs,
              },
            });
          }
        } catch (remoteErr) {
          console.error("[UserDataSync] Remote job history sync failed:", remoteErr);
        }
        if (!cancelled) {
          lastSyncedUserIdRef.current = user.id;
        }
        done = true;
      } catch (err) {
        console.error("[UserDataSync] Failed to sync user data:", err);
        if (!cancelled) {
          dispatch({ type: "SET_USER_DATA_STATUS", payload: "idle" });
        }
      } finally {
        clearTimeout(loadTimeout);
        inFlightRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    state.hydrated,
    authLoading,
    user?.id,
    user?.email,
    user?.role,
    user?.fullName,
    user?.displayName,
    dispatch,
  ]);

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
