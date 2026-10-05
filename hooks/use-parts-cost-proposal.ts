import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { resolveAuthSession } from "@/lib/resolve-auth-session";
import { fetchDispatchRequest, isNetworkUnavailableError } from "@/lib/live-dispatch";
import type { RegionCode } from "@/lib/types";
import type { StripeCurrency } from "@/lib/stripe";

export type PartsCostProposal = {
  partsCost: number;
  currency: StripeCurrency;
  region: RegionCode;
};

/**
 * Small, self-contained poll of the raw service_requests row for the parts
 * reimbursement fields (see lib/live-dispatch.ts's proposePartsCost) —
 * deliberately separate from customer-live-job-sync.tsx's applyRemoteUpdate
 * pipeline rather than threading parts_* through the Job/store shape, so
 * this stays additive and doesn't risk regressing that already-tested sync.
 * Only polls while there's actually a request id to watch.
 */
export function usePartsCostProposal(requestId: string | null | undefined, pollMs = 6000) {
  const { user } = useAuth();
  const [proposal, setProposal] = useState<PartsCostProposal | null>(null);
  const inFlightRef = useRef(false);

  const reload = useCallback(async () => {
    if (!requestId || !user?.id) {
      setProposal(null);
      return;
    }
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const resolved = await resolveAuthSession(user);
      if (!resolved) return;
      const remote = await fetchDispatchRequest(resolved.sessionToken, requestId);
      if (remote?.parts_payment_status === "proposed" && typeof remote.parts_cost === "number" && remote.parts_cost > 0) {
        setProposal({
          partsCost: remote.parts_cost,
          currency: remote.currency?.toLowerCase() === "mxn" ? "mxn" : "usd",
          region: remote.region_code === "MX" ? "MX" : "US",
        });
      } else {
        setProposal(null);
      }
    } catch (error) {
      if (!isNetworkUnavailableError(error)) {
        console.warn("[usePartsCostProposal] load failed:", error);
      }
    } finally {
      inFlightRef.current = false;
    }
  }, [requestId, user?.id]);

  useEffect(() => {
    if (!requestId || !user?.id) {
      setProposal(null);
      return;
    }
    let alive = true;
    void reload();
    const timer = setInterval(() => {
      if (alive) void reload();
    }, pollMs);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [requestId, user?.id, pollMs, reload]);

  return { proposal, reload };
}
