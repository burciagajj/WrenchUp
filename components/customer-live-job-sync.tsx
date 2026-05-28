import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { useStore } from "@/lib/store";
import { resolveAuthSession } from "@/lib/resolve-auth-session";
import { fetchDispatchRequest } from "@/lib/live-dispatch";
import type { JobStatus } from "@/lib/types";
import { notifyNow } from "@/lib/notifications";
import { deriveBookedMeta } from "@/lib/booked-trip";

const FAST_POLL_MS = 2000;
const SLOW_POLL_MS = 5000;
const MAX_POLL_MS = 15000;

function toJobStatus(status: string): JobStatus | null {
  if (
    status === "searching" ||
    status === "accepted" ||
    status === "enroute" ||
    status === "arrived" ||
    status === "in_progress" ||
    status === "completed" ||
    status === "cancelled"
  ) {
    return status;
  }
  return null;
}

/**
 * Keeps customer active-job status synchronized with live service_requests updates
 * regardless of which screen is currently visible.
 */
export function CustomerLiveJobSync() {
  const { user } = useAuth();
  const { state, dispatch } = useStore();
  const activeJob = state.activeJobId ? state.jobs.find((j) => j.id === state.activeJobId) ?? null : null;

  const inFlightRef = useRef(false);
  const backoffRef = useRef(FAST_POLL_MS);
  const acceptedBookedNotifiedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user?.id) return;
    if (!activeJob?.id || !activeJob.remoteRequestId) return;

    let alive = true;

    const run = async () => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        const resolved = await resolveAuthSession(user);
        if (!resolved || !alive) return;
        const remote = await fetchDispatchRequest(resolved.sessionToken, activeJob.remoteRequestId!);
        if (!remote || !alive) return;

        const mapped = toJobStatus(remote.status);
        if (mapped && mapped !== activeJob.status) {
          dispatch({
            type: "UPDATE_JOB_STATUS",
            payload: { id: activeJob.id, status: mapped },
          });
        }
        const bookedMeta = deriveBookedMeta(remote.scheduled_for ?? null, remote.customer_note ?? null);
        dispatch({
          type: "UPDATE_JOB_BOOKING_META",
          payload: {
            id: activeJob.id,
            isBooked: bookedMeta.isBooked,
            scheduledFor: bookedMeta.scheduledForMs,
          },
        });
        const becameAccepted = mapped === "accepted" && activeJob.status !== "accepted";
        if (becameAccepted && bookedMeta.isBooked && !acceptedBookedNotifiedRef.current.has(remote.id)) {
          acceptedBookedNotifiedRef.current.add(remote.id);
          const title = "Booked job accepted";
          const body = `${remote.assigned_mechanic_name ?? "Mechanic"} accepted your scheduled service.`;
          dispatch({
            type: "ADD_INBOX_NOTIFICATION",
            payload: {
              id: `customer-booked-accepted-${remote.id}`,
              title,
              body,
              createdAt: Date.now(),
              roleScope: "customer",
              route: "/tracking",
            },
          });
          notifyNow({ title, body, data: { kind: "booked_job_accepted", id: remote.id } });
        }

        if (remote.assigned_mechanic_name) {
          dispatch({
            type: "UPDATE_JOB_ASSIGNMENT",
            payload: {
              id: activeJob.id,
              mechanicName: remote.assigned_mechanic_name,
              mechanicId: remote.assigned_mechanic_user_id ?? activeJob.mechanicId,
            },
          });
        }
        if (typeof remote.mechanic_latitude === "number" && typeof remote.mechanic_longitude === "number") {
          dispatch({
            type: "UPDATE_JOB_MECHANIC_COORDS",
            payload: {
              id: activeJob.id,
              coords: {
                latitude: remote.mechanic_latitude,
                longitude: remote.mechanic_longitude,
              },
            },
          });
        }
        if (remote.mechanic_marked_done_at) {
          dispatch({
            type: "UPDATE_JOB_MECHANIC_DONE_AT",
            payload: { id: activeJob.id, at: Date.parse(remote.mechanic_marked_done_at) || Date.now() },
          });
        }
        // Keep trip-status updates snappy for active service flow.
        if (
          remote.status === "accepted" ||
          remote.status === "enroute" ||
          remote.status === "arrived" ||
          remote.status === "in_progress"
        ) {
          backoffRef.current = FAST_POLL_MS;
        } else {
          backoffRef.current = SLOW_POLL_MS;
        }
      } catch (error) {
        console.error("[CustomerLiveJobSync] Poll failed:", error);
        backoffRef.current = Math.min(MAX_POLL_MS, Math.round(backoffRef.current * 1.6));
      } finally {
        inFlightRef.current = false;
      }
    };

    let timer: ReturnType<typeof setTimeout> | null = null;
    const loop = async () => {
      await run();
      if (!alive) return;
      timer = setTimeout(() => void loop(), backoffRef.current);
    };
    void loop();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [
    user?.id,
    activeJob?.id,
    activeJob?.remoteRequestId,
    activeJob?.status,
    activeJob?.mechanicId,
    dispatch,
    user,
  ]);

  return null;
}
