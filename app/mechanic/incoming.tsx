import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, Alert, Platform } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ScreenContainer } from "@/components/screen-container";
import { useStore } from "@/lib/store";
import { getServiceType } from "@/lib/seed";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { PrimaryButton } from "@/components/primary-button";
import { Avatar } from "@/components/avatar";
import { haptic } from "@/lib/haptics";
import { safeReplace } from "@/lib/safe-router";
import { notifyNow } from "@/lib/notifications";
import { useAuth } from "@/lib/auth-context";
import { resolveAuthSession } from "@/lib/resolve-auth-session";
import {
  acceptDispatchRequest,
  AwaitingCustomerPriceConfirmationError,
  fetchDispatchRequest,
  proposePartsCost,
  releaseDispatchFromMechanic,
  sendServiceMessage,
  updateDispatchOfferedPrice,
} from "@/lib/live-dispatch";
import { useImagePicker, type PickedImage } from "@/hooks/use-image-picker";
import { uploadMechanicDoc } from "@/lib/upload-mechanic-doc";
import { isPartsCostWithinBounds, maxPartsCostForRegion } from "@/lib/price-adjustment-core";
import { useLocaleContext, useL } from "@/hooks/use-locale";
import { formatDistanceByRegion } from "@/lib/distance";
import { deriveBookedMeta } from "@/lib/booked-trip";
import { notifyDispatchEvent } from "@/lib/dispatch-notifications";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { supabaseUserData } from "@/lib/_core/supabase-user-data";
import { toLocationArea } from "@/lib/safety-core";
import { RingGauge } from "@/components/RingGauge";
import { localizedServiceName } from "@/lib/service-i18n";
import { saveUserHistory } from "@/lib/user-history-cache";
import { formatEditableMoney, normalizeEditableMoneyInput, parseEditableMoneyInput } from "@/lib/money-input";
import { shouldAutoDeclineOnExpiry } from "@/lib/incoming-offer-core";
import { deriveServiceAndFeeFromTotal, QUICK_SERVICE_BOOKING_FEE_RATE } from "@/lib/fare";
import { useConnectPayouts } from "@/hooks/use-connect-payouts";

const COUNTDOWN_SECONDS = 60;

