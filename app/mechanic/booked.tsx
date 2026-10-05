import { Pressable, StyleSheet, Text, View } from "react-native";
import { useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useStore } from "@/lib/store";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { PrimaryButton } from "@/components/primary-button";
import { useLocaleContext, useL } from "@/hooks/use-locale";
import { getServiceType } from "@/lib/seed";
import { haptic } from "@/lib/haptics";
import { safeReplace } from "@/lib/safe-router";
import { useAuth } from "@/lib/auth-context";
import { resolveAuthSession } from "@/lib/resolve-auth-session";
import { fetchDispatchRequest } from "@/lib/live-dispatch";
import { deriveBookedMeta } from "@/lib/booked-trip";
import type { MechanicJob, ServiceCode } from "@/lib/types";

export default function MechanicBookedDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { state, dispatch } = useStore();
  const { user } = useAuth();
  const { locale, formatPrice } = useLocaleContext();
  const L = useL();
  const job = typeof id === "string" ? state.mechanicJobs.find((j) => j.id === id) : null;
  const [fallbackJob, setFallbackJob] = useState<MechanicJob | null>(null);
  const [loadingFallback, setLoadingFallback] = useState(false);
  const displayJob = job ?? fallbackJob;
  const displayJobId = displayJob?.id;
  const displayJobStatus = displayJob?.status;

  useEffect(() => {
    let alive = true;
    if (job) {
      setLoadingFallback(false);
      setFallbackJob(null);
      return () => {
        alive = false;
      };
    }
    if (typeof id !== "string" || !user?.id) {
      setLoadingFallback(false);
      setFallbackJob(null);
      return () => {
        alive = false;
      };
    }

    setLoadingFallback(true);
    setFallbackJob(null);

    const loadFallback = async () => {
      try {
        const resolved = await resolveAuthSession(user);
        if (!resolved || !alive) return;
        const remote = await fetchDispatchRequest(resolved.sessionToken, id);
        if (!alive) return;
        if (!remote || remote.assigned_mechanic_user_id !== user.id) {
          setFallbackJob(null);
          return;
        }
        if (remote.status === "enroute" || remote.status === "arrived" || remote.status === "in_progress") {
          safeReplace("/mechanic/active");
          return;
        }
        if (remote.status === "completed" || remote.status === "cancelled") {
          setFallbackJob(null);
          return;
        }

        const booked = deriveBookedMeta(remote.scheduled_for ?? null, remote.customer_note ?? null);
        const nextJob: MechanicJob = {
          id: remote.id,
          remoteRequestId: remote.id,
          isBooked: booked.isBooked,
          scheduledFor: booked.scheduledForMs,
          customerName: remote.customer_name ?? "Customer",
          customerPhotoUrl: remote.customer_photo_url ?? null,
          vehicle: remote.vehicle_label,
          service: remote.service_code as ServiceCode,
          location: remote.location_label,
          distanceMiles: 1.5,
          payout: Number((remote.mechanic_payout ?? remote.offered_price) || 0),
          status: "upcoming",
          receivedAt: Date.parse(remote.created_at) || Date.now(),
          mechanicOfferSentAt: remote.mechanic_offer_sent_at ? Date.parse(remote.mechanic_offer_sent_at) || undefined : undefined,
          offerExpiresAt: remote.offer_expires_at ? Date.parse(remote.offer_expires_at) || undefined : undefined,
          customerQuoteAcceptedAt: remote.customer_quote_accepted_at ? Date.parse(remote.customer_quote_accepted_at) || undefined : undefined,
          mechanicAcceptedAt: remote.mechanic_accepted_at ? Date.parse(remote.mechanic_accepted_at) || undefined : undefined,
          stripePaymentIntentId: remote.stripe_payment_intent_id ?? null,
          acceptedAt: Date.parse(remote.updated_at) || Date.now(),
          completedAt: undefined,
          customerNote: booked.cleanNote,
          customerHasParts: typeof remote.customer_has_parts === "boolean" ? remote.customer_has_parts : null,
          issuePhotoUrl: remote.issue_photo_url ?? null,
        };
        setFallbackJob(nextJob);
        dispatch({ type: "ADD_MECHANIC_JOB", payload: nextJob });
      } catch (error) {
        console.error("[MechanicBooked] Failed to load fallback booked job:", error);
        if (alive) setFallbackJob(null);
      } finally {
        if (alive) setLoadingFallback(false);
      }
    };

    void loadFallback();
    return () => {
      alive = false;
    };
  }, [dispatch, id, job, user]);

  useEffect(() => {
    if (!displayJobId) return;
    if (displayJobStatus === "cancelled" || displayJobStatus === "completed") {
      safeReplace("/(tabs)/booked-requests" as any);
    }
  }, [displayJobId, displayJobStatus]);

  if (!displayJob) {
    if (loadingFallback) {
      return (
        <ScreenContainer>
          <View style={styles.wrap}>
            <Text style={styles.title}>{L("Loading booked job...", "Cargando trabajo agendado...")}</Text>
          </View>
        </ScreenContainer>
      );
    }
    return (
      <ScreenContainer>
        <View style={styles.wrap}>
          <Text style={styles.title}>{L("Booked job not found", "No se encontró el trabajo agendado")}</Text>
          <PrimaryButton title={L("Back", "Volver")} fullWidth={false} onPress={() => router.replace("/(tabs)/booked-requests" as any)} />
        </View>
      </ScreenContainer>
    );
  }

  const service = getServiceType(displayJob.service);
  const startAt = typeof displayJob.scheduledFor === "number" ? new Date(displayJob.scheduledFor) : null;
  const isLiveJob = displayJob.status === "heading_there" || displayJob.status === "arrived" || displayJob.status === "in_progress";
  const isDue = !startAt || startAt.getTime() <= Date.now();
  const startSummary = startAt ? formatBookedStartLabel(startAt, locale) : "—";

  const startNow = () => {
    if (isLiveJob) {
      haptic.light();
      safeReplace("/mechanic/active");
      return;
    }
    if (!isDue) return;
    haptic.success();
    dispatch({ type: "UPDATE_MECHANIC_JOB_STATUS", payload: { id: displayJob.id, status: "heading_there" } });
    safeReplace("/mechanic/active");
  };

  // Same reasoning as active.tsx: this job is already accepted (or booked),
  // so the default back button's router.back() must not be allowed to
  // resurface the incoming-offer screen still sitting in history.
  const handleBackFromBooked = () => {
    haptic.light();
    router.replace("/(tabs)/booked-requests" as any);
  };

  return (
    <ScreenContainer edges={["left", "right"]} showBackButton onBack={handleBackFromBooked} title={L("Booked job", "Trabajo agendado")}>
      <View style={styles.header}>
        <Pressable onPress={() => router.replace("/(tabs)/booked-requests" as any)} hitSlop={10}>
          <IconSymbol name="chevron.left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.headerTitle}>{L("Booked Service", "Servicio agendado")}</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.card}>
        <Text style={styles.badge}>{L("Upcoming Job", "Próximo trabajo")}</Text>
        <InfoRow label={L("Customer", "Cliente")} value={displayJob.customerName} />
        <InfoRow label={L("Vehicle", "Vehículo")} value={displayJob.vehicle} />
        <InfoRow label={L("Service", "Servicio")} value={service?.name ?? "—"} />
        <InfoRow label={L("Address", "Dirección")} value={displayJob.location} />
        <InfoRow
          label={L("Scheduled for", "Programado para")}
          value={isLiveJob ? L("Live / in progress", "En vivo / en progreso") : startSummary}
        />
        <InfoRow label={L("Final price", "Precio final")} value={formatPrice(displayJob.payout)} />
        {displayJob.customerNote ? <InfoRow label={L("Customer note", "Nota del cliente")} value={displayJob.customerNote} /> : null}
      </View>

      <View style={{ paddingHorizontal: 20, marginTop: 14 }}>
        {startAt ? (
          <View style={styles.waitCard}>
            <Text style={styles.waitText}>
              {isLiveJob
                ? L("This booked job is live now.", "Este trabajo agendado ya está en vivo.")
                : L("Upcoming booked service.", "Servicio agendado próximo.")}
            </Text>
            <Text style={styles.waitMins}>
              {isLiveJob
                ? L("Live / in progress", "En vivo / en progreso")
                : startSummary}
            </Text>
          </View>
        ) : null}
        <PrimaryButton
          title={
            isLiveJob
              ? L("Open live job", "Abrir trabajo en vivo")
              : isDue
                ? L("Start trip now", "Iniciar viaje ahora")
              : L("Waiting for scheduled time", "Esperando hora programada")
          }
          onPress={startNow}
          disabled={!isDue && !isLiveJob}
        />
        <View style={{ marginTop: 10 }}>
          <PrimaryButton
            title={L("Cancel booked service", "Cancelar servicio agendado")}
            variant="warm"
            onPress={() => router.push(`/mechanic/cancel-booked?id=${encodeURIComponent(displayJob.id)}` as any)}
            iconRight={<IconSymbol name="xmark" size={14} color="#FFFFFF" />}
          />
        </View>
      </View>
    </ScreenContainer>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function formatBookedStartLabel(startAt: Date, locale: string): string {
  const now = new Date();
  const dateLocale = locale === "es-MX" ? "es-MX" : "en-US";
  const diffMinutes = Math.floor((startAt.getTime() - now.getTime()) / 60000);
  if (diffMinutes <= -90) {
    return locale === "es-MX" ? "Hora programada pasada" : "Scheduled time passed";
  }
  if (diffMinutes <= 0) {
    return locale === "es-MX" ? "Listo para salir" : "Ready to start";
  }
  if (diffMinutes < 90) {
    return locale === "es-MX" ? `Inicia en ${diffMinutes} min` : `Starts in ${diffMinutes} min`;
  }

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTarget = new Date(startAt.getFullYear(), startAt.getMonth(), startAt.getDate());
  const dayDiff = Math.round((startOfTarget.getTime() - startOfToday.getTime()) / 86400000);
  const timeLabel = new Intl.DateTimeFormat(dateLocale, { hour: "numeric", minute: "2-digit" }).format(startAt);

  if (dayDiff === 0) {
    return locale === "es-MX" ? `Hoy a las ${timeLabel}` : `Today at ${timeLabel}`;
  }
  if (dayDiff === 1) {
    return locale === "es-MX" ? `Mañana a las ${timeLabel}` : `Tomorrow at ${timeLabel}`;
  }
  return locale === "es-MX" ? `En ${dayDiff} días a las ${timeLabel}` : `In ${dayDiff} days at ${timeLabel}`;
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 20 },
  title: { color: "#F8FAFC", fontSize: 18, fontWeight: "800", textAlign: "center" },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerTitle: { color: "#0F172A", fontSize: 18, fontWeight: "800" },
  card: {
    marginHorizontal: 20,
    backgroundColor: "#1A1A2E",
    borderWidth: 1,
    borderColor: "#2A2A40",
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: "#C2410C",
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 6,
  },
  row: { gap: 2, paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#2A2A40" },
  rowLabel: { color: "#94A3B8", fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  rowValue: { color: "#F8FAFC", fontSize: 14, fontWeight: "600" },
  waitCard: {
    borderWidth: 1,
    borderColor: "#2A2A40",
    backgroundColor: "#121212",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  waitText: { color: "#CBD5E1", fontSize: 12, fontWeight: "600" },
  waitMins: { color: "#FB923C", fontSize: 14, fontWeight: "800", marginTop: 4 },
});
