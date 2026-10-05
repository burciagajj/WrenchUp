import { ScrollView, StyleSheet, Text, View, Pressable, Alert, Platform, Linking } from "react-native";
import { Image } from "expo-image";
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from "react-native-reanimated";
import * as Contacts from "expo-contacts";
import * as LocalAuthentication from "expo-local-authentication";
import * as SMS from "expo-sms";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScreenContainer } from "@/components/screen-container";
import { useActiveJob, useStore } from "@/lib/store";
import { getServiceType } from "@/lib/seed";
import { LiveMap } from "@/components/live-map";
import { interpolate, haversineMeters, metersToMiles } from "@/lib/geo";
import { Avatar } from "@/components/avatar";
import { RatingStars } from "@/components/rating-stars";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { PrimaryButton } from "@/components/primary-button";
import { haptic } from "@/lib/haptics";
import { notifyNow, ensureNotificationPermissions } from "@/lib/notifications";
import type { JobStatus } from "@/lib/types";
import { useLocaleContext, useL } from "@/hooks/use-locale";
import { localizedServiceName } from "@/lib/service-i18n";
import { updateDispatchStatus } from "@/lib/live-dispatch";
import { forceCustomerLiveJobPoll } from "@/components/customer-live-job-sync";
import { useAuth } from "@/lib/auth-context";
import { resolveAuthSession } from "@/lib/resolve-auth-session";
import { useMechanicOffers } from "@/hooks/use-mechanic-offers";
import { usePartsCostProposal } from "@/hooks/use-parts-cost-proposal";
import { PartsCostApprovalCard } from "@/components/parts-cost-approval-card";
import { createSafetyReport } from "@/lib/safety";
import { saveUserHistory } from "@/lib/user-history-cache";
import { isMechanicLocationStale } from "@/lib/live-location-freshness";
import { useTapGuard } from "@/hooks/use-tap-guard";
import { CANCELLATION_FEE_USD } from "@/lib/cancellation-fee-core";

// Internal flow for simulated (non-remote) progression - keep for timer logic
const FLOW: { status: JobStatus; duration: number }[] = [
  { status: "searching", duration: 4000 },
  { status: "accepted", duration: 3000 },
  { status: "enroute", duration: 12000 },
  { status: "arrived", duration: 3000 },
  { status: "in_progress", duration: 12000 },
];

