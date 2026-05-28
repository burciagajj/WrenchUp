import { Pressable, ScrollView, StyleSheet, Text, View, Alert, Platform } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useStore, useMechanicActiveJob } from "@/lib/store";
import { getServiceType } from "@/lib/seed";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { PrimaryButton } from "@/components/primary-button";
import { Avatar } from "@/components/avatar";
import { LiveMap } from "@/components/live-map";
import { interpolate, haversineMeters, metersToMiles } from "@/lib/geo";
import { useEffect, useState } from "react";
import { haptic } from "@/lib/haptics";
import { notifyNow } from "@/lib/notifications";
import type { MechanicJobStatus } from "@/lib/types";
import { useAuth } from "@/lib/auth-context";
import { resolveAuthSession } from "@/lib/resolve-auth-session";
import { updateDispatchStatus } from "@/lib/live-dispatch";
import { useImagePicker } from "@/hooks/use-image-picker";
import { useLocaleContext } from "@/hooks/use-locale";

const FLOW: MechanicJobStatus[] = ["heading_there", "arrived", "in_progress", "completed"];

export default function MechanicActiveJobScreen() {
  const router = useRouter();
  const job = useMechanicActiveJob();
  const { dispatch, state } = useStore();
  const { user } = useAuth();
  const { locale } = useLocaleContext();
  const isEs = locale === "es-MX";
  const L = (en: string, es: string) => (isEs ? es : en);
  const { pickImageFromGallery } = useImagePicker();
  const [elapsed, setElapsed] = useState(0);
  const [beforePhotoUri, setBeforePhotoUri] = useState<string | null>(null);
  const [afterPhotoUri, setAfterPhotoUri] = useState<string | null>(null);

  // Push mechanic GPS to service request every 2 minutes so customer mini-map stays updated.
  useEffect(() => {
    if (!job?.remoteRequestId || !user?.id) return;
    if (job.status !== "heading_there" && job.status !== "arrived" && job.status !== "in_progress") return;
    let alive = true;
    const sync = async () => {
      if (!state.userCoords) return;
      try {
        const resolved = await resolveAuthSession(user);
        if (!resolved || !alive) return;
        await updateDispatchStatus(
          resolved.sessionToken,
          job.remoteRequestId!,
          mapDispatchStatus(job.status),
          {
            mechanicLatitude: state.userCoords.latitude,
            mechanicLongitude: state.userCoords.longitude,
          }
        );
      } catch (error) {
        console.error("[MechanicActive] GPS sync failed:", error);
      }
    };
    void sync();
    const timer = setInterval(() => void sync(), 120000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [job?.id, job?.remoteRequestId, job?.status, user, state.userCoords]);

  // Animate the mechanic puck while heading_there
  useEffect(() => {
    if (!job || job.status !== "heading_there") {
      setElapsed(0);
      return;
    }
    setElapsed(0);
    const start = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [job?.status, job?.id]);

  if (!job) {
    return (
      <ScreenContainer>
        <View style={styles.emptyWrap}>
          <View style={styles.emptyIcon}>
            <IconSymbol name="checkmark.circle.fill" size={42} color="#10B981" />
          </View>
          <Text style={styles.emptyTitle}>{L("No active job", "No hay trabajo activo")}</Text>
          <Text style={styles.emptyText}>{L("Once you accept a request, it'll show up here.", "Cuando aceptes una solicitud, aparecerá aquí.")}</Text>
          <PrimaryButton title={L("Back to dashboard", "Volver al panel")} fullWidth={false} onPress={() => router.replace("/(tabs)" as any)} />
        </View>
      </ScreenContainer>
    );
  }

  // Hard guard: booked jobs must never use live-trip page before scheduled time.
  const isFutureBooked =
    !!job.isBooked && (typeof job.scheduledFor !== "number" || job.scheduledFor > Date.now());
  if (isFutureBooked) {
    router.replace(`/mechanic/booked?id=${encodeURIComponent(job.id)}` as any);
    return (
      <ScreenContainer>
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>{L("Redirecting to booked details...", "Redirigiendo a detalles de reserva...")}</Text>
        </View>
      </ScreenContainer>
    );
  }

  const service = getServiceType(job.service);
  const idx = FLOW.indexOf(job.status);
  const nextStatus = idx >= 0 && idx < FLOW.length - 1 ? FLOW[idx + 1] : null;

  const advance = async () => {
    if (!nextStatus) return;
    if (nextStatus === "in_progress" && !beforePhotoUri) {
      Alert.alert(L("Before photo required", "Foto previa requerida"), L("Upload a before photo before starting service.", "Sube una foto previa antes de iniciar el servicio."));
      return;
    }
    if (nextStatus === "completed" && !afterPhotoUri) {
      Alert.alert(L("After photo required", "Foto posterior requerida"), L("Upload an after photo before marking service done.", "Sube una foto posterior antes de marcar el servicio."));
      return;
    }
    haptic.success();
    dispatch({
      type: "UPDATE_MECHANIC_JOB_STATUS",
      payload: { id: job.id, status: nextStatus },
    });
    if (job.remoteRequestId && user?.id) {
      try {
        const resolved = await resolveAuthSession(user);
        if (resolved) {
          const isMechanicDone = nextStatus === "completed";
          const mapped = isMechanicDone
            ? "in_progress" // customer confirms completion
            : nextStatus === "heading_there"
            ? "enroute"
            : nextStatus;
          await updateDispatchStatus(
            resolved.sessionToken,
            job.remoteRequestId,
            mapped as any,
            isMechanicDone
              ? { mechanicMarkedDoneAt: new Date().toISOString(), afterPhotoUrl: afterPhotoUri }
              : nextStatus === "in_progress"
              ? { beforePhotoUrl: beforePhotoUri }
              : undefined
          );
        }
      } catch (error) {
        console.error("[MechanicActive] Failed to sync status:", error);
      }
    }
    if (nextStatus === "arrived") {
      notifyNow({ title: L("Marked as arrived", "Marcado como llegado"), body: L(`You're at ${job.customerName}'s location.`, `Estás en la ubicación de ${job.customerName}.`) });
    } else if (nextStatus === "in_progress") {
      notifyNow({ title: L("Service started", "Servicio iniciado"), body: L("Customer was notified.", "Se notificó al cliente.") });
    } else if (nextStatus === "completed") {
      notifyNow({
        title: L("Awaiting customer confirmation", "Esperando confirmación del cliente"),
        body: L("Customer must mark the service complete before payout release.", "El cliente debe marcar el servicio como completado antes de liberar el pago."),
      });
      // After a short delay, return to dashboard
      setTimeout(() => router.replace("/(tabs)" as any), 600);
    }
  };

  const handleCancel = () => {
    const doCancel = async () => {
      haptic.warning();
      dispatch({
        type: "UPDATE_MECHANIC_JOB_STATUS",
        payload: { id: job.id, status: "cancelled" },
      });
      if (job.remoteRequestId && user?.id) {
        try {
          const resolved = await resolveAuthSession(user);
          if (resolved) {
            await updateDispatchStatus(resolved.sessionToken, job.remoteRequestId, "cancelled");
          }
        } catch (error) {
          console.error("[MechanicActive] Failed to cancel in live dispatch:", error);
        }
      }
      router.replace("/(tabs)" as any);
    };
    if (Platform.OS === "web") {
      doCancel();
    } else {
      Alert.alert(L("Cancel job?", "¿Cancelar trabajo?"), L("The customer will be notified and the job will be voided.", "Se notificará al cliente y el trabajo será cancelado."), [
        { text: L("Keep job", "Mantener trabajo"), style: "cancel" },
        { text: L("Cancel", "Cancelar"), style: "destructive", onPress: doCancel },
      ]);
    }
  };

  const ctaTitle = ctaLabel(job.status, isEs);
  const headline = headlineFor(job.status, job.customerName, isEs);
  const liveMechanicPoint = computeMechanicLive(job, elapsed);
  const liveEta = estimateEtaMinutes(liveMechanicPoint, job.pickup ?? null);

  const handleUploadBefore = async () => {
    const picked = await pickImageFromGallery();
    if (!picked) return;
    setBeforePhotoUri(picked.uri);
    haptic.selection();
  };

  const handleUploadAfter = async () => {
    const picked = await pickImageFromGallery();
    if (!picked) return;
    setAfterPhotoUri(picked.uri);
    haptic.selection();
  };

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Pressable
            onPress={() => router.replace("/(tabs)" as any)}
            hitSlop={10}
            style={({ pressed }) => [styles.topBack, pressed && { opacity: 0.7 }]}
          >
            <IconSymbol name="chevron.left" size={22} color="#0F172A" />
          </Pressable>
          <Text style={styles.topTitle}>{L("Active job", "Trabajo activo")}</Text>
          <View style={{ width: 36 }} />
        </View>

        <View style={{ paddingHorizontal: 20 }}>
          <LiveMap
            status={mapStatus(job.status)}
            pickup={job.pickup ?? null}
            mechanic={liveMechanicPoint}
            etaMinutes={job.status === "heading_there" ? liveEta : undefined}
          />
        </View>

        <View style={styles.headline}>
          <Text style={styles.headlineTitle}>{headline}</Text>
          <Text style={styles.headlineSub}>
            {service?.name ?? L("Service", "Servicio")} • {job.status === "heading_there" ? `ETA ${liveEta} min • ` : ""}{L("payout", "pago")} ${job.payout.toFixed(2)}
          </Text>
        </View>

        {/* Customer */}
        <View style={styles.customerRow}>
          <Avatar name={job.customerName} size={52} />
          <View style={{ flex: 1 }}>
            <Text style={styles.customerName}>{job.customerName}</Text>
            <Text style={styles.customerVehicle}>{job.vehicle}</Text>
          </View>
          <ActionBtn icon="phone.fill" onPress={() => fakeCall(job.customerName)} />
          <ActionBtn
            icon="message.fill"
            onPress={() =>
              job.remoteRequestId
                ? router.push({
                    pathname: "/messages" as any,
                    params: { requestId: job.remoteRequestId, peerName: job.customerName },
                  } as any)
                : fakeMsg(job.customerName)
            }
          />
        </View>

        {/* Address card */}
        <View style={styles.addressCard}>
          <View style={styles.iconBubble}>
            <IconSymbol name="location.fill" size={16} color="#F97316" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.addressLabel}>{L("Pickup location", "Ubicación del servicio")}</Text>
            <Text style={styles.addressValue}>{job.location}</Text>
          </View>
        </View>

        {/* Steps */}
        <View style={styles.stepsCard}>
          <Text style={styles.stepsTitle}>{L("Your steps", "Tus pasos")}</Text>
          {FLOW.slice(0, -1).map((s, i) => {
            const stepIdx = i;
            const currentIdx = FLOW.indexOf(job.status);
            const done = stepIdx < currentIdx;
            const active = stepIdx === currentIdx;
            return (
              <View key={s} style={{ flexDirection: "row" }}>
                <View style={{ alignItems: "center", width: 22 }}>
                  <View
                    style={[
                      styles.dot,
                      { backgroundColor: done ? "#10B981" : active ? "#F97316" : "#CBD5E1" },
                    ]}
                  >
                    {done ? <IconSymbol name="checkmark" size={10} color="#FFFFFF" /> : null}
                  </View>
                  {i < FLOW.length - 2 ? (
                    <View
                      style={[styles.line, { backgroundColor: done ? "#10B981" : "#E2E8F0" }]}
                    />
                  ) : null}
                </View>
                <View style={{ flex: 1, paddingBottom: 16 }}>
                  <Text style={[styles.stepLabel, active && { color: "#F97316" }]}>
                    {stepLabel(s, isEs)}
                  </Text>
                  <Text style={styles.stepDesc}>{stepDesc(s, isEs)}</Text>
                </View>
              </View>
            );
          })}
        </View>

        <View style={{ paddingHorizontal: 20, marginTop: 16, gap: 10 }}>
          {(job.status === "arrived" || job.status === "in_progress") ? (
            <View style={styles.evidenceCard}>
              <Text style={styles.evidenceTitle}>{L("Service Evidence", "Evidencia del servicio")}</Text>
              <Pressable onPress={handleUploadBefore} style={styles.evidenceRow}>
                <Text style={styles.evidenceLabel}>{L("Before photo (required to start)", "Foto previa (requerida para iniciar)")}</Text>
                <Text style={styles.evidenceMeta}>{beforePhotoUri ? L("Uploaded", "Subida") : L("Missing", "Falta")}</Text>
              </Pressable>
              <Pressable onPress={handleUploadAfter} style={styles.evidenceRow}>
                <Text style={styles.evidenceLabel}>{L("After photo (required to finish)", "Foto posterior (requerida para finalizar)")}</Text>
                <Text style={styles.evidenceMeta}>{afterPhotoUri ? L("Uploaded", "Subida") : L("Missing", "Falta")}</Text>
              </Pressable>
            </View>
          ) : null}
          {nextStatus ? (
            <PrimaryButton
              title={ctaTitle}
              onPress={advance}
              hapticType="success"
              iconRight={<IconSymbol name="arrow.right" size={18} color="#FFFFFF" />}
            />
          ) : null}
          {job.status !== "in_progress" ? (
            <PrimaryButton
              title={L("Cancel job", "Cancelar trabajo")}
              variant="secondary"
              onPress={handleCancel}
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

function fakeCall(name: string) {
  haptic.light();
  if (Platform.OS !== "web") Alert.alert("Calling", `Calling ${name}…`);
}
function fakeMsg(name: string) {
  haptic.light();
  if (Platform.OS !== "web") Alert.alert("Message", `Send a message to ${name}.`);
}

function mapStatus(s: MechanicJobStatus): "idle" | "searching" | "enroute" | "arrived" | "in_progress" | "completed" {
  if (s === "heading_there") return "enroute";
  if (s === "arrived") return "arrived";
  if (s === "in_progress") return "in_progress";
  if (s === "completed") return "completed";
  return "idle";
}

function mapDispatchStatus(s: MechanicJobStatus): "searching" | "accepted" | "enroute" | "arrived" | "in_progress" | "completed" | "cancelled" {
  if (s === "heading_there") return "enroute";
  if (s === "arrived") return "arrived";
  if (s === "in_progress") return "in_progress";
  if (s === "completed") return "completed";
  if (s === "cancelled") return "cancelled";
  return "accepted";
}

const HEADING_DURATION = 20; // seconds for the puck animation along route

function computeMechanicLive(
  job: { pickup?: { latitude: number; longitude: number }; mechanicStart?: { latitude: number; longitude: number }; status: MechanicJobStatus },
  elapsed: number,
) {
  const pickup = job.pickup;
  const start = job.mechanicStart;
  if (!pickup || !start) return null;
  if (job.status === "heading_there") {
    const t = Math.min(1, elapsed / HEADING_DURATION);
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
  const effectiveMph = 24;
  return Math.max(1, Math.ceil((miles / effectiveMph) * 60));
}

function ctaLabel(s: MechanicJobStatus, isEs: boolean): string {
  switch (s) {
    case "heading_there": return isEs ? "Ya llegué" : "I've arrived";
    case "arrived": return isEs ? "Iniciar servicio" : "Start service";
    case "in_progress": return isEs ? "Marcar completo" : "Mark complete";
    default: return isEs ? "Continuar" : "Continue";
  }
}

function headlineFor(s: MechanicJobStatus, name: string, isEs: boolean): string {
  switch (s) {
    case "heading_there": return isEs ? `En camino a ${name}` : `Heading to ${name}`;
    case "arrived": return isEs ? `Llegaste a la ubicación de ${name}` : `You've arrived at ${name}'s location`;
    case "in_progress": return isEs ? "Servicio en progreso" : "Service in progress";
    case "completed": return isEs ? "Trabajo completado" : "Job complete";
    default: return "";
  }
}

function stepLabel(s: MechanicJobStatus, isEs: boolean): string {
  switch (s) {
    case "heading_there": return isEs ? "En camino" : "Heading there";
    case "arrived": return isEs ? "Llegaste" : "Arrived";
    case "in_progress": return isEs ? "Servicio en progreso" : "Service in progress";
    default: return s;
  }
}
function stepDesc(s: MechanicJobStatus, isEs: boolean): string {
  switch (s) {
    case "heading_there": return isEs ? "Conduce a la ubicación del cliente." : "Drive to the customer location.";
    case "arrived": return isEs ? "Encuentra al cliente y confirma el vehículo." : "Find the customer and confirm the vehicle.";
    case "in_progress": return isEs ? "Realiza el servicio." : "Perform the service.";
    default: return "";
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
  topBack: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "#F5F7FA",
    alignItems: "center", justifyContent: "center",
  },
  topTitle: { fontSize: 16, fontWeight: "800", color: "#0F172A" },
  headline: { paddingHorizontal: 20, marginTop: 18 },
  headlineTitle: { fontSize: 22, fontWeight: "800", color: "#0F172A" },
  headlineSub: { fontSize: 13, color: "#64748B", marginTop: 4 },
  customerRow: {
    marginHorizontal: 20,
    marginTop: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 16,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  customerName: { fontSize: 15, fontWeight: "800", color: "#0F172A" },
  customerVehicle: { fontSize: 12, color: "#64748B", marginTop: 2 },
  actionBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: "#0F172A",
    alignItems: "center", justifyContent: "center",
  },
  addressCard: {
    marginHorizontal: 20,
    marginTop: 12,
    backgroundColor: "#F5F7FA",
    borderRadius: 14,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconBubble: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: "#FFEDD5",
    alignItems: "center", justifyContent: "center",
  },
  addressLabel: { fontSize: 11, color: "#64748B", fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  addressValue: { fontSize: 14, color: "#0F172A", fontWeight: "600", marginTop: 2 },
  stepsCard: {
    marginHorizontal: 20,
    marginTop: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 16,
    padding: 14,
  },
  stepsTitle: { fontSize: 13, color: "#64748B", fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 },
  dot: { width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  line: { width: 2, flex: 1, marginTop: 2 },
  stepLabel: { fontSize: 14, fontWeight: "700", color: "#0F172A" },
  stepDesc: { fontSize: 12, color: "#64748B", marginTop: 2, lineHeight: 17 },
  evidenceCard: {
    backgroundColor: "#FFF7ED",
    borderColor: "#FDBA74",
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    gap: 8,
  },
  evidenceTitle: { fontSize: 12, fontWeight: "800", color: "#9A3412", textTransform: "uppercase" },
  evidenceRow: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#FED7AA",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  evidenceLabel: { color: "#7C2D12", fontSize: 13, fontWeight: "600", flex: 1 },
  evidenceMeta: { color: "#C2410C", fontSize: 12, fontWeight: "700" },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: "#DCFCE7",
    alignItems: "center", justifyContent: "center",
  },
  emptyTitle: { fontSize: 20, fontWeight: "800", color: "#0F172A" },
  emptyText: { fontSize: 14, color: "#64748B", textAlign: "center", lineHeight: 20 },
});
