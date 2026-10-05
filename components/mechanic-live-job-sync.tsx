import { useCallback, useEffect, useMemo, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useAuth } from "@/lib/auth-context";
import { useStore } from "@/lib/store";
import { resolveAuthSession } from "@/lib/resolve-auth-session";
import { fetchDispatchRequest, setMechanicPresence, type DispatchRequest } from "@/lib/live-dispatch";
import { getSupabaseRealtimeClient } from "@/lib/supabase-realtime";
import {
  buildMechanicJobFromDispatchRequest,
  isIncomingDispatchForMechanic,
  mechanicAlreadyHasRequest,
  mechanicHasBlockingJob,
} from "@/lib/mechanic-dispatch-job";
import { notifyNow } from "@/lib/notifications";
import { getServiceType } from "@/lib/seed";
import { haptic } from "@/lib/haptics";
import { useLocaleContext } from "@/hooks/use-locale";
import { Alert, AppState, type AppStateStatus } from "react-native";
import { PRESENCE_HEARTBEAT_MS } from "@/lib/mechanic-presence-core";

const ASSIGNED_JOB_POLL_MS = 5000;

function isMechanicJobWatchable(status: string): boolean {
  return (
    status === "pending" ||
    status === "upcoming" ||
    status === "heading_there" ||
    status === "arrived" ||
    status === "in_progress"
  );
}

function parseDateMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function notifyCustomerServiceOffer(
  remote: DispatchRequest,
  jobId: string,
  input: {
    dispatch: ReturnType<typeof useStore>["dispatch"];
  },
) {
  const customerName = remote.customer_name?.trim() || "Customer";
  const body = `${customerName} has offered you their requested service, accept or decline`;
  const route = `/mechanic/incoming?id=${encodeURIComponent(jobId)}`;
  input.dispatch({
    type: "ADD_INBOX_NOTIFICATION",
    payload: {
      id: `customer-service-offer-${remote.id}`,
      title: "Service offered",
      body,
      createdAt: Date.now(),
      roleScope: "mechanic",
      route,
      actionType: "customer_service_offer",
      requestId: remote.id,
    },
  });
  notifyNow({
    title: "Service offered",
    body,
    data: {
      kind: "customer_service_offer",
      requestId: remote.id,
      route,
    },
  });
  haptic.medium();
}

function notifyMechanicCustomerCancelled(
  remote: DispatchRequest,
  existingJob: { id: string; isBooked?: boolean; status: string },
  input: {
    dispatch: ReturnType<typeof useStore>["dispatch"];
  },
) {
  const customerName = remote.customer_name?.trim() || "Customer";
  const serviceName = getServiceType(remote.service_code)?.name ?? "service";
  const mechanicHasStartedTrip = ["heading_there", "arrived", "in_progress"].includes(
    existingJob.status,
  );
  const title = mechanicHasStartedTrip
    ? "Trip cancelled by customer"
    : existingJob.isBooked
      ? "Booked service cancelled"
      : "Service no longer available";
  const body = mechanicHasStartedTrip
    ? `${customerName} cancelled the ${serviceName} while you were on the way or on site. Any fees will be paid out if applicable.`
    : existingJob.isBooked
      ? `${customerName} cancelled your ${serviceName} request. Any fees will be paid out if applicable.`
      : "The requested service is no longer available, we'll look for other requests.";
  const route = "/notifications";
  input.dispatch({
    type: "ADD_INBOX_NOTIFICATION",
    payload: {
      id: `mechanic-customer-cancelled-${remote.id}`,
      title,
      body,
      createdAt: Date.now(),
      roleScope: "mechanic",
      route,
    },
  });
  notifyNow({
    title,
    body,
    data: {
      kind: "job_cancelled_by_customer",
      requestId: remote.id,
      route,
    },
  });
  Alert.alert(title, body);
  haptic.warning();
}