export default function IncomingJobScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, dispatch } = useStore();
  const { user } = useAuth();
  const { region, locale, formatPrice } = useLocaleContext();
  const L = useL();
  const job = typeof id === "string" ? state.mechanicJobs.find((j) => j.id === id) : undefined;
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);
  const expiredRef = useRef(false);
  const resolvedRef = useRef(false);
  const counterOfferSentRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [counterPrice, setCounterPrice] = useState("");
  const [counterNote, setCounterNote] = useState("");
  const [counterOfferSent, setCounterOfferSent] = useState(false);
  const [partsCostInput, setPartsCostInput] = useState("");
  const [partsReceipt, setPartsReceipt] = useState<PickedImage | null>(null);
  const [partsSubmitting, setPartsSubmitting] = useState(false);
  const [partsProposed, setPartsProposed] = useState(false);
  const { pickReceiptImage } = useImagePicker();
  // Gate checked in handleAccept below — a mechanic who's never finished
  // Stripe Connect onboarding would otherwise do the job and only discover
  // at Earnings time that payout is stuck. The capture sweep already retries
  // forever once they do set it up (see payment-capture-sweep+api.ts), so
  // this is a courtesy that catches it before they start work, not the only
  // safety net.
  const { status: payoutStatus, loadingStatus: payoutStatusLoading } = useConnectPayouts(user, true);

  const clearCountdown = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  // This screen must only ever show the accept/decline offer UI for a job
  // still awaiting the mechanic's decision. If the mechanic reaches this
  // route while the job is in any other state — most commonly by pressing
  // the hardware/header back button from the active job screen after
  // already accepting, which can resurface this screen from the navigation
  // stack — redirect immediately instead of letting them decline (and
  // thereby cancel) a job they already committed to.
  // NOTE: must be declared before any early return to satisfy Rules of Hooks
  useEffect(() => {
    if (!job) return;
    const bookedLike = !!job.isBooked || !!job.scheduledFor;
    const isFutureBooked = bookedLike && (typeof job.scheduledFor !== "number" || job.scheduledFor > Date.now());
    if (job.status === "pending") return;
    resolvedRef.current = true;
    clearCountdown();
    if (job.status === "heading_there") {
      if (isFutureBooked) {
        dispatch({
          type: "UPDATE_MECHANIC_JOB_STATUS",
          payload: { id: job.id, status: "upcoming" },
        });
        router.replace(`/mechanic/booked?id=${encodeURIComponent(job.id)}` as any);
      } else {
        safeReplace("/mechanic/active");
      }
    } else if (job.status === "upcoming") {
      router.replace(`/mechanic/booked?id=${encodeURIComponent(job.id)}` as any);
    } else if (job.status === "arrived" || job.status === "in_progress") {
      safeReplace("/mechanic/active");
    } else {
      // "declined", "cancelled", "completed", or any other resolved state.
      router.replace("/(tabs)" as any);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id, job?.status]);

  // Countdown (must also be before early return)
  useEffect(() => {
    if (!job || job.status !== "pending") return;
    expiredRef.current = false;
    resolvedRef.current = false;
    counterOfferSentRef.current = false;
    setCounterOfferSent(false);
    setIsSubmitting(false);
    setSecondsLeft(COUNTDOWN_SECONDS);
    const start = Date.now();
    clearCountdown();
    intervalRef.current = setInterval(() => {
      if (resolvedRef.current || counterOfferSentRef.current) {
        clearCountdown();
        return;
      }
      const elapsed = Math.floor((Date.now() - start) / 1000);
      const left = Math.max(0, COUNTDOWN_SECONDS - elapsed);
      setSecondsLeft(left);
      if (left <= 0) {
        clearCountdown();
        if (
          !expiredRef.current &&
          shouldAutoDeclineOnExpiry({
            alreadyResolved: resolvedRef.current,
            counterOfferSent: counterOfferSentRef.current,
          })
        ) {
          expiredRef.current = true;
          handleDecline(true);
        }
      }
    }, 250);
    return () => clearCountdown();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id, job?.status]);

  if (!job) {
    return (
      <ScreenContainer>
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>{L("Job not found.", "Trabajo no encontrado.")}</Text>
          <PrimaryButton title={L("Back", "Volver")} fullWidth={false} onPress={() => router.replace("/(tabs)" as any)} />
        </View>
      </ScreenContainer>
    );
  }

  // Never render the interactive accept/decline offer UI for a job that's
  // already been resolved — e.g. reaching this route via the back button
  // after already accepting. The effect above redirects immediately, but
  // this guard closes the brief window where the buttons could otherwise
  // still be tapped before that redirect completes.
  if (job.status !== "pending") {
    return (
      <ScreenContainer>
        <View style={styles.emptyWrap}>
          <ActivityIndicator color="#F97316" />
        </View>
      </ScreenContainer>
    );
  }

  const service = getServiceType(job.service);
  const etaMinutes = Math.max(2, Math.ceil((job.distanceMiles / 24) * 60));
  const isBookedService = !!job.isBooked || !!job.scheduledFor;
  const customerFirstName = (job.customerName || "Customer").trim().split(/\s+/)[0] || "Customer";
  const pickupArea = toLocationArea(job.location);
  const countdownPct = (secondsLeft / COUNTDOWN_SECONDS) * 100;
  const urgencyColor = secondsLeft <= 15 ? "#EF4444" : "#F97316";
  const serviceLabel = service ? localizedServiceName(service.code, locale) : L("Service", "Servicio");
  const distanceLabel =
    region === "MX"
      ? formatDistanceByRegion(job.distanceMiles, region)
      : `${formatDistanceByRegion(job.distanceMiles, region)} away`;

  const handleAccept = async () => {
    if (resolvedRef.current || isSubmitting) return;
    // Block before this mechanic's very first job starts, not after —
    // otherwise they'd do the work and only discover at Earnings time that
    // payout is stuck with no connected account. Fails open while the
    // status check itself is still loading, since the countdown is time-
    // sensitive and the sweep's own retry is the real backstop either way.
    if (!payoutStatusLoading && !payoutStatus.payoutsEnabled) {
      haptic.warning();
      Alert.alert(
        L("Set up payouts first", "Configura tus pagos primero"),
        L(
          "You need to connect a bank account before accepting jobs, so you actually get paid once this one completes.",
          "Debes conectar una cuenta bancaria antes de aceptar trabajos, para que realmente recibas el pago al completarlo.",
        ),
        [
          { text: L("Not now", "Ahora no"), style: "cancel" },
          {
            text: L("Set up payouts", "Configurar pagos"),
            onPress: () => router.push("/(tabs)/earnings" as any),
          },
        ],
      );
      return;
    }
    setIsSubmitting(true);
    clearCountdown();
    let bookedByRemote = isBookedService;
    let remoteAccepted = !job.remoteRequestId;
    // Price may have changed since this screen first loaded (a counter-offer
    // sent, or the customer accepting one) — capture whatever the server's
    // latest row says right as we accept, so the transition to an active job
    // carries the real negotiated payout instead of a stale in-memory value.
    let latestPayout: number | undefined;
    const showUnavailableAndGoHome = () => {
      const nextMechanicJobs = state.mechanicJobs.map((currentJob) =>
        currentJob.id === job.id ? { ...currentJob, status: "cancelled" as const } : currentJob,
      );
      if (user?.id) {
        void saveUserHistory(user.id, {
          jobs: state.jobs,
          activeJobId: state.activeJobId,
          mechanicJobs: nextMechanicJobs,
          mechanicActiveJobId: null,
          paymentMethods: state.paymentMethods,
          defaultPaymentMethodId: state.defaultPaymentMethodId,
        });
      }
      dispatch({ type: "UPDATE_MECHANIC_JOB_STATUS", payload: { id: job.id, status: "cancelled" } });
      dispatch({ type: "CLEAR_ACTIVE_JOB" });
      Alert.alert(
        L("Service trip no longer available", "El viaje ya no está disponible"),
        L(
          "The service trip is no longer available. It may have been canceled or claimed by another mechanic.",
          "El viaje ya no está disponible. Es posible que haya sido cancelado o reclamado por otro mecánico.",
        ),
        [
          {
            text: L("OK", "Aceptar"),
            onPress: () => safeReplace("/(tabs)"),
          },
        ],
      );
    };
    if (job.remoteRequestId && user?.id) {
      try {
        const resolved = await resolveAuthSession(user);
        if (!resolved) {
          setIsSubmitting(false);
          Alert.alert(
            L("Connection issue", "Problema de conexión"),
            L("Could not accept right now. Please try again.", "No se pudo aceptar ahora. Inténtalo de nuevo."),
          );
          return;
        }
        const profile = await supabaseUserData.getOrCreateProfile(user.id, "mechanic", resolved.sessionToken);
        if (profile.verification_status !== "approved") {
          Alert.alert(
            L("Verification required", "Verificación requerida"),
            L(
              "Your mechanic documents must be approved before you can accept jobs.",
              "Tus documentos de mecánico deben estar aprobados antes de aceptar trabajos.",
            ),
          );
          setIsSubmitting(false);
          return;
        }
        const remote = await fetchDispatchRequest(resolved.sessionToken, job.remoteRequestId);
        if (!remote || remote.status === "cancelled" || remote.status === "completed") {
          showUnavailableAndGoHome();
          setIsSubmitting(false);
          return;
        }
        latestPayout = Number((remote.mechanic_payout ?? remote.offered_price) || 0);
        const remoteBooked = deriveBookedMeta(remote?.scheduled_for ?? null, remote?.customer_note ?? null);
        if (remoteBooked.isBooked) bookedByRemote = true;
        const accepted = await acceptDispatchRequest(
          resolved.sessionToken,
          job.remoteRequestId,
          user.id,
          state.userName || "Mechanic",
        );
        if (!accepted) {
          const current = await fetchDispatchRequest(resolved.sessionToken, job.remoteRequestId);
          if (!current || current.status === "cancelled" || current.status === "completed") {
            showUnavailableAndGoHome();
            setIsSubmitting(false);
            return;
          } else if (current?.status === "accepted" && current.assigned_mechanic_user_id === user.id) {
            remoteAccepted = true;
            latestPayout = Number((current.mechanic_payout ?? current.offered_price) || 0);
          } else if (current?.assigned_mechanic_user_id && current.assigned_mechanic_user_id !== user.id) {
            Alert.alert(
              L("Already taken", "Ya fue tomada"),
              L("Another mechanic accepted this request.", "Otro mecánico aceptó esta solicitud."),
            );
            setIsSubmitting(false);
            return;
          } else {
            Alert.alert(
              L("Connection issue", "Problema de conexión"),
              L("Could not accept right now. Please try again.", "No se pudo aceptar ahora. Inténtalo de nuevo."),
            );
            setIsSubmitting(false);
            return;
          }
        } else {
          remoteAccepted = true;
          // No distance-based reconciliation needed here anymore — pricing
          // no longer has a per-mile component, so the price offered at
          // booking time doesn't depend on which mechanic ends up matched.
        }
        resolvedRef.current = true;
        void notifyDispatchEvent({
          sessionToken: resolved.sessionToken,
          requestId: job.remoteRequestId,
          event: "mechanic_accepted_request",
          initiatorUserId: user.id,
          actorUserId: user.id,
        });
        void trackAnalyticsEvent({
          eventName: "mechanic_accepted_request",
          userId: user.id,
          role: "mechanic",
          sessionToken: resolved.sessionToken,
          properties: {
            request_id: job.remoteRequestId,
            region_code: region,
            service_code: job.service,
            customer_name: job.customerName,
            eta_minutes: etaMinutes,
          },
        });
      } catch (error) {
        setIsSubmitting(false);
        if (error instanceof AwaitingCustomerPriceConfirmationError) {
          Alert.alert(
            L("Waiting on customer", "Esperando al cliente"),
            L(
              "Your counteroffer hasn't been confirmed by the customer yet, so it can't be accepted as final. You can wait for them to confirm it, or decline.",
              "El cliente aún no ha confirmado tu contraoferta, así que no se puede aceptar como definitiva. Puedes esperar a que la confirme o rechazar.",
            ),
          );
          return;
        }
        console.error("[Incoming] Accept failed:", error);
        Alert.alert(
          L("Connection issue", "Problema de conexión"),
          L("Could not accept right now. Please try again.", "No se pudo aceptar ahora. Inténtalo de nuevo."),
        );
        return;
      }
    }
    if (job.remoteRequestId && !remoteAccepted) {
      setIsSubmitting(false);
      return;
    }
    haptic.success();
    dispatch({
      type: "UPDATE_MECHANIC_JOB_STATUS",
      payload: {
        id: job.id,
        status: bookedByRemote ? "upcoming" : "heading_there",
        payout: latestPayout,
      },
    });
    notifyNow({
      title: L("Job accepted", "Trabajo aceptado"),
      body: bookedByRemote
        ? L(
            `${job.customerName} booked service is now in your upcoming jobs.`,
            `El servicio agendado de ${job.customerName} ahora está en tus próximos trabajos.`
          )
        : L(
            `${job.customerName} is expecting you. ETA ${Math.max(5, Math.round(job.distanceMiles * 4))} min.`,
            `${job.customerName} te espera. ETA ${Math.max(5, Math.round(job.distanceMiles * 4))} min.`
          ),
    });
    router.replace((bookedByRemote ? `/mechanic/booked?id=${encodeURIComponent(job.id)}` : "/mechanic/active") as any);
  };

  const handleCounterOffer = async () => {
    if (resolvedRef.current || isSubmitting) return;
    if (!job.remoteRequestId || !user?.id) {
      Alert.alert(
        L("Connection issue", "Problema de conexión"),
        L("Could not send a counteroffer right now.", "No se pudo enviar una contraoferta ahora."),
      );
      return;
    }

    const proposedTotal = parseEditableMoneyInput(counterPrice);
    if (!Number.isFinite(proposedTotal) || proposedTotal <= 0) {
      Alert.alert(
        L("Invalid price", "Precio inválido"),
        L("Enter a price greater than zero.", "Ingresa un precio mayor que cero."),
      );
      return;
    }

    // Stop the accept/decline countdown as soon as we commit to sending a
    // counteroffer (before the network round-trip), not after it succeeds —
    // otherwise the timer could still expire and auto-decline/reassign the
    // job while the send is in flight. The mechanic responded in time.
    counterOfferSentRef.current = true;
    setCounterOfferSent(true);
    clearCountdown();

    setIsSubmitting(true);
    try {
      const resolved = await resolveAuthSession(user);
      if (!resolved) {
        Alert.alert(
          L("Connection issue", "Problema de conexión"),
          L("Could not send a counteroffer right now.", "No se pudo enviar una contraoferta ahora."),
        );
        return;
      }

      try {
        await updateDispatchOfferedPrice(resolved.sessionToken, job.remoteRequestId, +proposedTotal.toFixed(2));
      } catch (error) {
        console.warn("[Incoming] Could not update offered price column:", error);
      }

      const payload = JSON.stringify({
        kind: "mechanic_offer",
        mechanic_user_id: user.id,
        mechanic_name: state.userName || user.email.split("@")[0] || "Mechanic",
        proposed_total: +proposedTotal.toFixed(2),
        note: counterNote.trim() || "",
      });
      await sendServiceMessage(resolved.sessionToken, {
        requestId: job.remoteRequestId,
        senderUserId: user.id,
        senderRole: "mechanic",
        message: `OFFER_JSON:${payload}`,
      });
      void notifyDispatchEvent({
        sessionToken: resolved.sessionToken,
        requestId: job.remoteRequestId,
        event: "mechanic_offer_sent",
        initiatorUserId: user.id,
        actorUserId: user.id,
      });
      void trackAnalyticsEvent({
        eventName: "mechanic_offer_sent",
        userId: user.id,
        role: "mechanic",
        sessionToken: resolved.sessionToken,
        properties: {
          request_id: job.remoteRequestId,
          region_code: region,
          service_code: job.service,
          proposed_total: +proposedTotal.toFixed(2),
        },
      });
      haptic.success();
      Alert.alert(
        L("Offer sent", "Oferta enviada"),
        L("Your counteroffer was sent back to the customer.", "Tu contraoferta se envió de vuelta al cliente."),
      );
    } catch (error) {
      console.error("[Incoming] Counteroffer send failed:", error);
      haptic.error();
      Alert.alert(
        L("Connection issue", "Problema de conexión"),
        L("Could not send a counteroffer right now.", "No se pudo enviar una contraoferta ahora."),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePickReceipt = async () => {
    const picked = await pickReceiptImage();
    if (picked) setPartsReceipt(picked);
  };

  const handleProposeParts = async () => {
    if (partsSubmitting || !job.remoteRequestId || !user?.id) return;
    const partsCost = parseEditableMoneyInput(partsCostInput);
    if (!isPartsCostWithinBounds(partsCost, region)) {
      const cap = maxPartsCostForRegion(region);
      const capLabel = region === "MX" ? `$${cap.toLocaleString("es-MX")} MXN` : `$${cap}`;
      Alert.alert(
        L("Invalid amount", "Monto inválido"),
        L(`Enter an amount up to ${capLabel}.`, `Ingresa un monto de hasta ${capLabel}.`),
      );
      return;
    }
    if (!partsReceipt) {
      Alert.alert(
        L("Receipt required", "Recibo requerido"),
        L("Attach a photo of the receipt before sending.", "Adjunta una foto del recibo antes de enviar."),
      );
      return;
    }

    setPartsSubmitting(true);
    try {
      const resolved = await resolveAuthSession(user);
      if (!resolved) {
        throw new Error("no session");
      }
      const receiptPath = await uploadMechanicDoc(user.id, resolved.sessionToken, "parts_receipt", partsReceipt);
      await proposePartsCost(resolved.sessionToken, job.remoteRequestId, +partsCost.toFixed(2), receiptPath);
      haptic.success();
      setPartsProposed(true);
      Alert.alert(
        L("Parts cost sent", "Costo de piezas enviado"),
        L(
          "The customer will review the receipt and authorize the hold.",
          "El cliente revisará el recibo y autorizará la retención.",
        ),
      );
    } catch (error) {
      console.error("[Incoming] Parts cost proposal failed:", error);
      haptic.error();
      Alert.alert(
        L("Connection issue", "Problema de conexión"),
        L("Could not send the parts cost right now.", "No se pudo enviar el costo de piezas ahora."),
      );
    } finally {
      setPartsSubmitting(false);
    }
  };

  const handleDecline = async (auto = false) => {
    if (resolvedRef.current || isSubmitting) return;
    setIsSubmitting(true);
    if (job.remoteRequestId && user?.id) {
      try {
        const resolved = await resolveAuthSession(user);
        if (!resolved) {
          setIsSubmitting(false);
          if (!auto) {
            Alert.alert(
              L("Connection issue", "Problema de conexión"),
              L("Could not decline right now. Please try again.", "No se pudo rechazar ahora. Inténtalo de nuevo."),
            );
          }
          return;
        }
        // Routed through the same server-side release/reroute/notify path as
        // job cancellations (lib/mechanic-cancel-service.ts), which also
        // tracks a consecutive-decline streak and temporarily throttles new
        // offers after repeated declines.
        const released = await releaseDispatchFromMechanic(resolved.sessionToken, job.remoteRequestId);
        if (!released) {
          setIsSubmitting(false);
          if (!auto) {
            Alert.alert(
              L("Connection issue", "Problema de conexión"),
              L("Could not decline right now. Please try again.", "No se pudo rechazar ahora. Inténtalo de nuevo."),
            );
          }
          return;
        }
      } catch (error) {
        console.error("[Incoming] Decline sync failed:", error);
        setIsSubmitting(false);
        if (!auto) {
          Alert.alert(
            L("Connection issue", "Problema de conexión"),
            L("Could not decline right now. Please try again.", "No se pudo rechazar ahora. Inténtalo de nuevo."),
          );
        }
        return;
      }
    }
    resolvedRef.current = true;
    clearCountdown();
    if (!auto) haptic.warning();
    dispatch({
      type: "UPDATE_MECHANIC_JOB_STATUS",
      payload: { id: job.id, status: "declined" },
    });
    if (auto) {
      notifyNow({ title: L("Job missed", "Solicitud perdida"), body: L("Request expired before you could respond.", "La solicitud venció antes de responder.") });
    }
    router.replace("/(tabs)" as any);
  };

  return (
    <ScreenContainer edges={["left", "right"]} showBackButton title={L("Incoming request", "Solicitud entrante")}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.urgencyBand}>
          <View style={styles.urgencyCopy}>
            <View style={styles.livePill}>
              <View style={styles.liveDot} />
              <Text style={styles.livePillText}>
                {counterOfferSent ? L("OFFER SENT", "OFERTA ENVIADA") : L("LIVE REQUEST", "SOLICITUD EN VIVO")}
              </Text>
            </View>
            <Text style={styles.urgencyTitle}>
              {counterOfferSent ? L("Waiting on customer", "Esperando al cliente") : L("New job nearby", "Nuevo trabajo cercano")}
            </Text>
            <Text style={styles.urgencySub}>
              {counterOfferSent
                ? L(
                    "Your counteroffer is with the customer. You can still accept or decline anytime.",
                    "Tu contraoferta está con el cliente. Aún puedes aceptar o rechazar cuando quieras.",
                  )
                : L("Accept to claim this payout before the timer expires.", "Acepta para reclamar este pago antes de que expire el temporizador.")}
            </Text>
          </View>
          <View style={styles.countdownWrap}>
            {counterOfferSent ? (
              <IconSymbol name="clock.fill" size={28} color="#94A3B8" />
            ) : (
              <>
                <RingGauge
                  percentage={countdownPct}
                  size={72}
                  strokeWidth={6}
                  color={urgencyColor}
                  trackColor="rgba(255,255,255,0.14)"
                />
                <Text style={styles.countdownLabel}>{secondsLeft}s</Text>
              </>
            )}
          </View>
        </View>

        <View style={[styles.heroCard, isBookedService && styles.heroCardBooked]}>
          <View style={styles.serviceChip}>
            <IconSymbol name={service?.icon ?? "wrench.fill"} size={14} color="#F97316" />
            <Text style={styles.serviceChipText}>{serviceLabel}</Text>
          </View>

          <View style={styles.heroTop}>
            <Avatar name={job.customerName} url={job.customerPhotoUrl ?? undefined} size={64} />
            <View style={{ flex: 1 }}>
              <Text style={styles.customerName}>{customerFirstName}</Text>
              <Text style={styles.vehicle}>{job.vehicle}</Text>
              <Text style={styles.pickupHint}>{pickupArea}</Text>
            </View>
          </View>

          <View style={styles.statsRow}>
            <StatChip
              icon="dollarsign.circle.fill"
              label={L("Payout", "Pago")}
              value={formatPrice(job.payout)}
              accent="#10B981"
            />
            <StatChip
              icon="car.fill"
              label={L("Distance", "Distancia")}
              value={distanceLabel}
            />
            <StatChip
              icon="clock.fill"
              label={L("ETA", "ETA")}
              value={`~${etaMinutes}m`}
            />
          </View>

          {(isBookedService || job.customerQuoteAcceptedAt) ? (
            <View style={styles.badgeRow}>
              {isBookedService ? (
                <View style={[styles.badge, styles.badgeBooked]}>
                  <Text style={styles.badgeText}>{L("Booked", "Agendado")}</Text>
                </View>
              ) : null}
              {job.customerQuoteAcceptedAt ? (
                <View style={[styles.badge, styles.badgeQuote]}>
                  <Text style={styles.badgeText}>{L("Quote accepted", "Cotización aceptada")}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        <View style={styles.detailsCard}>
          <Text style={styles.sectionTitle}>{L("Trip details", "Detalles del viaje")}</Text>
          <Row icon="location.fill" label={L("Pickup area", "Área de ubicación")} value={pickupArea} />
          {job.scheduledFor ? (
            <Row
              icon="calendar"
              label={L("Scheduled", "Programado")}
              value={new Date(job.scheduledFor).toLocaleString(locale === "es-MX" ? "es-MX" : "en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            />
          ) : null}
          {job.customerHasParts !== null && job.customerHasParts !== undefined ? (
            <Row
              icon="shippingbox.fill"
              label={L("Customer parts", "Partes del cliente")}
              value={job.customerHasParts ? L("Yes", "Sí") : L("No, needs mechanic to source", "No, requiere refacciones")}
            />
          ) : null}
          {job.customerNote ? (
            <View style={styles.noteCard}>
              <View style={styles.noteHeader}>
                <IconSymbol name="text.bubble.fill" size={14} color="#F97316" />
                <Text style={styles.noteTitle}>{L("Customer note", "Nota del cliente")}</Text>
              </View>
              <Text style={styles.noteBody}>{job.customerNote}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.counterOfferCard}>
          <Text style={styles.sectionTitle}>{L("Adjust price", "Ajustar precio")}</Text>
          <Text style={styles.counterOfferText}>
            {L(
              "Send a counteroffer back to the customer.",
              "Envía una contraoferta de vuelta al cliente.",
            )}
          </Text>
          <View style={styles.counterOfferInputRow}>
            <Text style={styles.counterOfferCurrency}>$</Text>
            <TextInput
              value={counterPrice}
              onChangeText={(value) => setCounterPrice(normalizeEditableMoneyInput(value))}
              placeholder={formatEditableMoney(0, region)}
              placeholderTextColor="#64748B"
              keyboardType="decimal-pad"
              style={styles.counterOfferInput}
            />
          </View>
          {(() => {
            // This is the TOTAL the customer would pay if they accept — show
            // what it actually splits into so the mechanic knows their real
            // take-home isn't the full number they just typed.
            const parsedCounter = parseEditableMoneyInput(counterPrice);
            if (!Number.isFinite(parsedCounter) || parsedCounter <= 0) return null;
            const { service, fee } = deriveServiceAndFeeFromTotal(parsedCounter);
            return (
              <Text style={styles.counterOfferBreakdown}>
                {L(
                  `You'll receive ${formatPrice(service)} — dispatch fee (${Math.round(QUICK_SERVICE_BOOKING_FEE_RATE * 100)}%): ${formatPrice(fee)}`,
                  `Recibirás ${formatPrice(service)} — tarifa de despacho (${Math.round(QUICK_SERVICE_BOOKING_FEE_RATE * 100)}%): ${formatPrice(fee)}`,
                )}
              </Text>
            );
          })()}
          <TextInput
            value={counterNote}
            onChangeText={setCounterNote}
            placeholder={L("Add a note (optional)", "Agrega una nota (opcional)")}
            placeholderTextColor="#64748B"
            multiline
            style={styles.counterOfferNote}
          />
          <Pressable
            onPress={() => void handleCounterOffer()}
            disabled={isSubmitting}
            style={({ pressed }) => [
              styles.counterOfferBtn,
              pressed && !isSubmitting && { opacity: 0.9 },
              isSubmitting && { opacity: 0.7 },
            ]}
          >
            <Text style={styles.counterOfferBtnText}>
              {L("Adjust & send back", "Ajustar y enviar de vuelta")}
            </Text>
          </Pressable>

          <View style={styles.partsDivider} />
          <Text style={styles.sectionTitle}>{L("Need parts?", "¿Necesitas piezas?")}</Text>
          <Text style={styles.counterOfferText}>
            {L(
              "Propose a reimbursement with a receipt — the customer authorizes a separate hold for it.",
              "Propón un reembolso con recibo — el cliente autoriza una retención separada para esto.",
            )}
          </Text>
          {partsProposed ? (
            <Text style={styles.partsSentText}>
              {L("Parts cost sent — waiting on the customer.", "Costo de piezas enviado — esperando al cliente.")}
            </Text>
          ) : (
            <>
              <View style={styles.counterOfferInputRow}>
                <Text style={styles.counterOfferCurrency}>$</Text>
                <TextInput
                  value={partsCostInput}
                  onChangeText={(value) => setPartsCostInput(normalizeEditableMoneyInput(value))}
                  placeholder={formatEditableMoney(0, region)}
                  placeholderTextColor="#64748B"
                  keyboardType="decimal-pad"
                  style={styles.counterOfferInput}
                />
              </View>
              <Pressable onPress={() => void handlePickReceipt()} style={styles.receiptBtn}>
                <IconSymbol name="camera.fill" size={16} color="#94A3B8" />
                <Text style={styles.receiptBtnText}>
                  {partsReceipt
                    ? L("Receipt attached — retake", "Recibo adjunto — volver a tomar")
                    : L("Attach receipt photo", "Adjuntar foto del recibo")}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => void handleProposeParts()}
                disabled={partsSubmitting}
                style={({ pressed }) => [
                  styles.counterOfferBtn,
                  pressed && !partsSubmitting && { opacity: 0.9 },
                  partsSubmitting && { opacity: 0.7 },
                ]}
              >
                <Text style={styles.counterOfferBtnText}>
                  {L("Send parts cost", "Enviar costo de piezas")}
                </Text>
              </Pressable>
            </>
          )}
        </View>

        {job.remoteRequestId ? (
          <Pressable
            onPress={() =>
              router.push({
                pathname: "/messages" as any,
                params: { requestId: job.remoteRequestId, peerName: job.customerName },
              } as any)
            }
            style={({ pressed }) => [styles.messageBtn, pressed && { opacity: 0.92 }]}
          >
            <IconSymbol name="message.fill" size={18} color="#F97316" />
            <Text style={styles.messageBtnText}>{L("Message customer", "Mensaje al cliente")}</Text>
            <IconSymbol name="chevron.right" size={14} color="#94A3B8" />
          </Pressable>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          onPress={() => void handleDecline(false)}
          disabled={isSubmitting}
          style={({ pressed }) => [styles.declineBtn, pressed && { opacity: 0.88 }]}
        >
          <Text style={styles.declineText}>{L("Decline", "Rechazar")}</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <PrimaryButton
            title={L("Accept job", "Aceptar trabajo")}
            onPress={() => void handleAccept()}
            hapticType="success"
            iconLeft={<IconSymbol name="checkmark" size={18} color="#FFFFFF" />}
            disabled={isSubmitting}
            loading={isSubmitting}
          />
        </View>
      </View>
    </ScreenContainer>
  );
}

function StatChip({
  icon,
  label,
  value,
  accent = "#0F172A",
}: {
  icon: string;
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <View style={styles.statChip}>
      <IconSymbol name={icon} size={14} color="#F97316" />
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color: accent }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function Row({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>
        <IconSymbol name={icon} size={16} color="#F97316" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
    </View>
  );
}

const cardShadow = Platform.select({
  ios: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
  },
  android: { elevation: 4 },
  default: {},
});

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 132,
    gap: 14,
  },
  urgencyBand: {
    marginHorizontal: 20,
    marginTop: 8,
    backgroundColor: "#0B1220",
    borderRadius: 20,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    ...cardShadow,
  },
  urgencyCopy: { flex: 1, gap: 6 },
  livePill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(249,115,22,0.16)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#F97316",
  },
  livePillText: {
    color: "#FDBA74",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  urgencyTitle: { fontSize: 20, fontWeight: "800", color: "#F8FAFC" },
  urgencySub: { fontSize: 13, color: "#94A3B8", lineHeight: 18 },
  countdownWrap: {
    width: 72,
    height: 72,
    alignItems: "center",
    justifyContent: "center",
  },
  countdownLabel: {
    position: "absolute",
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  heroCard: {
    marginHorizontal: 20,
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 22,
    padding: 18,
    gap: 14,
    ...cardShadow,
  },
  heroCardBooked: {
    backgroundColor: "#172033",
    borderColor: "#F97316",
  },
  serviceChip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(249,115,22,0.12)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(249,115,22,0.26)",
  },
  serviceChipText: { fontSize: 12, fontWeight: "800", color: "#FDBA74" },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 14 },
  customerName: { fontSize: 22, fontWeight: "800", color: "#F8FAFC" },
  vehicle: { fontSize: 14, color: "#CBD5E1", marginTop: 3, fontWeight: "600" },
  pickupHint: { fontSize: 12, color: "#94A3B8", marginTop: 4 },
  statsRow: { flexDirection: "row", gap: 8 },
  statChip: {
    flex: 1,
    backgroundColor: "#0B1220",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: "#334155",
  },
  statLabel: {
    fontSize: 10,
    color: "#94A3B8",
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  statValue: { fontSize: 13, fontWeight: "800", color: "#F8FAFC" },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeBooked: { backgroundColor: "#C2410C" },
  badgeQuote: { backgroundColor: "#1D4ED8" },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  detailsCard: {
    marginHorizontal: 20,
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 20,
    padding: 16,
    gap: 4,
    ...cardShadow,
  },
  counterOfferCard: {
    marginHorizontal: 20,
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 20,
    padding: 16,
    gap: 10,
    ...cardShadow,
  },
  sectionTitle: {
    fontSize: 12,
    color: "#94A3B8",
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  row: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 10, gap: 12 },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(249,115,22,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { fontSize: 11, color: "#94A3B8", fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  rowValue: { fontSize: 15, color: "#F8FAFC", fontWeight: "600", marginTop: 2, lineHeight: 20 },
  noteCard: {
    marginTop: 8,
    backgroundColor: "#0B1220",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#334155",
    gap: 6,
  },
  noteHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  noteTitle: { fontSize: 12, fontWeight: "800", color: "#CBD5E1", textTransform: "uppercase" },
  noteBody: { fontSize: 14, color: "#F8FAFC", lineHeight: 20 },
  counterOfferText: { fontSize: 13, color: "#CBD5E1", lineHeight: 18 },
  counterOfferInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  counterOfferCurrency: {
    fontSize: 18,
    fontWeight: "800",
    color: "#F97316",
  },
  counterOfferInput: {
    flex: 1,
    color: "#F8FAFC",
    fontSize: 16,
    fontWeight: "700",
    paddingVertical: 0,
  },
  counterOfferBreakdown: {
    fontSize: 12,
    color: "#94A3B8",
    marginTop: 6,
    marginBottom: 4,
  },
  counterOfferNote: {
    minHeight: 72,
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: "#F8FAFC",
    fontSize: 14,
    textAlignVertical: "top",
  },
  counterOfferBtn: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: "#F97316",
    borderWidth: 1,
    borderColor: "#FB923C",
  },
  counterOfferBtnText: { color: "#FFFFFF", fontWeight: "900", fontSize: 15 },
  partsDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#334155",
    marginVertical: 4,
  },
  partsSentText: {
    fontSize: 13,
    color: "#34D399",
    fontWeight: "600",
  },
  receiptBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#334155",
    borderStyle: "dashed",
  },
  receiptBtnText: { color: "#94A3B8", fontSize: 13, fontWeight: "600" },
  messageBtn: {
    marginHorizontal: 20,
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#111827",
    ...cardShadow,
  },
  messageBtnText: { flex: 1, fontSize: 15, fontWeight: "700", color: "#F8FAFC" },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#0B1220",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#334155",
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
      },
      android: { elevation: 10 },
      default: {},
    }),
  },
  declineBtn: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: "#1F2937",
    borderWidth: 1,
    borderColor: "#475569",
  },
  declineText: { color: "#F8FAFC", fontWeight: "900", fontSize: 15 },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  emptyText: { fontSize: 15, color: "#64748B" },
});