export default function TrackingScreen() {
  const router = useRouter();
  const job = useActiveJob();
  const { dispatch, state } = useStore();
  const { user } = useAuth();
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const matchedShownForJobRef = useRef<string | null>(null);
  const guardCancel = useTapGuard();
  const guardSecureComplete = useTapGuard();
  const [elapsedEnroute, setElapsedEnroute] = useState(0);
  const { offers: mechanicOffers } = useMechanicOffers(job);
  const { proposal: partsProposal, reload: reloadPartsProposal } = usePartsCostProposal(job?.remoteRequestId);
  const [partsSessionToken, setPartsSessionToken] = useState<string | null>(null);
  useEffect(() => {
    if (!user) return;
    let alive = true;
    void resolveAuthSession(user).then((resolved) => {
      if (alive && resolved) setPartsSessionToken(resolved.sessionToken);
    });
    return () => {
      alive = false;
    };
  }, [user]);
  // The badge should only ever reflect offers the customer can actually act
  // on right now — mechanicOffers accumulates every offer ever sent on this
  // request (including from mechanics who later declined/were reassigned
  // away), so a raw count would stay stuck showing a stale number forever
  // once the offering mechanic is no longer on the job.
  const actionableOfferCount = mechanicOffers.filter((o) => o.mechanicUserId === job?.mechanicId).length;

  const prevStatusRef = useRef<JobStatus | null>(null);
  const statusAnim = useSharedValue(0);
  const headlineAnimatedStyle = useAnimatedStyle(() => ({
    opacity: 0.7 + statusAnim.value * 0.3,
    transform: [{ scale: 0.98 + statusAnim.value * 0.02 }],
  }));

  const { t, locale, region, formatPrice } = useLocaleContext();
  const L = useL();
  const cancellationFeeLabel = formatPrice(CANCELLATION_FEE_USD);

  const mechanic = useMemo(() => {
    if (!job?.mechanicName) return undefined;
    return {
      id: job.mechanicId || "assigned",
      name: job.mechanicName,
      photoUrl: job.mechanicPhotoUrl ?? "",
      rating: 4.9,
      jobsCompleted: 0,
      yearsExperience: 5,
      hourlyRate: 0,
      etaMinutes: 12,
      distanceMiles: 1.8,
      vehicle: L("Service Vehicle", "Vehículo de servicio"),
      bio: "",
      specialties: [],
      certifications: [],
      reviews: [],
      offsetMeters: { east: 250, north: 220 },
    };
  }, [job?.mechanicId, job?.mechanicName, job?.mechanicPhotoUrl, L]);
  const service = job ? getServiceType(job.service) : undefined;
  const waitingOnMechanicConfirmation = !!job?.customerQuoteAcceptedAt && job.status === "searching";

  // Ask for notification permission once when this screen mounts (best place since user just acted).
  useEffect(() => {
    ensureNotificationPermissions();
  }, []);

  // Reanimated tweak: smooth pulse/highlight when mechanic status updates live
  useEffect(() => {
    if (job?.status && job.status !== prevStatusRef.current) {
      prevStatusRef.current = job.status;
      statusAnim.value = 0;
      statusAnim.value = withTiming(1, { duration: 600 });
    }
  }, [job?.status, statusAnim]);

  // Show a mechanic profile modal when the match is accepted.
  useEffect(() => {
    if (!job?.id) return;
    if (job.status === "accepted" && mechanic && matchedShownForJobRef.current !== job.id) {
      matchedShownForJobRef.current = job.id;
      router.push("/matched-mechanic" as any);
      return;
    }
    if (job.status === "cancelled" || job.status === "completed") {
      matchedShownForJobRef.current = null;
    }
  }, [job?.id, job?.status, mechanic, router]);

  // Drive the state machine
  useEffect(() => {
    if (job?.remoteRequestId) return;
    if (!job) return;
    // Cancel earlier timers
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];

    const fromIndex = FLOW.findIndex((f) => f.status === job.status);
    if (fromIndex < 0 || fromIndex >= FLOW.length - 1) return;

    let cumulative = 0;
    for (let i = fromIndex + 1; i < FLOW.length; i++) {
      const step = FLOW[i];
      cumulative += FLOW[i - 1].duration;
      const handle = setTimeout(() => {
        if (Platform.OS !== "web") {
          haptic.medium();
        }
        dispatch({ type: "UPDATE_JOB_STATUS", payload: { id: job.id, status: step.status } });
        emitNotification(
          step.status,
          mechanic?.name ?? "Your mechanic",
          service ? localizedServiceName(service.code, locale) : "service",
          ((key: string, params?: Record<string, string | number>) => t(key as any, params)) as any,
        );
      }, cumulative);
      timersRef.current.push(handle);
    }

    return () => {
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current = [];
    };
    // Re-run when status changes so we don't double-schedule
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status, job?.id]);

  // Tick down enroute ETA
  useEffect(() => {
    if (!job || job.status !== "enroute") {
      setElapsedEnroute(0);
      return;
    }
    setElapsedEnroute(0);
    const start = Date.now();
    const id = setInterval(() => {
      setElapsedEnroute(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [job?.status, job?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- job object identity is unstable; we only need status/id

  // Compute display ETA from live distance (shared reality for customer/mechanic).
  // Memoized to avoid expensive recalc on every render during 1s timer ticks.
  const liveMechanicPoint = useMemo(
    () => (job ? job.mechanicLiveCoords ?? computeMechanicLive(job, elapsedEnroute) : null),
    [job, elapsedEnroute]
  );
  const liveEta = useMemo(
    () => (liveMechanicPoint && job ? estimateEtaMinutes(liveMechanicPoint, job.pickup ?? null) : null),
    [liveMechanicPoint, job]
  );
  // Deliberately NOT memoized on a fixed dependency list — this needs to flip to
  // stale purely from time passing, with no new data arriving. It's cheap, and
  // the screen already re-renders every 2-5s from the background poll/realtime
  // sync (components/customer-live-job-sync.tsx) even when nothing changed.
  const isRealMechanicLocation = !!job?.mechanicLiveCoords;
  const mechanicLocationStale =
    isRealMechanicLocation && isMechanicLocationStale(job?.mechanicLocationUpdatedAt ?? null);
  const displayEta = mechanicLocationStale ? null : liveEta;

  const handleCall = useCallback(() => {
    haptic.light();
    if (Platform.OS === "web") {
      console.log("Pretending to call", mechanic?.name ?? "mechanic");
    } else {
      Alert.alert(L("Call mechanic", "Llamar al mecánico"), `${L("Calling", "Llamando a")} ${mechanic?.name ?? L("your mechanic", "tu mecánico")}…`, [{ text: L("OK", "OK") }]);
    }
  }, [L, mechanic?.name]);

  const handleMessage = useCallback(() => {
    haptic.light();
    if (!job?.remoteRequestId) return;
    router.push({
      pathname: "/messages" as any,
      params: { requestId: job.remoteRequestId, peerName: mechanic?.name ?? "Mechanic" },
    } as any);
  }, [job?.remoteRequestId, mechanic?.name, router]);

  if (!job) {
    return (
      <ScreenContainer showBackButton title={t("tracking.title")}>
        <View style={styles.emptyWrap}>
          <View style={styles.emptyIcon}>
            <IconSymbol name="checkmark.circle.fill" size={42} color="#10B981" />
          </View>
          <Text style={styles.emptyTitle}>{t("tracking.no_active")}</Text>
          <Text style={styles.emptyText}>{t("tracking.no_active")}</Text>
          <PrimaryButton
            title={t("tracking.back_home")}
            fullWidth={false}
            onPress={() => router.replace("/(tabs)" as any)}
          />
        </View>
      </ScreenContainer>
    );
  }
  if (!service) {
    // Harden: show basic info even without service type
    return (
      <ScreenContainer showBackButton title={t("tracking.title")}>
        <View style={{ padding: 20 }}>
          <Text style={{ color: "#F8FAFC", fontSize: 18, fontWeight: "800" }}>{L("Active request", "Solicitud activa")}</Text>
          <Text style={{ color: "#CBD5E1", marginTop: 8 }}>{job.location}</Text>
          <PrimaryButton title={t("tracking.back_home")} onPress={() => router.replace("/(tabs)" as any)} />
        </View>
      </ScreenContainer>
    );
  }

  const handleCancel = () => {
    const confirm = guardCancel(async () => {
      haptic.warning();
      let synced = true;
      if (job.remoteRequestId && user?.id) {
        try {
          const resolved = await resolveAuthSession(user);
          if (!resolved) {
            synced = false;
          } else {
            synced = (await updateDispatchStatus(resolved.sessionToken, job.remoteRequestId, "cancelled", {
              cancelledByRole: "customer",
              cancelledByUserId: user.id,
            })).ok;
          }
        } catch (error) {
          console.error("[Tracking] Failed to cancel remote request:", error);
          synced = false;
        }
        if (!synced) {
          Alert.alert(
            L("Connection issue", "Problema de conexión"),
            L("Could not cancel right now. Please try again.", "No se pudo cancelar ahora. Inténtalo de nuevo."),
          );
          return;
        }
      }
      dispatch({ type: "UPDATE_JOB_STATUS", payload: { id: job.id, status: "cancelled" } });
      if (user) await saveUserHistory(user.id, {
        jobs: state.jobs.map((item) =>
          item.id === job.id
            ? {
                ...item,
                status: "cancelled",
                cancelledAt: Date.now(),
                cancelledByRole: "customer",
              }
            : item,
        ),
        activeJobId: null,
        mechanicJobs: state.mechanicJobs,
        mechanicActiveJobId: state.mechanicActiveJobId,
        paymentMethods: state.paymentMethods,
        defaultPaymentMethodId: state.defaultPaymentMethodId,
      });

      const mechanicHasStartedTrip = ["enroute", "arrived", "in_progress"].includes(job.status);
      const mechanicWasAssigned = ["accepted", "enroute", "arrived", "in_progress"].includes(job.status);

      // Explicit notification for the cancellation (inbox + push)
      const cancelTitle = job.isBooked ? L("Booked service cancelled", "Servicio reservado cancelado") : L("Request cancelled", "Solicitud cancelada");
      const cancelBody = mechanicHasStartedTrip
        ? L(
            `Your service request has been cancelled. A cancellation fee of ${cancellationFeeLabel} applies only if the mechanic had already driven a significant distance toward you; otherwise you will not be charged.`,
            `Tu solicitud de servicio fue cancelada. Se aplica una tarifa de cancelación de ${cancellationFeeLabel} solo si el mecánico ya había recorrido una distancia importante hacia ti; de lo contrario no se te cobrará.`,
          )
        : mechanicWasAssigned
          ? L(
              "Your service request has been cancelled. No fee was charged because the mechanic had not started heading to you yet.",
              "Tu solicitud de servicio fue cancelada. No se cobró ninguna tarifa porque el mecánico aún no había comenzado a ir hacia ti.",
            )
          : L(
              "Your service request has been cancelled. No fee was charged because no mechanic had been assigned yet.",
              "Tu solicitud de servicio fue cancelada. No se cobró ninguna tarifa porque aún no se había asignado un mecánico.",
            );
      dispatch({
        type: "ADD_INBOX_NOTIFICATION",
        payload: {
          id: `cancel-${job.id}-${Date.now()}`,
          title: cancelTitle,
          body: cancelBody,
          createdAt: Date.now(),
          roleScope: "customer",
          route: "/(tabs)/activity",
        },
      });
      notifyNow({ title: cancelTitle, body: cancelBody });

      Alert.alert(L("Trip canceled", "Viaje cancelado"), cancelBody, [
        { text: L("OK", "OK"), onPress: () => router.replace("/(tabs)" as any) },
      ]);
    });
    if (Platform.OS === "web") {
      confirm();
    } else {
      const isLateCancel = ["enroute", "arrived", "in_progress"].includes(job.status);
      const mechanicWasAssigned = ["accepted", "enroute", "arrived", "in_progress"].includes(job.status);
      const title = job.isBooked ? L("Cancel booked service", "Cancelar servicio reservado") : L("Cancel service", "Cancelar servicio");
      const message = isLateCancel
        ? L(
            `Mechanic is already en route or on site.\n\nA ${cancellationFeeLabel} cancellation fee applies if they have already driven a significant part of the way to you (at least half a mile and a quarter of their trip). Otherwise you will not be charged. Proceed?`,
            `El mecánico ya va en camino o está en el sitio.\n\nSe aplica una tarifa de cancelación de ${cancellationFeeLabel} si ya recorrió una parte importante del camino hacia ti (al menos media milla y una cuarta parte de su trayecto). De lo contrario no se te cobrará. ¿Deseas continuar?`,
          )
        : mechanicWasAssigned
          ? L(
              "A mechanic has been assigned, but they have not started heading to you yet.\n\nNo cancellation fee should apply yet. Proceed?",
              "Ya se asignó un mecánico, pero aún no ha comenzado a ir hacia ti.\n\nTodavía no debería aplicarse una tarifa de cancelación. ¿Deseas continuar?",
            )
          : L(
              "Are you sure you want to cancel this request? No fee applies if we haven't assigned a mechanic yet.",
              "¿Seguro que quieres cancelar esta solicitud? No aplica cargo si todavía no hemos asignado un mecánico.",
          )
          ;

      Alert.alert(title, message, [
        { text: L("Keep job", "Mantener solicitud"), style: "cancel" },
        { text: L("Cancel job", "Cancelar solicitud"), style: "destructive", onPress: () => void confirm() },
      ]);
    }
  };
  const handleComplete = () => {
    haptic.success();
    router.replace({ pathname: "/complete" as any, params: { jobId: job.id } } as any);
  };

  // Safety features for customer during active service
  const handleSafety = async () => {
    haptic.warning();
    const persistSafetyReport = async (reportType: "emergency" | "safety_issue", message: string) => {
      if (!job.remoteRequestId || !user?.id) return false;
      const resolved = await resolveAuthSession(user);
      if (!resolved) return false;
      return createSafetyReport({
        sessionToken: resolved.sessionToken,
        role: "customer",
        requestId: job.remoteRequestId,
        reportType,
        message,
      });
    };
    const options = [
      {
        text: L("Call Emergency Services (911)", "Llamar servicios de emergencia (911)"),
        onPress: async () => {
          haptic.error();
          const emergencyNum = "911";
          if (Platform.OS !== "web") {
            try {
              await Linking.openURL(`tel:${emergencyNum}`);
            } catch {}
          }
          Alert.alert(
            L("Emergency", "Emergencia"),
            L("Calling emergency services and sharing live location + job details.", "Llamando a emergencias y compartiendo ubicación + detalles del trabajo.")
          );
          // Log safety event
          dispatch({
            type: "ADD_INBOX_NOTIFICATION",
            payload: {
              id: `safety-emergency-${job.id}-${Date.now()}`,
              title: L("Emergency services contacted", "Servicios de emergencia contactados"),
              body: L("You requested emergency help during your service.", "Solicitaste ayuda de emergencia durante tu servicio."),
              createdAt: Date.now(),
              roleScope: "customer",
              route: "/tracking",
            },
          });
          notifyNow({
            title: L("Emergency reported", "Emergencia reportada"),
            body: L("Emergency services were contacted for your job.", "Se contactaron servicios de emergencia para tu trabajo."),
          });
          void persistSafetyReport(
            "emergency",
            `Customer called emergency services for ${job.service} at ${job.location}.`,
          );
        },
      },
      {
        text: L("Share Live Location with Contact", "Compartir ubicación en vivo con contacto"),
        onPress: async () => {
          try {
            const { status } = await Contacts.requestPermissionsAsync();
            if (status === "granted") {
              const contacts = await Contacts.getContactsAsync({ fields: [Contacts.Fields.PhoneNumbers] });
              const withPhone = contacts.data.filter((c) => c.phoneNumbers && c.phoneNumbers.length > 0);
              if (withPhone.length > 0) {
                const contact = withPhone[0]; // demo: first with phone; in prod show picker
                const phone = contact.phoneNumbers?.[0]?.number || "";
                // Attempt real SMS send via expo-sms (guarded for web/unavailable)
                let smsSent = false;
                if (Platform.OS !== "web") {
                  try {
                    const available = await SMS.isAvailableAsync();
                    if (available && phone) {
                      const liveNote = `WrenchUp safety share: job #${job.id} at ${job.location}. Live location: https://maps.apple.com/?q=${encodeURIComponent(job.location)} (demo)`;
                      await SMS.sendSMSAsync([phone], liveNote);
                      smsSent = true;
                    }
                  } catch {}
                }
                Alert.alert(
                  L("Location Shared", "Ubicación compartida"),
                  smsSent
                    ? L(`SMS sent to ${contact.name || phone} with live location for job #${job.id}.`, `SMS enviado a ${contact.name || phone} con ubicación en vivo para trabajo #${job.id}.`)
                    : L(`Shared live location and job #${job.id} with ${contact.name || phone}. (SMS unavailable)`, `Compartido ubicación y trabajo #${job.id} con ${contact.name || phone}. (SMS no disponible)`)
                );
                dispatch({
                  type: "ADD_INBOX_NOTIFICATION",
                  payload: {
                    id: `safety-share-${job.id}-${Date.now()}`,
                    title: L("Live location shared", "Ubicación en vivo compartida"),
                    body: L(`Shared with contact during service at ${job.location}.`, `Compartido con contacto durante servicio en ${job.location}.`),
                    createdAt: Date.now(),
                    roleScope: "customer",
                    route: "/tracking",
                  },
                });
              } else {
                Alert.alert(L("No contacts", "Sin contactos"), L("No contacts with phone numbers found on device.", "No se encontraron contactos con números en el dispositivo."));
              }
            } else {
              Alert.alert(L("Permission needed", "Permiso requerido"), L("Contacts permission required to share location with trusted contact.", "Se requiere permiso de contactos para compartir ubicación con un contacto de confianza."));
            }
          } catch {
            Alert.alert(L("Error", "Error"), L("Could not share location.", "No se pudo compartir la ubicación."));
          }
        },
      },
      {
        text: L("Report Safety Issue to Support", "Reportar problema de seguridad a soporte"),
        onPress: async () => {
          const persisted = await persistSafetyReport(
            "safety_issue",
            `Customer reported a safety issue during ${job.service} at ${job.location}.`,
          );
          dispatch({
            type: "ADD_INBOX_NOTIFICATION",
            payload: {
              id: `safety-issue-${job.id}-${Date.now()}`,
              title: L("Safety issue reported", "Problema de seguridad reportado"),
              body: L(`Reported during service at ${job.location}. Support will contact you.`, `Reportado durante servicio en ${job.location}. Soporte te contactará.`),
              createdAt: Date.now(),
              roleScope: "customer",
              route: "/tracking",
            },
          });
          notifyNow({ title: L("Safety reported", "Seguridad reportada"), body: L("Thank you. Our team is notified.", "Gracias. Nuestro equipo ha sido notificado.") });
          Alert.alert(
            persisted ? L("Reported", "Reportado") : L("Report saved locally", "Reporte guardado localmente"),
            persisted
              ? L("Thank you. A support agent has been notified and will follow up.", "Gracias. Un agente de soporte ha sido notificado y dará seguimiento.")
              : L("We could not reach support right now. Please try again if this is urgent.", "No pudimos contactar a soporte ahora. Intenta de nuevo si es urgente."),
          );
        },
      },
      { text: L("Cancel", "Cancelar"), style: "cancel" as const },
    ];
    Alert.alert(
      L("Safety & Emergency", "Seguridad y Emergencia"),
      L("Your location and job details are being shared with the platform. Choose an action:", "Tu ubicación y detalles del trabajo se comparten con la plataforma. Elige una acción:"),
      options
    );
  };

  // Biometric gate for sensitive payout-releasing confirm (extra authentication)
  const handleSecureComplete = guardSecureComplete(async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      if (hasHardware) {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: L("Confirm service completion with biometrics", "Confirma la finalización con biometría"),
          fallbackLabel: L("Use passcode", "Usar código"),
        });
        if (result.success) {
          handleComplete();
        } else {
          Alert.alert(L("Authentication failed", "Autenticación fallida"), L("Could not verify identity.", "No se pudo verificar la identidad."));
        }
      } else {
        handleComplete();
      }
    } catch {
      handleComplete();
    }
  });

  // Same reasoning as the mechanic's active job screen: once matched/active,
  // there's no previous screen it's safe to pop back to — the default
  // router.back() could resurface request-pending.tsx (or book-service.tsx)
  // still sitting in history, from which "Cancel request" could cancel an
  // already-active job.
  const handleBackFromTracking = () => {
    haptic.light();
    router.replace("/(tabs)" as any);
  };

  return (
    <ScreenContainer
      edges={["left", "right"]}
      showBackButton
      onBack={handleBackFromTracking}
      title={t("tracking.title")}
      headerRight={
        <Pressable 
          onPress={() => {
            haptic.selection();
            forceCustomerLiveJobPoll();
          }}
          hitSlop={10}
          style={{ padding: 8 }}
        >
          <IconSymbol name="arrow.clockwise" size={20} color="#FFFFFF" />
        </Pressable>
      }
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        {/* Content starts cleanly below the new consistent header */}

        {/* Map card */}
        <View style={{ paddingHorizontal: 20, marginTop: 4 }}>
          <LiveMap
            status={mapStatus(job.status)}
            pickup={job.pickup ?? null}
            mechanic={liveMechanicPoint}
            etaMinutes={job.status === "accepted" || job.status === "enroute" ? displayEta ?? undefined : undefined}
          />
        </View>

        {/* Status headline - animates on live mechanic status updates */}
          <Animated.View style={[styles.headline, headlineAnimatedStyle]}>
          <Text style={styles.headlineTitle}>{statusHeadline(job.status, displayEta, t as any)}</Text>
          <Text style={styles.headlineSub}>{localizedServiceName(service.code, locale)} • {job.location}</Text>
          {(job.status === "accepted" || job.status === "enroute") &&
            (mechanicLocationStale ? (
              <View style={{ marginTop: 8, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(251,191,36,0.16)", borderWidth: 1, borderColor: "rgba(251,191,36,0.5)", paddingHorizontal: 9, paddingVertical: 3, borderRadius: 7 }}>
                <IconSymbol name="exclamationmark.triangle.fill" size={10} color="#FCD34D" />
                <Text style={{ color: "#FDE68A", fontSize: 11, fontWeight: "800" }}>
                  {L("Location may be outdated", "La ubicación puede estar desactualizada")}
                </Text>
              </View>
            ) : (
              displayEta ? (
                <View style={{ marginTop: 8, alignSelf: "flex-start", backgroundColor: "rgba(20,184,166,0.18)", borderWidth: 1, borderColor: "rgba(94,234,212,0.5)", paddingHorizontal: 9, paddingVertical: 3, borderRadius: 7 }}>
                  <Text style={{ color: "#FFEDD5", fontSize: 11, fontWeight: "800" }}>{L("LIVE ETA", "ETA EN VIVO")}: ~{displayEta} min</Text>
                </View>
              ) : null
            ))}
        </Animated.View>

        {partsProposal && partsSessionToken && job.remoteRequestId ? (
          <View style={{ paddingHorizontal: 20, marginTop: 14 }}>
            <PartsCostApprovalCard
              requestId={job.remoteRequestId}
              partsCost={partsProposal.partsCost}
              currency={partsProposal.currency}
              sessionToken={partsSessionToken}
              formatPrice={formatPrice}
              onApproved={() => void reloadPartsProposal()}
              onDeclined={() => void reloadPartsProposal()}
            />
          </View>
        ) : null}

        {/* Mechanic row */}
        {mechanic ? (
          <View style={styles.mechanicRow}>
            <Avatar name={mechanic.name} url={mechanic.photoUrl} size={52} />
            <View style={{ flex: 1 }}>
              <Text style={styles.mechanicName}>{mechanic.name}</Text>
              <RatingStars rating={mechanic.rating} size={11} />
              <Text style={styles.mechanicVehicle}>{mechanic.vehicle}</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <ActionBtn icon="phone.fill" onPress={handleCall} />
              <ActionBtn icon="message.fill" onPress={handleMessage} />
            </View>
          </View>
        ) : (
          <View style={styles.mechanicRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.mechanicName}>{L("Finding your mechanic…", "Buscando a tu mecánico…")}</Text>
              <Text style={styles.mechanicVehicle}>{L("You’ll see profile details as soon as one accepts.", "Verás los detalles del perfil en cuanto uno acepte.")}</Text>
            </View>
          </View>
        )}

        {waitingOnMechanicConfirmation ? (
          <View style={{ marginHorizontal: 20, marginTop: 12, backgroundColor: "#0B2545", borderWidth: 1, borderColor: "#60A5FA", borderRadius: 12, padding: 12, gap: 6 }}>
            <Text style={{ color: "#EFF6FF", fontWeight: "800", fontSize: 15 }}>
              {L("Offer accepted", "Oferta aceptada")}
            </Text>
            <Text style={{ color: "#DBEAFE", fontSize: 13, lineHeight: 18 }}>
              {job.mechanicName
                ? `${job.mechanicName} ${L("has not confirmed yet.", "aún no confirma.")}`
                : L("Waiting for mechanic confirmation.", "Esperando confirmación del mecánico.")}
            </Text>
            <Text style={{ color: "#BFDBFE", fontSize: 12, fontWeight: "800" }}>
              {L("We’ll notify you as soon as they accept.", "Te avisaremos en cuanto acepte.")}
            </Text>
          </View>
        ) : job.status === "searching" && actionableOfferCount > 0 ? (
          <Pressable
            onPress={() => {
              haptic.light();
              router.push("/mechanic-offers" as any);
            }}
            style={({ pressed }) => [styles.offersButton, pressed && { opacity: 0.9 }]}
          >
            <IconSymbol name="tag.fill" size={16} color="#FFFFFF" />
            <Text style={styles.offersButtonText}>
              {L("Offers from mechanics", "Ofertas de mecánicos")} ({actionableOfferCount})
            </Text>
            <IconSymbol name="chevron.right" size={14} color="#FFFFFF" />
          </Pressable>
        ) : null}

        {/* Service evidence photos (before/after) if provided by mechanic */}
        {(job.beforePhotoUrl || job.afterPhotoUrl) && job.status !== "searching" && (
          <View style={{ marginHorizontal: 20, marginTop: 12 }}>
            <Text style={{ color: "#E2E8F0", fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>{L("Service Evidence", "Evidencia del servicio")}</Text>
            <View style={{ flexDirection: "row", gap: 12 }}>
              {job.beforePhotoUrl && (
                <View style={{ flex: 1 }}>
                  <Text style={{ color: "#CBD5E1", fontSize: 11, marginBottom: 4, fontWeight: "700" }}>{L("Before", "Antes")}</Text>
                  {/* Simple image placeholder - in real would use <Image> from expo-image */}
                  <View style={{ height: 100, borderRadius: 8, overflow: "hidden", borderWidth: 1, borderColor: "#334155" }}>
                    <Image source={{ uri: job.beforePhotoUrl }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                  </View>
                </View>
              )}
              {job.afterPhotoUrl && (
                <View style={{ flex: 1 }}>
                  <Text style={{ color: "#CBD5E1", fontSize: 11, marginBottom: 4, fontWeight: "700" }}>{L("After", "Después")}</Text>
                  <View style={{ height: 100, borderRadius: 8, overflow: "hidden", borderWidth: 1, borderColor: "#334155" }}>
                    <Image source={{ uri: job.afterPhotoUrl }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                  </View>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Customer Status Timeline - updates live based on mechanic status */}
        <View style={styles.timelineCard}>
          <Text style={styles.timelineTitle}>{L("Service Status", "Estado del servicio")}</Text>
          <Text style={{ color: "#CBD5E1", fontSize: 12, marginBottom: 12, lineHeight: 17 }}>
            {L("Updates automatically as your mechanic progresses", "Se actualiza automáticamente a medida que avanza tu mecánico")}
          </Text>
          {(["accepted", "enroute", "arrived", "in_progress", "completed"] as JobStatus[]).map((status, idx, steps) => {
            const currentIdx = steps.findIndex((x) => x === job.status);
            const done = idx < currentIdx || (job.status === "completed" && idx === steps.length - 1);
            const active = status === job.status;
            const copy = customerStatusCopy(status, locale === "es-MX");
            return (
              <TimelineRow
                key={status}
                label={copy.label}
                description={copy.desc}
                done={done}
                active={active}
                isLast={idx === steps.length - 1}
              />
            );
          })}
        </View>

        {/* Actions */}
        <View style={{ paddingHorizontal: 20, marginTop: 16, gap: 10 }}>
          {/* Customer must explicitly confirm completion after mechanic marks job done */}
          {job.status === "in_progress" && !!job.mechanicMarkedDoneAt ? (
            <>
              <View style={{
                backgroundColor: "#FEF3C7",
                borderWidth: 1,
                borderColor: "#F59E0B",
                borderRadius: 12,
                padding: 12,
                marginBottom: 4,
              }}>
                <Text style={{ color: "#92400E", fontSize: 13, fontWeight: "700", marginBottom: 4 }}>
                  {L("⚠️ Confirming releases payout to the mechanic", "⚠️ Confirmar libera el pago al mecánico")}
                </Text>
                <Text style={{ color: "#92400E", fontSize: 12, lineHeight: 16 }}>
                  {L(
                    "By tapping confirm you are verifying the work is done to your satisfaction. Your card is charged and the mechanic receives a deposit now, with the rest of their payout released after 2 hours. If something is wrong, open a dispute within that time.",
                    "Al tocar confirmar, verificas que el trabajo quedó a tu satisfacción. Se cobra tu tarjeta y el mecánico recibe un adelanto ahora; el resto de su pago se libera después de 2 horas. Si algo no está bien, abre una disputa dentro de ese tiempo.",
                  )}
                </Text>
              </View>
              <PrimaryButton
                title={L("Confirm Service Complete", "Confirmar servicio completo")}
                onPress={handleSecureComplete}
                hapticType="success"
                iconRight={<IconSymbol name="checkmark" size={18} color="#FFFFFF" />}
              />
            </>
          ) : null}
          {/* Allow cancel for booked jobs until completed */}
          {job.isBooked && job.status !== "completed" && job.status !== "cancelled" ? (
            <PrimaryButton
              title={L("Cancel booked service", "Cancelar servicio reservado")}
              variant="warm"
              onPress={handleCancel}
              hapticType="medium"
              iconRight={<IconSymbol name="xmark" size={16} color="#FFFFFF" />}
            />
          ) : null}

          {/* Allow cancel for regular requests during searching + enroute + arrived */}
          {!job.isBooked && 
           ["searching", "accepted", "enroute", "arrived"].includes(job.status) ? (
            <PrimaryButton
              title={job.status === "searching" ? L("Cancel request", "Cancelar solicitud") : t("tracking.cta_cancel")}
              variant="warm"
              onPress={handleCancel}
              hapticType="medium"
              iconRight={<IconSymbol name="xmark" size={16} color="#FFFFFF" />}
            />
          ) : null}

          {/* Always-visible Safety SOS for active jobs (customer protection) */}
          {!["completed", "cancelled"].includes(job.status) && (
            <Pressable
              onPress={handleSafety}
              style={{
                marginTop: 12,
                backgroundColor: "#DC2626",
                borderRadius: 12,
                paddingVertical: 14,
                alignItems: "center",
                flexDirection: "row",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <IconSymbol name="exclamationmark.triangle.fill" size={18} color="#FFFFFF" />
              <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "800" }}>
                {L("SAFETY / EMERGENCY", "SEGURIDAD / EMERGENCIA")}
              </Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function ActionBtn({ icon, onPress }: { icon: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
    >
      <IconSymbol name={icon} size={18} color="#FFFFFF" />
    </Pressable>
  );
}

function TimelineRow({
  label,
  description,
  done,
  active,
  isLast,
}: {
  label: string;
  description: string;
  done: boolean;
  active: boolean;
  isLast: boolean;
}) {
  const color = done ? "#10B981" : active ? "#FDBA74" : "#64748B";
  return (
    <View style={{ flexDirection: "row" }}>
      <View style={{ alignItems: "center", width: 24 }}>
        <View style={[styles.dot, { backgroundColor: color, transform: active ? [{ scale: 1.1 }] : [] }]}>
          {done ? <IconSymbol name="checkmark" size={10} color="#FFFFFF" /> : null}
        </View>
        {!isLast ? (
          <View style={[styles.line, { backgroundColor: done ? "#10B981" : active ? "#FDBA74" : "#475569", height: active ? 3 : 2 }]} />
        ) : null}
      </View>
      <View style={{ flex: 1, paddingBottom: 18 }}>
        <Text style={[styles.timelineLabel, active && { color: "#FFEDD5" }]}>{label}</Text>
        <Text style={styles.timelineDesc}>{description}</Text>
      </View>
    </View>
  );
}

function mapStatus(status: JobStatus): "idle" | "searching" | "enroute" | "arrived" | "in_progress" | "completed" {
  if (status === "accepted") return "enroute";
  if (status === "cancelled") return "idle";
  return status as any;
}

const ENROUTE_DURATION = 12; // seconds, must match FLOW.enroute duration

function computeMechanicLive(job: { pickup?: { latitude: number; longitude: number }; mechanicStart?: { latitude: number; longitude: number }; status: JobStatus }, elapsed: number) {
  const pickup = job.pickup;
  const start = job.mechanicStart;
  if (!pickup || !start) return null;
  if (job.status === "searching" || job.status === "accepted") return start;
  if (job.status === "enroute") {
    const t = Math.min(1, elapsed / ENROUTE_DURATION);
    return interpolate(start, pickup, t);
  }
  // arrived / in_progress / completed
  return pickup;
}

function estimateEtaMinutes(
  mechanicPoint: { latitude: number; longitude: number } | null,
  pickupPoint: { latitude: number; longitude: number } | null,
): number {
  if (!mechanicPoint || !pickupPoint) return 12;
  const miles = metersToMiles(haversineMeters(mechanicPoint, pickupPoint));
  const effectiveMph = 24; // urban avg for roadside dispatch
  const eta = Math.ceil((miles / effectiveMph) * 60);
  return Math.max(1, eta);
}

function customerStatusCopy(status: JobStatus, isEs: boolean): { label: string; desc: string } {
  switch (status) {
    case "accepted":
      return isEs
        ? { label: "Mecánico aceptado", desc: "Asignado a tu solicitud" }
        : { label: "Mechanic accepted", desc: "Assigned to your request" };
    case "enroute":
      return isEs
        ? { label: "Mecánico en camino", desc: "Se dirige a tu ubicación" }
        : { label: "Mechanic is on the way", desc: "Heading to your location" };
    case "arrived":
      return isEs
        ? { label: "Mecánico llegó", desc: "En tu vehículo" }
        : { label: "Mechanic has arrived", desc: "At your vehicle" };
    case "in_progress":
      return isEs
        ? { label: "Trabajando en tu vehículo", desc: "Servicio en progreso" }
        : { label: "Working on your vehicle", desc: "Service in progress" };
    case "completed":
      return isEs
        ? { label: "Servicio completo", desc: "Listo para revisar" }
        : { label: "Service complete", desc: "Ready for review" };
    default:
      return isEs
        ? { label: "Estado actualizado", desc: "Tu servicio se está actualizando" }
        : { label: "Status updated", desc: "Your service is updating" };
  }
}

function statusHeadline(
  status: JobStatus,
  eta: number | null,
  t: (k: string, p?: Record<string, string | number>) => string,
): string {
  switch (status) {
    case "searching": return t("tracking.searching");
    case "accepted": return t("tracking.accepted");
    case "enroute":
      return eta != null ? t("tracking.arriving_in", { minutes: eta }) : t("tracking.on_the_way_no_eta");
    case "arrived": return t("tracking.arrived");
    case "in_progress": return t("tracking.in_progress");
    case "completed": return t("tracking.completed");
    case "cancelled": return t("tracking.cancelled");
  }
}

function emitNotification(
  status: JobStatus,
  name: string,
  service: string,
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  switch (status) {
    case "accepted":
      notifyNow({ title: t("notif.accepted_title"), body: t("notif.accepted_body", { name, service }) });
      break;
    case "enroute":
      notifyNow({ title: t("notif.enroute_title"), body: t("notif.enroute_body", { name }) });
      break;
    case "arrived":
      notifyNow({ title: t("notif.arrived_title"), body: t("notif.arrived_body", { name }) });
      break;
    case "in_progress":
      notifyNow({ title: t("notif.started_title"), body: t("notif.started_body", { name, service }) });
      break;
    case "completed":
      notifyNow({ title: t("notif.completed_title"), body: t("notif.completed_body") });
      break;
    default:
      break;
  }
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
  },
  topBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F5F7FA",
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: { fontSize: 16, fontWeight: "800", color: "#F8FAFC" },
  headline: { paddingHorizontal: 20, marginTop: 18 },
  headlineTitle: { fontSize: 22, fontWeight: "900", color: "#F8FAFC" },
  headlineSub: { fontSize: 13, color: "#CBD5E1", marginTop: 5, lineHeight: 18 },
  mechanicRow: {
    marginHorizontal: 20,
    marginTop: 18,
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 16,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  mechanicName: { fontSize: 15, fontWeight: "900", color: "#F8FAFC" },
  mechanicVehicle: { fontSize: 12, color: "#CBD5E1", marginTop: 2, lineHeight: 17 },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#C2410C",
    borderWidth: 1,
    borderColor: "#FDBA74",
    alignItems: "center",
    justifyContent: "center",
  },
  timelineCard: {
    marginHorizontal: 20,
    marginTop: 18,
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 16,
    padding: 16,
  },
  timelineTitle: { fontSize: 13, color: "#F8FAFC", fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  line: { width: 2, flex: 1, marginTop: 2 },
  timelineLabel: { fontSize: 14, fontWeight: "800", color: "#F8FAFC" },
  timelineDesc: { fontSize: 12, color: "#CBD5E1", marginTop: 2, lineHeight: 17 },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 30, gap: 12 },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: "rgba(16,185,129,0.16)",
    borderWidth: 1,
    borderColor: "rgba(110,231,183,0.5)",
    alignItems: "center", justifyContent: "center",
  },
  emptyTitle: { fontSize: 20, fontWeight: "900", color: "#F8FAFC" },
  emptyText: { fontSize: 14, color: "#CBD5E1", textAlign: "center", lineHeight: 21 },
  offersButton: {
    marginHorizontal: 20,
    marginTop: 12,
    backgroundColor: "#F97316",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  offersButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
});
