import { useEffect, useRef } from "react";
import { Alert } from "react-native";
import { useAuth } from "@/lib/auth-context";
import { useStore } from "@/lib/store";
import { resolveAuthSession } from "@/lib/resolve-auth-session";
import { fetchDispatchRequest, isNetworkUnavailableError } from "@/lib/live-dispatch";
import type { JobStatus } from "@/lib/types";
import { notifyNow } from "@/lib/notifications";
import { deriveBookedMeta } from "@/lib/booked-trip";
import { getSupabaseRealtimeClient } from "@/lib/supabase-realtime";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useL } from "@/hooks/use-locale";
import { deriveServiceAndFeeFromTotal } from "@/lib/fare";

/**
 * Force an immediate poll of the active customer job from anywhere (e.g. manual refresh button).
 * Used to give users instant "check now" control while we migrate fully to realtime.
 */
const forcePollHandlers = new Set<() => void>();
export function forceCustomerLiveJobPoll() {
  forcePollHandlers.forEach((fn) => {
    try { fn(); } catch {}
  });
}


function getRealtimeClient() {
  return getSupabaseRealtimeClient();
}

/**
 * Applies a freshly fetched (or realtime-pushed) service_requests row to the local job.
 * Shared by both the polling path and the true realtime subscription.
 */