function ingestAssignedRequest(
  remote: DispatchRequest,
  input: {
    mechanicUserId: string;
    region: "US" | "MX";
    mechanicCoords: ReturnType<typeof useStore>["state"]["userCoords"];
    mechanicJobs: ReturnType<typeof useStore>["state"]["mechanicJobs"];
    dispatch: ReturnType<typeof useStore>["dispatch"];
    formatPrice: (value: number) => string;
    L: (en: string, es: string) => string;
  },
): boolean {
  const { mechanicUserId, region, mechanicCoords, mechanicJobs, dispatch, formatPrice, L } = input;
  const existingJob = mechanicJobs.find((job) => job.id === remote.id || job.remoteRequestId === remote.id);
  if (existingJob) {
    const customerQuoteAcceptedAt = parseDateMs(remote.customer_quote_accepted_at);
    const customerCancelled = remote.status === "cancelled" && remote.cancelled_by_role === "customer";
    // Keep the mechanic's own payout preview in sync with the negotiated
    // price — e.g. once a customer accepts a counter-offer the mechanic sent,
    // this row's mechanic_payout/offered_price change server-side and the
    // mechanic's job card/earnings should reflect the real agreed amount.
    const remotePayout = Number((remote.mechanic_payout ?? remote.offered_price) || 0);
    const payoutChanged = remotePayout > 0 && remotePayout !== existingJob.payout;
    dispatch({
      type: "UPDATE_MECHANIC_JOB_STATUS",
      payload: {
        id: existingJob.id,
        status: customerCancelled ? "cancelled" : existingJob.status,
        mechanicOfferSentAt: parseDateMs(remote.mechanic_offer_sent_at),
        offerExpiresAt: parseDateMs(remote.offer_expires_at),
        customerQuoteAcceptedAt,
        mechanicAcceptedAt: parseDateMs(remote.mechanic_accepted_at),
        stripePaymentIntentId: remote.stripe_payment_intent_id ?? null,
        noShowReportedAt: parseDateMs(remote.no_show_reported_at),
        payout: payoutChanged ? remotePayout : undefined,
      },
    });
    if (customerCancelled && existingJob.status !== "cancelled") {
      dispatch({ type: "CLEAR_ACTIVE_JOB" });
      notifyMechanicCustomerCancelled(remote, existingJob, { dispatch });
      return true;
    }
    if (remote.status === "searching" && customerQuoteAcceptedAt && !existingJob.customerQuoteAcceptedAt) {
      notifyCustomerServiceOffer(remote, existingJob.id, { dispatch });
    }
    return true;
  }

  if (!isIncomingDispatchForMechanic(remote, mechanicUserId, region)) return false;
  if (mechanicHasBlockingJob(mechanicJobs)) return false;
  if (mechanicAlreadyHasRequest(mechanicJobs, remote.id)) return false;

  const job = buildMechanicJobFromDispatchRequest(remote, mechanicCoords);
  dispatch({ type: "ADD_MECHANIC_JOB", payload: job });
  const service = getServiceType(job.service);

  if (job.isBooked) {
    dispatch({
      type: "ADD_INBOX_NOTIFICATION",
      payload: {
        id: `booked-available-${job.id}`,
        title: L("Booked job available", "Servicio agendado disponible"),
        body: `${job.customerName} • ${service?.name ?? L("Service", "Servicio")} • ${formatPrice(job.payout)}`,
        createdAt: Date.now(),
        roleScope: "mechanic",
        route: `/mechanic/incoming?id=${encodeURIComponent(job.id)}`,
      },
    });
  }
  if (remote.status === "searching" && remote.customer_quote_accepted_at) {
    dispatch({
      type: "UPDATE_MECHANIC_JOB_STATUS",
      payload: {
        id: job.id,
        status: job.status,
        customerQuoteAcceptedAt: parseDateMs(remote.customer_quote_accepted_at),
      },
    });
    notifyCustomerServiceOffer(remote, job.id, { dispatch });
  }

  notifyNow({
    title: job.isBooked
      ? L("Booked job available", "Servicio agendado disponible")
      : L("New job request", "Nueva solicitud de trabajo"),
    body: `${service?.name ?? "Service"} • ${formatPrice(job.payout)}`,
    data: { kind: "mechanic_request", id: job.id },
  });
  haptic.medium();
  return true;
}

/**
 * Keeps mechanic_presence fresh while online and subscribes to assigned service_requests
 * so incoming jobs appear without waiting for the 8s poll.
 */
