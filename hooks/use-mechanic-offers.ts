import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { resolveAuthSession } from "@/lib/resolve-auth-session";
import { fetchMechanicOffers, isNetworkUnavailableError } from "@/lib/live-dispatch";
import type { MechanicOffer } from "@/lib/mechanic-offer";
import type { Job } from "@/lib/types";

/**
 * Polls the stacked list of every mechanic offer received on a request —
 * shared by the tracking/request-pending "Offers from mechanics" button and
 * the dedicated offers screen so the count and the detail list never drift
 * apart.
 *
 * Only polls while the request is still "searching" (once matched, there's
 * nothing left to negotiate) — but deliberately keeps whatever was already
 * fetched even after status changes (e.g. the trip gets cancelled), so a
 * screen showing this list can still render those offers as expired/
 * non-clickable instead of them vanishing. The list is only cleared when the
 * underlying request itself changes (a different job, or none at all).
 */
export function useMechanicOffers(job: Job | null | undefined, pollMs = 7000) {
  const { user } = useAuth();
  const [offers, setOffers] = useState<MechanicOffer[]>([]);
  const inFlightRef = useRef(false);
  const requestIdRef = useRef<string | undefined>(undefined);

  const reload = useCallback(async () => {
    if (!job?.remoteRequestId || !user?.id) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const resolved = await resolveAuthSession(user);
      if (!resolved) return;
      const next = await fetchMechanicOffers(resolved.sessionToken, job.remoteRequestId);
      setOffers(next);
    } catch (error) {
      if (!isNetworkUnavailableError(error)) {
        console.warn("[useMechanicOffers] load failed:", error);
      }
    } finally {
      inFlightRef.current = false;
    }
  }, [job?.remoteRequestId, user?.id]);

  // Drop stale offers only when we've switched to a different request (or
  // lost the job entirely) — not on every status change.
  useEffect(() => {
    if (job?.remoteRequestId !== requestIdRef.current) {
      requestIdRef.current = job?.remoteRequestId;
      setOffers([]);
    }
  }, [job?.remoteRequestId]);

  useEffect(() => {
    if (!job?.remoteRequestId || job.status !== "searching" || !user?.id) return;
    let alive = true;
    void reload();
    const timer = setInterval(() => {
      if (alive) void reload();
    }, pollMs);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [job?.remoteRequestId, job?.status, user?.id, pollMs, reload]);

  return { offers, reload };
}