function applyRemoteUpdate(
  remote: any,
  activeJob: any,
  dispatch: any,
  acceptedBookedNotifiedRef: React.MutableRefObject<Set<string>>,
  mechanicReleaseNotifiedRef: React.MutableRefObject<Set<string>>,
  cancellationPromptedRef: React.MutableRefObject<Set<string>>,
  mechanicOfferNotifiedRef: React.MutableRefObject<Set<string>>,
  L: (en: string, es: string) => string,
) {
  if (!remote || !activeJob) return;

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

  // A mechanic sending a priced counter-offer only updates chat +
  // mechanic_offer_price_sent_at — it doesn't change job status, so without
  // this the customer would only ever discover a new offer by happening to
  // have the matching screen open and polling. Surface it the same way
  // every other dispatch event reaches the customer: an inbox notification +
  // local push that routes to /mechanic-offers to view and accept/decline
  // it.
  //
  // Deliberately keyed off mechanic_offer_price_sent_at, NOT
  // mechanic_offer_sent_at — the latter is set on every initial
  // dispatch/reassignment regardless of whether a price was ever sent (see
  // buildOfferStatePatch in lib/live-dispatch.ts), so using it here would
  // both fire a false "New offer" the instant a mechanic is merely matched
  // (before they've priced anything), and fail to fire again if the same
  // mechanic revises their price a second time.
  if (
    mapped === "searching" &&
    remote.mechanic_offer_price_sent_at &&
    !remote.customer_quote_accepted_at
  ) {
    const offerKey = `${remote.id}:${remote.mechanic_offer_price_sent_at}`;
    if (!mechanicOfferNotifiedRef.current.has(offerKey)) {
      mechanicOfferNotifiedRef.current.add(offerKey);
      const mechanicFirst = (remote.assigned_mechanic_name?.trim()?.split(/\s+/)?.[0]) || L("A mechanic", "Un mecánico");
      const title = L("New offer", "Nueva oferta");
      const body = L(`${mechanicFirst} sent you an offer.`, `${mechanicFirst} te envió una oferta.`);
      dispatch({
        type: "ADD_INBOX_NOTIFICATION",
        payload: {
          id: `customer-mechanic-offer-${offerKey}`,
          title,
          body,
          createdAt: Date.now(),
          roleScope: "customer",
          route: "/mechanic-offers",
        },
      });
      notifyNow({ title, body, data: { kind: "mechanic_offer_sent", id: remote.id, route: "/mechanic-offers" } });
    }
  }

  const becameAccepted = mapped === "accepted" && activeJob.status !== "accepted";
  const becameCancelled = mapped === "cancelled" && activeJob.status !== "cancelled";
  const returnedToSearching =
    mapped === "searching" &&
    activeJob.status !== "searching" &&
    activeJob.status !== "cancelled" &&
    activeJob.status !== "completed";

  if (becameAccepted && bookedMeta.isBooked && !acceptedBookedNotifiedRef.current.has(remote.id)) {
    acceptedBookedNotifiedRef.current.add(remote.id);
    const title = L("Booked job accepted", "Trabajo agendado aceptado");
    const body = `${remote.assigned_mechanic_name ?? L("Mechanic", "Mecánico")} ${L("accepted your scheduled service.", "aceptó tu servicio agendado.")}`;
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

  if (becameAccepted && !bookedMeta.isBooked) {
    const title = L("Mechanic accepted your request!", "¡El mecánico aceptó tu solicitud!");
    const body = `${remote.assigned_mechanic_name ?? L("A mechanic", "Un mecánico")} ${L("is on the way.", "va en camino.")}`;
    dispatch({
      type: "ADD_INBOX_NOTIFICATION",
      payload: {
        id: `customer-accepted-${remote.id}`,
        title,
        body,
        createdAt: Date.now(),
        roleScope: "customer",
        route: "/tracking",
      },
    });
    notifyNow({ title, body, data: { kind: "job_accepted", id: remote.id } });
  }

  if (becameCancelled && remote.cancelled_by_role === "mechanic") {
    const title = bookedMeta.isBooked ? L("Booked service cancelled", "Servicio agendado cancelado") : L("Service cancelled", "Servicio cancelado");
    const body = `${remote.assigned_mechanic_name ?? L("Your mechanic", "Tu mecánico")} ${L("cancelled your request.", "canceló tu solicitud.")}`;
    const promptKey = `cancelled:${remote.id}:${remote.updated_at ?? ""}`;
    dispatch({
      type: "ADD_INBOX_NOTIFICATION",
      payload: {
        id: `customer-cancelled-by-mechanic-${remote.id}`,
        title,
        body,
        createdAt: Date.now(),
        roleScope: "customer",
        route: bookedMeta.isBooked ? "/(tabs)/booked-requests" : "/",
      },
    });
    notifyNow({ title, body, data: { kind: "job_cancelled_by_mechanic", id: remote.id } });
    if (!cancellationPromptedRef.current.has(promptKey)) {
      cancellationPromptedRef.current.add(promptKey);
      Alert.alert(L("Trip canceled", "Viaje cancelado"), body);
    }
  } else if (becameCancelled && !remote.cancelled_by_role) {
    // No customer or mechanic chose this — it was auto-cancelled (e.g. by the
    // unmatched-request sweep because no mechanic came online in time). Give
    // a clear, distinct explanation instead of leaving the customer to guess
    // why their request silently disappeared from "searching".
    const title = L("No mechanic available", "No hay mecánico disponible");
    const body =
      remote.cancel_reason && typeof remote.cancel_reason === "string"
        ? remote.cancel_reason
        : L(
            "We couldn't find an available mechanic in time. You have not been charged.",
            "No pudimos encontrar un mecánico disponible a tiempo. No se te ha cobrado.",
          );
    const promptKey = `auto-cancelled:${remote.id}:${remote.updated_at ?? ""}`;
    dispatch({
      type: "ADD_INBOX_NOTIFICATION",
      payload: {
        id: `customer-auto-cancelled-${remote.id}`,
        title,
        body,
        createdAt: Date.now(),
        roleScope: "customer",
        route: "/",
      },
    });
    notifyNow({ title, body, data: { kind: "job_auto_cancelled_no_match", id: remote.id } });
    if (!cancellationPromptedRef.current.has(promptKey)) {
      cancellationPromptedRef.current.add(promptKey);
      Alert.alert(title, body);
    }
  }

  if (returnedToSearching) {
    const notifyKey = `${remote.id}:${remote.updated_at ?? "searching"}`;
    if (!mechanicReleaseNotifiedRef.current.has(notifyKey)) {
      mechanicReleaseNotifiedRef.current.add(notifyKey);
      const isNoShow = remote.cancel_reason === "customer_no_show";
      const title = isNoShow
        ? L("Mechanic couldn't find you", "El mecánico no pudo encontrarte")
        : L("Still looking for a mechanic", "Seguimos buscando un mecánico");
      const body = isNoShow
        ? L(
            "Your mechanic arrived but couldn't reach you or find your vehicle, so we're matching you with another mechanic. Double-check your location and vehicle details.",
            "Tu mecánico llegó pero no pudo contactarte ni encontrar tu vehículo, así que te estamos asignando otro mecánico. Revisa tu ubicación y los datos de tu vehículo.",
          )
        : L(
            "Your mechanic cancelled, so we're matching you with another mechanic.",
            "Tu mecánico canceló, así que te estamos asignando otro mecánico.",
          );
      dispatch({
        type: "ADD_INBOX_NOTIFICATION",
        payload: {
          id: `customer-still-looking-${notifyKey}`,
          title,
          body,
          createdAt: Date.now(),
          roleScope: "customer",
          route: "/request-pending",
        },
      });
      notifyNow({
        title,
        body,
        data: { kind: isNoShow ? "mechanic_reported_no_show" : "mechanic_cancelled_retry", id: remote.id },
      });
      if (!cancellationPromptedRef.current.has(`retry:${notifyKey}`)) {
        cancellationPromptedRef.current.add(`retry:${notifyKey}`);
        Alert.alert(isNoShow ? L("Mechanic couldn't find you", "El mecánico no pudo encontrarte") : L("Trip canceled", "Viaje cancelado"), body);
      }
    }
  }

  // Whenever the negotiated price changes on the server (a mechanic's
  // counter-offer gets accepted, a price is renegotiated, etc.), keep the
  // local job's fare in sync — otherwise the matching screen and final
  // total keep showing the original, now-stale price.
  const remoteOfferedPrice = Number(remote.offered_price || 0);
  const fareChanged = remoteOfferedPrice > 0 && remoteOfferedPrice !== activeJob.fare?.total;
  // offered_price is the TOTAL the customer pays — split it the same way
  // every other screen does (mechanic-offers.tsx, incoming.tsx,
  // booked-requests.tsx) so the receipt's fee line matches reality instead
  // of always reading $0.
  const syncedFare = fareChanged ? deriveServiceAndFeeFromTotal(remoteOfferedPrice) : null;

  dispatch({
    type: "UPDATE_JOB_ASSIGNMENT",
    payload: {
      id: activeJob.id,
      mechanicName: remote.assigned_mechanic_name ?? null,
      mechanicId: remote.assigned_mechanic_user_id ?? null,
      mechanicOfferSentAt: remote.mechanic_offer_sent_at ? Date.parse(remote.mechanic_offer_sent_at) || undefined : null,
      offerExpiresAt: remote.offer_expires_at ? Date.parse(remote.offer_expires_at) || undefined : null,
      customerQuoteAcceptedAt: remote.customer_quote_accepted_at
        ? Date.parse(remote.customer_quote_accepted_at) || undefined
        : null,
      mechanicAcceptedAt: remote.mechanic_accepted_at ? Date.parse(remote.mechanic_accepted_at) || undefined : null,
      stripePaymentIntentId: remote.stripe_payment_intent_id ?? null,
      fare: syncedFare
        ? { service: syncedFare.service, bookingFee: syncedFare.fee, total: remoteOfferedPrice }
        : undefined,
    },
  });

  if (typeof remote.mechanic_latitude === "number" && typeof remote.mechanic_longitude === "number") {
    // Missing/unparseable timestamp is treated as "unknown freshness" (null),
    // not "just updated" — the tracking screen falls back to stale-safe
    // handling rather than assuming a location we can't actually vouch for.
    const parsedLocationTs = remote.mechanic_location_updated_at
      ? Date.parse(remote.mechanic_location_updated_at)
      : NaN;
    dispatch({
      type: "UPDATE_JOB_MECHANIC_COORDS",
      payload: {
        id: activeJob.id,
        coords: {
          latitude: remote.mechanic_latitude,
          longitude: remote.mechanic_longitude,
        },
        updatedAt: Number.isFinite(parsedLocationTs) ? parsedLocationTs : null,
      },
    });
  }

  if (remote.mechanic_marked_done_at) {
    dispatch({
      type: "UPDATE_JOB_MECHANIC_DONE_AT",
      payload: { id: activeJob.id, at: Date.parse(remote.mechanic_marked_done_at) || Date.now() },
    });
  }
  if (remote.before_photo_url || remote.after_photo_url) {
    dispatch({
      type: "UPDATE_JOB_PHOTOS",
      payload: {
        id: activeJob.id,
        beforePhotoUrl: remote.before_photo_url ?? undefined,
        afterPhotoUrl: remote.after_photo_url ?? undefined,
      },
    });
  }
}

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
  const L = useL();
  const activeJob = state.activeJobId ? state.jobs.find((j) => j.id === state.activeJobId) ?? null : null;

  const activeJobRef = useRef(activeJob);
  useEffect(() => {
    activeJobRef.current = activeJob;
  }, [activeJob]);

  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const inFlightRef = useRef(false);
  const backoffRef = useRef(FAST_POLL_MS);
  const acceptedBookedNotifiedRef = useRef<Set<string>>(new Set());
  const mechanicReleaseNotifiedRef = useRef<Set<string>>(new Set());
  const cancellationPromptedRef = useRef<Set<string>>(new Set());
  const mechanicOfferNotifiedRef = useRef<Set<string>>(new Set());
  const forceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    if (!activeJob?.id || !activeJob.remoteRequestId) return;

    let alive = true;

    const run = async (isForced = false) => {
      if (inFlightRef.current && !isForced) return;
      inFlightRef.current = true;
      try {
        const currentJob = activeJobRef.current;
        if (!currentJob?.remoteRequestId) return;

        const resolved = await resolveAuthSession(userRef.current);
        if (!resolved || !alive) return;
        const remote = await fetchDispatchRequest(resolved.sessionToken, currentJob.remoteRequestId);
        if (!remote || !alive) return;

        applyRemoteUpdate(
          remote,
          currentJob,
          dispatch,
          acceptedBookedNotifiedRef,
          mechanicReleaseNotifiedRef,
          cancellationPromptedRef,
          mechanicOfferNotifiedRef,
          L,
        );

        // Keep trip-status updates snappy for active service flow (polling backoff)
        if (
          remote.status === "accepted" ||
          remote.status === "enroute" ||
          remote.status === "arrived" ||
          remote.status === "in_progress"
        ) {
          backoffRef.current = FAST_POLL_MS;
        } else if (remote.status === "searching") {
          backoffRef.current = 4000;
        } else {
          backoffRef.current = SLOW_POLL_MS;
        }
      } catch (error) {
        if (!isNetworkUnavailableError(error)) {
          console.error("[CustomerLiveJobSync] Poll failed:", error);
        }
        backoffRef.current = Math.min(MAX_POLL_MS, Math.round(backoffRef.current * 1.6));
      } finally {
        inFlightRef.current = false;
      }
    };

    // Force immediate poll (used by manual refresh button in tracking)
    const forceNow = () => {
      if (forceTimerRef.current) clearTimeout(forceTimerRef.current);
      backoffRef.current = FAST_POLL_MS;
      void run(true);
      // Schedule next normal tick
      forceTimerRef.current = setTimeout(() => {
        if (alive) void run();
      }, FAST_POLL_MS);
    };
    forcePollHandlers.add(forceNow);

    let timer: ReturnType<typeof setTimeout> | null = null;
    const loop = async () => {
      await run();
      if (!alive) return;
      timer = setTimeout(() => void loop(), backoffRef.current);
    };
    void loop();
    return () => {
      alive = false;
      forcePollHandlers.delete(forceNow);
      if (timer) clearTimeout(timer);
      if (forceTimerRef.current) clearTimeout(forceTimerRef.current);
    };
  }, [user?.id, activeJob?.id, activeJob?.remoteRequestId, dispatch, L]);

  // === TRUE REALTIME SUBSCRIPTION (postgres_changes on the active service_request row) ===
  // This is the production solution to the "polling lag" limitation.
  // Requires: (1) the ALTER PUBLICATION lines in SUPABASE_LIVE_DISPATCH.sql to have been run,
  // and (2) the user having a valid JWT (we call setAuth with it).
  useEffect(() => {
    const remoteRequestId = activeJob?.remoteRequestId;
    if (!user?.id || !remoteRequestId) {
      // Clean up any previous channel when there's no active remote job
      if (realtimeChannelRef.current) {
        getRealtimeClient()?.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
      return;
    }

    const client = getRealtimeClient();
    if (!client) {
      // No Supabase env configured — stay on polling only (graceful)
      return;
    }

    let cancelled = false;

    const setupRealtime = async () => {
      try {
        const resolved = await resolveAuthSession(userRef.current);
        if (!resolved || cancelled) return;

        // Authenticate this websocket connection with the user's JWT.
        // This is required for RLS policies to let the user see changes on their rows.
        client.realtime.setAuth(resolved.sessionToken);

        const channelName = `service_requests:${remoteRequestId}`;

        const channel = client
          .channel(channelName)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "service_requests",
              filter: `id=eq.${remoteRequestId}`,
            },
            (payload: any) => {
              const remote = payload.new ?? payload.record;
              const currentJob = activeJobRef.current;
              if (remote && currentJob) {
                applyRemoteUpdate(
                  remote,
                  currentJob,
                  dispatch,
                  acceptedBookedNotifiedRef,
                  mechanicReleaseNotifiedRef,
                  cancellationPromptedRef,
                  mechanicOfferNotifiedRef,
                  L,
                );

                // Realtime is working — be extremely lazy with the polling fallback
                backoffRef.current = 30000;
              }
            }
          )
          .subscribe((status, err) => {
            // Ignore stale callbacks from channels we intentionally tore down.
            if (cancelled || realtimeChannelRef.current !== channel) return;

            if (status === "SUBSCRIBED") {
              console.log("[CustomerLiveJobSync] Realtime connected →", remoteRequestId);
              backoffRef.current = 30000; // poll only as last-resort heartbeat
            } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              console.warn("[CustomerLiveJobSync] Realtime degraded, relying on polling", err ?? status);
              backoffRef.current = FAST_POLL_MS;
            }
          });

        if (cancelled) {
          client.removeChannel(channel);
          return;
        }

        realtimeChannelRef.current = channel;
      } catch (err) {
        if (!cancelled) {
          console.warn("[CustomerLiveJobSync] Realtime setup failed (polling remains active):", err);
        }
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
  }, [user?.id, activeJob?.remoteRequestId, dispatch, L]);

  return null;
}