export function MechanicLiveJobSync() {
  const { user } = useAuth();
  const { state, dispatch } = useStore();
  const { locale, region, formatPrice } = useLocaleContext();
  const isEs = locale === "es-MX";
  const L = useCallback((en: string, es: string) => (isEs ? es : en), [isEs]);

  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mechanicJobsRef = useRef(state.mechanicJobs);
  const mechanicCoordsRef = useRef(state.userCoords);
  mechanicJobsRef.current = state.mechanicJobs;
  mechanicCoordsRef.current = state.userCoords;
  const watchedRequestIds = useMemo(
    () =>
      state.mechanicJobs
        .filter((job) => !!job.remoteRequestId && isMechanicJobWatchable(job.status))
        .map((job) => job.remoteRequestId!)
        .filter((requestId, index, list) => list.indexOf(requestId) === index),
    [state.mechanicJobs],
  );
  const watchedRequestKey = watchedRequestIds.join("|");
  const shouldSyncAssignedJobs = state.mechanicOnline || watchedRequestIds.length > 0;

  // Refresh server presence while online so routing picks this mechanic promptly.
  useEffect(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    if (!state.mechanicOnline || !user?.id) return;

    const refreshPresence = async () => {
      const resolved = await resolveAuthSession(user);
      if (!resolved) return;
      const ok = await setMechanicPresence(
        resolved.sessionToken,
        user.id,
        state.userName || "Mechanic",
        true,
        region,
      ).catch(() => false);
      // Keep the locally persisted "last confirmed online" timestamp fresh so
      // a cold start after being killed can tell a genuine recent heartbeat
      // apart from a days-old "online" that never got to expire — see
      // lib/store.tsx's hydrate effect.
      if (ok) dispatch({ type: "MECHANIC_PRESENCE_HEARTBEAT" });
    };

    void refreshPresence();
    heartbeatRef.current = setInterval(() => void refreshPresence(), PRESENCE_HEARTBEAT_MS);
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [state.mechanicOnline, state.userName, user?.id, user, region, dispatch]);

  // Best-effort: proactively mark offline when the app is backgrounded, instead of
  // waiting out the staleness window server-side enforces as the real backstop.
  // JS timers (the heartbeat above) are throttled/paused in the background on iOS,
  // so this is the fast path — the server-side freshness check covers hard kills,
  // where no JS ever runs to get here at all.
  useEffect(() => {
    if (!state.mechanicOnline || !user?.id) return;

    let wasBackgrounded = false;
    const syncPresence = async (isOnline: boolean) => {
      const resolved = await resolveAuthSession(user);
      if (!resolved) return;
      const ok = await setMechanicPresence(
        resolved.sessionToken,
        user.id,
        state.userName || "Mechanic",
        isOnline,
        region,
      ).catch(() => false);
      if (ok && isOnline) dispatch({ type: "MECHANIC_PRESENCE_HEARTBEAT" });
    };

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === "background") {
        wasBackgrounded = true;
        void syncPresence(false);
      } else if (nextState === "active" && wasBackgrounded) {
        // Coming back from background — re-affirm presence immediately rather
        // than waiting for the next heartbeat tick (up to PRESENCE_HEARTBEAT_MS away).
        wasBackgrounded = false;
        void syncPresence(true);
      }
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);
    return () => subscription.remove();
  }, [state.mechanicOnline, state.userName, user?.id, user, region, dispatch]);

  // Realtime: assigned jobs for this mechanic. Keep this alive for existing jobs
  // even when the mechanic is offline so customer cancellations clear locally.
  useEffect(() => {
    if (!shouldSyncAssignedJobs || !user?.id) {
      const client = getSupabaseRealtimeClient();
      if (realtimeChannelRef.current && client) {
        client.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
      return;
    }

    const client = getSupabaseRealtimeClient();
    if (!client) return;

    let cancelled = false;

    const setupRealtime = async () => {
      try {
        const resolved = await resolveAuthSession(user);
        if (!resolved || cancelled) return;

        client.realtime.setAuth(resolved.sessionToken);
        const channelName = `mechanic_requests:${user.id}`;
        const channel = client
          .channel(channelName)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "service_requests",
              filter: `assigned_mechanic_user_id=eq.${user.id}`,
            },
            (payload: any) => {
              const remote = (payload.new ?? payload.record) as DispatchRequest | undefined;
              if (!remote) return;
              ingestAssignedRequest(remote, {
                mechanicUserId: user.id,
                region,
                mechanicCoords: mechanicCoordsRef.current,
                mechanicJobs: mechanicJobsRef.current,
                dispatch,
                formatPrice,
                L,
              });
            },
          )
          .subscribe();

        realtimeChannelRef.current = channel;
      } catch (error) {
        console.warn("[MechanicLiveJobSync] Realtime setup failed:", error);
      }
    };

    void setupRealtime();

    return () => {
      cancelled = true;
      if (realtimeChannelRef.current) {
        client.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
    };
  }, [shouldSyncAssignedJobs, user?.id, user, region, dispatch, L, formatPrice]);

  useEffect(() => {
    if (!user?.id || watchedRequestIds.length === 0) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const pollAssignedJobs = async () => {
      try {
        const resolved = await resolveAuthSession(user);
        if (!resolved || cancelled) return;
        const requestIds = watchedRequestKey.split("|").filter(Boolean);
        for (const requestId of requestIds) {
          const remote = await fetchDispatchRequest(resolved.sessionToken, requestId);
          if (!remote || cancelled) continue;
          ingestAssignedRequest(remote, {
            mechanicUserId: user.id,
            region,
            mechanicCoords: mechanicCoordsRef.current,
            mechanicJobs: mechanicJobsRef.current,
            dispatch,
            formatPrice,
            L,
          });
        }
      } catch (error) {
        console.warn("[MechanicLiveJobSync] Assigned job poll failed:", error);
      }
    };

    void pollAssignedJobs();
    timer = setInterval(() => void pollAssignedJobs(), ASSIGNED_JOB_POLL_MS);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [watchedRequestKey, watchedRequestIds.length, user?.id, user, region, dispatch, L, formatPrice]);

  return null;
}
