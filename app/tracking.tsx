import { ScrollView, StyleSheet, Text, View, Pressable, Alert, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ScreenContainer } from "@/components/screen-container";
import { useActiveJob, useStore } from "@/lib/store";
import { getServiceType } from "@/lib/seed";
import { LiveMap } from "@/components/live-map";
import { interpolate } from "@/lib/geo";
import { haversineMeters, metersToMiles } from "@/lib/geo";
import { Avatar } from "@/components/avatar";
import { RatingStars } from "@/components/rating-stars";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { PrimaryButton } from "@/components/primary-button";
import { haptic } from "@/lib/haptics";
import { notifyNow, ensureNotificationPermissions } from "@/lib/notifications";
import type { JobStatus } from "@/lib/types";
import { useLocaleContext } from "@/hooks/use-locale";
import { localizedServiceName } from "@/lib/service-i18n";
import { fetchServiceMessages, assignDispatchToMechanic, updateDispatchStatus } from "@/lib/live-dispatch";
import { useAuth } from "@/lib/auth-context";
import { resolveAuthSession } from "@/lib/resolve-auth-session";

// Status flow with simulated durations (ms)
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
  const { dispatch } = useStore();
  const { user } = useAuth();
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const matchedShownForJobRef = useRef<string | null>(null);
  const [elapsedEnroute, setElapsedEnroute] = useState(0);
  const [offer, setOffer] = useState<{
    mechanicUserId: string;
    mechanicName: string;
    proposedTotal: number;
    note?: string;
  } | null>(null);

  const mechanic = job?.mechanicName
    ? {
        id: job.mechanicId || "assigned",
        name: job.mechanicName,
        photoUrl: job.mechanicPhotoUrl ?? "",
        rating: 4.9,
        jobsCompleted: 0,
        yearsExperience: 5,
        hourlyRate: 0,
        etaMinutes: 12,
        distanceMiles: 1.8,
        vehicle: "Service Vehicle",
        bio: "",
        specialties: [],
        certifications: [],
        reviews: [],
        offsetMeters: { east: 250, north: 220 },
      }
    : undefined;
  const service = job ? getServiceType(job.service) : undefined;
  const { t, locale } = useLocaleContext();

  // Ask for notification permission once when this screen mounts (best place since user just acted).
  useEffect(() => {
    ensureNotificationPermissions();
  }, []);

  // Show a mechanic profile modal when the match is accepted.
  useEffect(() => {
    if (!job?.id) return;
    if (job.status === "accepted" && mechanic && matchedShownForJobRef.current !== job.id) {
      matchedShownForJobRef.current = job.id;
      router.push("/mechanic/matched" as any);
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

  // Live dispatch polling moved to global CustomerLiveJobSync to avoid duplicate network loops.
  useEffect(() => {
    if (!job?.remoteRequestId || !user?.id || job.status !== "searching") {
      setOffer(null);
      return;
    }
    let alive = true;
    const load = async () => {
      try {
        const resolved = await resolveAuthSession(user);
        if (!resolved || !alive) return;
        const rows = await fetchServiceMessages(resolved.sessionToken, job.remoteRequestId!);
        const latest = [...rows].reverse().find((m) => m.message.startsWith("OFFER_JSON:"));
        if (!latest) return;
        const raw = latest.message.slice("OFFER_JSON:".length);
        const parsed = JSON.parse(raw) as {
          mechanic_user_id?: string;
          mechanic_name?: string;
          proposed_total?: number;
          note?: string;
        };
        if (!parsed.mechanic_user_id || !parsed.mechanic_name || !parsed.proposed_total) return;
        setOffer({
          mechanicUserId: parsed.mechanic_user_id,
          mechanicName: parsed.mechanic_name,
          proposedTotal: Number(parsed.proposed_total),
          note: parsed.note,
        });
      } catch (err) {
        console.warn("[Tracking] offer polling failed:", err);
      }
    };
    void load();
    const t = setInterval(() => void load(), 7000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [job?.remoteRequestId, job?.status, user?.id]);

  const handleAcceptOffer = async () => {
    if (!job?.id || !job.remoteRequestId || !offer || !user?.id) return;
    try {
      const resolved = await resolveAuthSession(user);
      if (!resolved) return;
      try {
        await assignDispatchToMechanic(
          resolved.sessionToken,
          job.remoteRequestId,
          offer.mechanicUserId,
          offer.mechanicName,
        );
      } catch (err) {
        console.warn("[Tracking] assign offer failed, continuing local transition:", err);
      }
      dispatch({
        type: "UPDATE_JOB_ASSIGNMENT",
        payload: { id: job.id, mechanicId: offer.mechanicUserId, mechanicName: offer.mechanicName },
      });
      dispatch({
        type: "UPDATE_JOB_STATUS",
        payload: { id: job.id, status: "accepted" },
      });
      haptic.success();
    } catch (error) {
      console.error("[Tracking] accept offer failed:", error);
      haptic.error();
    }
  };

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
  }, [job?.status, job?.id]);

  if (!job || !service) {
    return (
      <ScreenContainer>
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

  // Compute display ETA from live distance (shared reality for customer/mechanic).
  const liveMechanicPoint = job.mechanicLiveCoords ?? computeMechanicLive(job, elapsedEnroute);
  const liveEta = estimateEtaMinutes(liveMechanicPoint, job.pickup ?? null);

  const handleCall = () => {
    haptic.light();
    if (Platform.OS === "web") {
      console.log("Pretending to call", mechanic?.name ?? "mechanic");
    } else {
      Alert.alert("Call mechanic", `Calling ${mechanic?.name ?? "your mechanic"}…`, [{ text: "OK" }]);
    }
  };
  const handleMessage = () => {
    haptic.light();
    if (!job.remoteRequestId) return;
    router.push({
      pathname: "/messages" as any,
      params: { requestId: job.remoteRequestId, peerName: mechanic?.name ?? "Mechanic" },
    } as any);
  };
  const handleCancel = () => {
    const confirm = async () => {
      haptic.warning();
      if (job.remoteRequestId && user?.id) {
        try {
          const resolved = await resolveAuthSession(user);
          if (resolved) {
            await updateDispatchStatus(resolved.sessionToken, job.remoteRequestId, "cancelled");
          }
        } catch (error) {
          console.error("[Tracking] Failed to cancel remote request:", error);
        }
      }
      dispatch({ type: "UPDATE_JOB_STATUS", payload: { id: job.id, status: "cancelled" } });
      router.replace("/(tabs)" as any);
    };
    if (Platform.OS === "web") {
      confirm();
    } else {
      Alert.alert(job.isBooked ? "Cancel booked service" : "Cancel service", "Are you sure you want to cancel?", [
        { text: "Keep job", style: "cancel" },
        { text: "Cancel job", style: "destructive", onPress: () => void confirm() },
      ]);
    }
  };
  const handleComplete = () => {
    haptic.success();
    router.replace({ pathname: "/complete" as any, params: { jobId: job.id } } as any);
  };

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <Pressable
            onPress={() => {
              haptic.light();
              router.replace("/(tabs)" as any);
            }}
            hitSlop={10}
            style={({ pressed }) => [styles.topBackBtn, pressed && { opacity: 0.7 }]}
          >
            <IconSymbol name="chevron.left" size={22} color="#0F172A" />
          </Pressable>
          <Text style={styles.topTitle}>{t("tracking.title")}</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Map card */}
        <View style={{ paddingHorizontal: 20, marginTop: 4 }}>
          <LiveMap
            status={mapStatus(job.status)}
            pickup={job.pickup ?? null}
            mechanic={liveMechanicPoint}
            etaMinutes={job.status === "accepted" || job.status === "enroute" ? liveEta : undefined}
          />
        </View>

        {/* Status headline */}
        <View style={styles.headline}>
          <Text style={styles.headlineTitle}>{statusHeadline(job.status, liveEta, t as any)}</Text>
          <Text style={styles.headlineSub}>{localizedServiceName(service.code, locale)} • {job.location}</Text>
        </View>

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
              <Text style={styles.mechanicName}>Finding your mechanic…</Text>
              <Text style={styles.mechanicVehicle}>You’ll see profile details as soon as one accepts.</Text>
            </View>
          </View>
        )}

        {job.status === "searching" && offer ? (
          <View style={{ marginHorizontal: 20, marginTop: 12, backgroundColor: "#1A1A2E", borderWidth: 1, borderColor: "#2A2A40", borderRadius: 12, padding: 12, gap: 6 }}>
            <Text style={{ color: "#F8FAFC", fontWeight: "800", fontSize: 15 }}>
              {locale === "es-MX" ? "Oferta de mecánico recibida" : "Mechanic offer received"}
            </Text>
            <Text style={{ color: "#CBD5E1", fontSize: 13 }}>
              {(locale === "es-MX" ? "Mecánico" : "Mechanic")}: {offer.mechanicName}
            </Text>
            <Text style={{ color: "#FB923C", fontSize: 14, fontWeight: "800" }}>
              {locale === "es-MX" ? "Precio final propuesto" : "Proposed final price"}: ${offer.proposedTotal.toFixed(2)}
            </Text>
            {offer.note ? <Text style={{ color: "#E2E8F0", fontSize: 12 }}>{offer.note}</Text> : null}
            <PrimaryButton
              title={locale === "es-MX" ? "Aceptar oferta" : "Accept Offer"}
              onPress={() => void handleAcceptOffer()}
              hapticType="success"
            />
          </View>
        ) : null}

        {/* Timeline */}
        <View style={styles.timelineCard}>
          <Text style={styles.timelineTitle}>{t("tracking.status")}</Text>
          {FLOW.map((f, idx) => {
            const currentIdx = FLOW.findIndex((x) => x.status === job.status);
            const done = idx < currentIdx;
            const active = idx === currentIdx;
            return (
              <TimelineRow
                key={f.status}
                label={statusLabel(f.status, t as any)}
                description={statusDescription(f.status, mechanic?.name ?? "your mechanic", t as any)}
                done={done}
                active={active}
                isLast={idx === FLOW.length - 1}
              />
            );
          })}
        </View>

        {/* Actions */}
        <View style={{ paddingHorizontal: 20, marginTop: 16, gap: 10 }}>
          {job.status === "in_progress" && !!job.mechanicMarkedDoneAt ? (
            <PrimaryButton
              title={t("tracking.cta_complete")}
              onPress={handleComplete}
              hapticType="success"
              iconRight={<IconSymbol name="checkmark" size={18} color="#FFFFFF" />}
            />
          ) : null}
          {job.isBooked && job.status !== "completed" && job.status !== "cancelled" ? (
            <PrimaryButton
              title="Cancel booked service"
              variant="warm"
              onPress={handleCancel}
              hapticType="medium"
              iconRight={<IconSymbol name="xmark" size={16} color="#FFFFFF" />}
            />
          ) : null}
          {!job.isBooked && job.status !== "in_progress" ? (
            <PrimaryButton
              title={job.status === "searching" ? "Cancel request" : t("tracking.cta_cancel")}
              variant="warm"
              onPress={handleCancel}
              hapticType="medium"
              iconRight={<IconSymbol name="xmark" size={16} color="#FFFFFF" />}
            />
          ) : null}
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
  const color = done ? "#10B981" : active ? "#F97316" : "#CBD5E1";
  return (
    <View style={{ flexDirection: "row" }}>
      <View style={{ alignItems: "center", width: 24 }}>
        <View style={[styles.dot, { backgroundColor: color }]}>
          {done ? <IconSymbol name="checkmark" size={10} color="#FFFFFF" /> : null}
        </View>
        {!isLast ? <View style={[styles.line, { backgroundColor: done ? "#10B981" : "#E2E8F0" }]} /> : null}
      </View>
      <View style={{ flex: 1, paddingBottom: 18 }}>
        <Text style={[styles.timelineLabel, active && { color: "#F97316" }]}>{label}</Text>
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

function statusHeadline(status: JobStatus, eta: number, t: (k: string, p?: Record<string, string | number>) => string): string {
  switch (status) {
    case "searching": return t("tracking.searching");
    case "accepted": return t("tracking.accepted");
    case "enroute": return t("tracking.arriving_in", { minutes: eta });
    case "arrived": return t("tracking.arrived");
    case "in_progress": return t("tracking.in_progress");
    case "completed": return t("tracking.completed");
    case "cancelled": return t("tracking.cancelled");
  }
}

function statusLabel(s: JobStatus, t: (k: string) => string): string {
  switch (s) {
    case "searching": return t("tracking.step_searching");
    case "accepted": return t("tracking.step_accepted");
    case "enroute": return t("tracking.step_enroute");
    case "arrived": return t("tracking.step_arrived");
    case "in_progress": return t("tracking.step_in_progress");
    default: return s;
  }
}

function statusDescription(s: JobStatus, name: string, t: (k: string, p?: Record<string, string | number>) => string): string {
  switch (s) {
    case "searching": return t("tracking.desc_searching");
    case "accepted": return t("tracking.desc_accepted", { name });
    case "enroute": return t("tracking.desc_enroute", { name });
    case "arrived": return t("tracking.desc_arrived");
    case "in_progress": return t("tracking.desc_in_progress");
    default: return "";
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
  topTitle: { fontSize: 16, fontWeight: "800", color: "#0F172A" },
  headline: { paddingHorizontal: 20, marginTop: 18 },
  headlineTitle: { fontSize: 22, fontWeight: "800", color: "#0F172A" },
  headlineSub: { fontSize: 13, color: "#64748B", marginTop: 4 },
  mechanicRow: {
    marginHorizontal: 20,
    marginTop: 18,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 16,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  mechanicName: { fontSize: 15, fontWeight: "800", color: "#0F172A" },
  mechanicVehicle: { fontSize: 12, color: "#64748B", marginTop: 2 },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#0F172A",
    alignItems: "center",
    justifyContent: "center",
  },
  timelineCard: {
    marginHorizontal: 20,
    marginTop: 18,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 16,
    padding: 16,
  },
  timelineTitle: { fontSize: 13, color: "#64748B", fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  line: { width: 2, flex: 1, marginTop: 2 },
  timelineLabel: { fontSize: 14, fontWeight: "700", color: "#0F172A" },
  timelineDesc: { fontSize: 12, color: "#64748B", marginTop: 2, lineHeight: 17 },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 30, gap: 12 },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: "#DCFCE7",
    alignItems: "center", justifyContent: "center",
  },
  emptyTitle: { fontSize: 20, fontWeight: "800", color: "#0F172A" },
  emptyText: { fontSize: 14, color: "#64748B", textAlign: "center", lineHeight: 21 },
});
