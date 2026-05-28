import { Pressable, StyleSheet, Text, View, Alert } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ScreenContainer } from "@/components/screen-container";
import { useStore } from "@/lib/store";
import { getServiceType } from "@/lib/seed";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { PrimaryButton } from "@/components/primary-button";
import { Avatar } from "@/components/avatar";
import { haptic } from "@/lib/haptics";
import { notifyNow } from "@/lib/notifications";
import { useAuth } from "@/lib/auth-context";
import { resolveAuthSession } from "@/lib/resolve-auth-session";
import { acceptDispatchRequest, fetchDispatchRequest, updateDispatchStatus } from "@/lib/live-dispatch";
import { useLocaleContext } from "@/hooks/use-locale";
import { formatDistanceByRegion } from "@/lib/distance";
import { deriveBookedMeta } from "@/lib/booked-trip";

const COUNTDOWN_SECONDS = 60;

export default function IncomingJobScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, dispatch } = useStore();
  const { user } = useAuth();
  const { locale, region } = useLocaleContext();
  const isEs = locale === "es-MX";
  const L = (en: string, es: string) => (isEs ? es : en);
  const job = typeof id === "string" ? state.mechanicJobs.find((j) => j.id === id) : undefined;
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);
  const expiredRef = useRef(false);
  const resolvedRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const clearCountdown = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  // Countdown
  useEffect(() => {
    if (!job || job.status !== "pending") return;
    expiredRef.current = false;
    resolvedRef.current = false;
    setIsSubmitting(false);
    setSecondsLeft(COUNTDOWN_SECONDS);
    const start = Date.now();
    clearCountdown();
    intervalRef.current = setInterval(() => {
      if (resolvedRef.current) {
        clearCountdown();
        return;
      }
      const elapsed = Math.floor((Date.now() - start) / 1000);
      const left = Math.max(0, COUNTDOWN_SECONDS - elapsed);
      setSecondsLeft(left);
      if (left <= 0) {
        clearCountdown();
        if (!expiredRef.current) {
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

  // If status changes (already accepted/declined elsewhere), exit
  useEffect(() => {
    if (!job) return;
    const bookedLike = !!job.isBooked || !!job.scheduledFor;
    const isFutureBooked = bookedLike && (typeof job.scheduledFor !== "number" || job.scheduledFor > Date.now());
    if (job.status === "heading_there") {
      if (isFutureBooked) {
        dispatch({
          type: "UPDATE_MECHANIC_JOB_STATUS",
          payload: { id: job.id, status: "upcoming" },
        });
        router.replace(`/mechanic/booked?id=${encodeURIComponent(job.id)}` as any);
      } else {
        router.replace("/mechanic/active" as any);
      }
    } else if (job.status === "upcoming") {
      router.replace(`/mechanic/booked?id=${encodeURIComponent(job.id)}` as any);
    } else if (job.status === "declined" || job.status === "cancelled") {
      router.replace("/(tabs)" as any);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status]);

  const service = getServiceType(job.service);
  const etaMinutes = Math.max(2, Math.ceil((job.distanceMiles / 24) * 60));
  const isBookedService = !!job.isBooked || !!job.scheduledFor;
  const customerFirstName = (job.customerName || "Customer").trim().split(/\s+/)[0] || "Customer";

  const handleAccept = async () => {
    if (resolvedRef.current || isSubmitting) return;
    resolvedRef.current = true;
    clearCountdown();
    setIsSubmitting(true);
    let bookedByRemote = isBookedService;
    if (job.remoteRequestId && user?.id) {
      try {
        const resolved = await resolveAuthSession(user);
        if (resolved) {
          const remote = await fetchDispatchRequest(resolved.sessionToken, job.remoteRequestId);
          const remoteBooked = deriveBookedMeta(remote?.scheduled_for ?? null, remote?.customer_note ?? null);
          if (remoteBooked.isBooked) bookedByRemote = true;
          const accepted = await acceptDispatchRequest(
            resolved.sessionToken,
            job.remoteRequestId,
            user.id,
            state.userName || "Mechanic",
          );
          if (!accepted) {
            Alert.alert(L("Already taken", "Ya fue tomada"), L("Another mechanic accepted this request.", "Otro mecánico aceptó esta solicitud."));
            dispatch({
              type: "UPDATE_MECHANIC_JOB_STATUS",
              payload: { id: job.id, status: "declined" },
            });
            router.replace("/(tabs)" as any);
            return;
          }
        }
      } catch (error) {
        resolvedRef.current = false;
        setIsSubmitting(false);
        console.error("[Incoming] Accept failed:", error);
        Alert.alert(L("Connection issue", "Problema de conexión"), L("Could not accept right now. Please try again.", "No se pudo aceptar ahora. Inténtalo de nuevo."));
        return;
      }
    }
    haptic.success();
    dispatch({
      type: "UPDATE_MECHANIC_JOB_STATUS",
      payload: { id: job.id, status: bookedByRemote ? "upcoming" : "heading_there" },
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

  const handleDecline = async (auto = false) => {
    if (resolvedRef.current && !auto) return;
    resolvedRef.current = true;
    clearCountdown();
    setIsSubmitting(true);
    if (job.remoteRequestId && user?.id) {
      try {
        const resolved = await resolveAuthSession(user);
        if (resolved) {
          await updateDispatchStatus(resolved.sessionToken, job.remoteRequestId, "searching");
        }
      } catch (error) {
        console.error("[Incoming] Decline sync failed:", error);
      }
    }
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
    <ScreenContainer edges={["top", "left", "right"]}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>{L("New job request", "Nueva solicitud de trabajo")}</Text>
        <View style={styles.countdown}>
          <Text style={styles.countdownText}>{secondsLeft}s</Text>
        </View>
      </View>

      <View style={[styles.heroCard, isBookedService && styles.heroCardBooked]}>
        <View style={styles.heroTop}>
          <Avatar name={job.customerName} url={job.customerPhotoUrl ?? undefined} size={56} />
          <View style={{ flex: 1 }}>
            <Text style={styles.customerName}>{customerFirstName}</Text>
            <Text style={styles.vehicle}>{job.vehicle}</Text>
          </View>
          <View style={styles.payoutBox}>
            <Text style={styles.payoutLabel}>{L("PAYOUT", "PAGO")}</Text>
            <Text style={styles.payoutValue}>${job.payout.toFixed(2)}</Text>
          </View>
        </View>

        <View style={styles.divider} />
        {isBookedService ? (
          <View style={styles.bookedBadge}>
            <Text style={styles.bookedBadgeText}>{L("Booked Service", "Servicio agendado")}</Text>
          </View>
        ) : null}

        <Row icon={service?.icon ?? "wrench.fill"} label={L("Service", "Servicio")} value={service?.name ?? "—"} />
        <Row icon="location.fill" label={L("Pickup", "Ubicación")} value={job.location} />
        <Row
          icon="car.fill"
          label={L("Distance", "Distancia")}
          value={region === "MX" ? formatDistanceByRegion(job.distanceMiles, region) : `${formatDistanceByRegion(job.distanceMiles, region)} away`}
        />
        <Row
          icon="clock.fill"
          label={L("Estimated time", "Tiempo estimado")}
          value={`~${etaMinutes} min`}
        />
        {job.scheduledFor ? (
          <Row
            icon="calendar"
            label={L("Scheduled", "Programado")}
            value={new Date(job.scheduledFor).toLocaleString(isEs ? "es-MX" : "en-US", {
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
          <Row icon="text.bubble.fill" label={L("Customer note", "Nota del cliente")} value={job.customerNote} />
        ) : null}
      </View>

      {job.remoteRequestId ? (
        <View style={{ paddingHorizontal: 20, marginTop: 10 }}>
          <Pressable
            onPress={() =>
              router.push({
                pathname: "/messages" as any,
                params: { requestId: job.remoteRequestId, peerName: job.customerName },
              } as any)
            }
            style={({ pressed }) => [
              styles.messageBtn,
              isBookedService ? styles.messageBtnBooked : styles.messageBtnDefault,
              pressed && { opacity: 0.9 },
            ]}
          >
            <Text style={[styles.messageBtnText, isBookedService ? styles.messageBtnTextBooked : styles.messageBtnTextDefault]}>
              {L("Open customer messages", "Abrir mensajes del cliente")}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.footer}>
        <Pressable
          onPress={() => void handleDecline(false)}
          disabled={isSubmitting}
          style={({ pressed }) => [styles.declineBtn, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.declineText}>{L("Decline", "Rechazar")}</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <PrimaryButton
            title={L("Accept", "Aceptar")}
            onPress={() => void handleAccept()}
            hapticType="success"
            iconLeft={<IconSymbol name="checkmark" size={18} color="#FFFFFF" />}
            disabled={isSubmitting}
          />
        </View>
      </View>
    </ScreenContainer>
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

const styles = StyleSheet.create({
  headerRow: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: { fontSize: 20, fontWeight: "800", color: "#F8FAFC" },
  countdown: {
    backgroundColor: "#F97316",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  countdownText: { color: "#FFFFFF", fontWeight: "800", fontSize: 13 },
  heroCard: {
    marginHorizontal: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 18,
    padding: 16,
    gap: 8,
  },
  heroCardBooked: {
    backgroundColor: "#FFEDD5",
    borderColor: "#FDBA74",
  },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  customerName: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  vehicle: { fontSize: 13, color: "#64748B", marginTop: 2 },
  payoutBox: { alignItems: "flex-end" },
  payoutLabel: { fontSize: 10, color: "#64748B", fontWeight: "800", letterSpacing: 0.6 },
  payoutValue: { fontSize: 22, fontWeight: "800", color: "#10B981" },
  divider: { height: 1, backgroundColor: "#E2E8F0", marginVertical: 8 },
  bookedBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#C2410C",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 4,
  },
  bookedBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 6, gap: 12 },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FFEDD5",
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { fontSize: 11, color: "#64748B", fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  rowValue: { fontSize: 14, color: "#0F172A", fontWeight: "600", marginTop: 2 },
  messageBtn: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  messageBtnDefault: {
    borderColor: "#475569",
    backgroundColor: "#0B132A",
  },
  messageBtnBooked: {
    borderColor: "#F97316",
    backgroundColor: "#7C2D12",
  },
  messageBtnText: { fontSize: 16, fontWeight: "800" },
  messageBtnTextDefault: { color: "#E2E8F0" },
  messageBtnTextBooked: { color: "#FFF7ED" },
  footer: {
    position: "absolute",
    left: 0, right: 0, bottom: 0,
    backgroundColor: "#FFFFFF",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E2E8F0",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  declineBtn: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: "#F1F5F9",
  },
  declineText: { color: "#0F172A", fontWeight: "700", fontSize: 15 },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  emptyText: { fontSize: 15, color: "#64748B" },
});
