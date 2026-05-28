import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useStore } from "@/lib/store";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { PrimaryButton } from "@/components/primary-button";
import { useLocaleContext } from "@/hooks/use-locale";
import { getServiceType } from "@/lib/seed";
import { haptic } from "@/lib/haptics";
import { useAuth } from "@/lib/auth-context";
import { resolveAuthSession } from "@/lib/resolve-auth-session";
import { updateDispatchStatus } from "@/lib/live-dispatch";

export default function MechanicBookedDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { state, dispatch } = useStore();
  const { user } = useAuth();
  const { locale } = useLocaleContext();
  const isEs = locale === "es-MX";
  const L = (en: string, es: string) => (isEs ? es : en);
  const job = typeof id === "string" ? state.mechanicJobs.find((j) => j.id === id) : null;

  if (!job) {
    return (
      <ScreenContainer>
        <View style={styles.wrap}>
          <Text style={styles.title}>{L("Booked job not found", "No se encontró el trabajo agendado")}</Text>
          <PrimaryButton title={L("Back", "Volver")} fullWidth={false} onPress={() => router.replace("/(tabs)/booked-requests" as any)} />
        </View>
      </ScreenContainer>
    );
  }

  const service = getServiceType(job.service);
  const startAt = typeof job.scheduledFor === "number" ? new Date(job.scheduledFor) : null;
  const isDue = !startAt || startAt.getTime() <= Date.now();
  const minsLeft = startAt ? Math.max(0, Math.ceil((startAt.getTime() - Date.now()) / 60000)) : 0;

  const startNow = () => {
    if (!isDue) return;
    haptic.success();
    dispatch({ type: "UPDATE_MECHANIC_JOB_STATUS", payload: { id: job.id, status: "heading_there" } });
    router.replace("/mechanic/active" as any);
  };

  const cancelBooked = () => {
    Alert.alert(
      L("Cancel booked service?", "¿Cancelar servicio agendado?"),
      L(
        "Warning: this cancellation will affect your cancellation and completion ratings.",
        "Advertencia: esta cancelación afectará tus métricas de cancelación y finalización."
      ),
      [
        { text: L("Keep booking", "Mantener reserva"), style: "cancel" },
        {
          text: L("Cancel booking", "Cancelar reserva"),
          style: "destructive",
          onPress: async () => {
            haptic.warning();
            if (job.remoteRequestId && user?.id) {
              try {
                const resolved = await resolveAuthSession(user);
                if (resolved) {
                  await updateDispatchStatus(resolved.sessionToken, job.remoteRequestId, "cancelled");
                }
              } catch (error) {
                console.error("[MechanicBooked] Failed to cancel remote booked request:", error);
              }
            }
            dispatch({ type: "UPDATE_MECHANIC_JOB_STATUS", payload: { id: job.id, status: "cancelled" } });
            router.replace("/(tabs)" as any);
          },
        },
      ]
    );
  };

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.replace("/(tabs)/booked-requests" as any)} hitSlop={10}>
          <IconSymbol name="chevron.left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.headerTitle}>{L("Booked Service", "Servicio agendado")}</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.card}>
        <Text style={styles.badge}>{L("Upcoming Job", "Próximo trabajo")}</Text>
        <InfoRow label={L("Customer", "Cliente")} value={job.customerName} />
        <InfoRow label={L("Vehicle", "Vehículo")} value={job.vehicle} />
        <InfoRow label={L("Service", "Servicio")} value={service?.name ?? "—"} />
        <InfoRow label={L("Address", "Dirección")} value={job.location} />
        <InfoRow
          label={L("Scheduled for", "Programado para")}
          value={startAt ? startAt.toLocaleString(isEs ? "es-MX" : "en-US") : "—"}
        />
        <InfoRow label={L("Final price", "Precio final")} value={`$${job.payout.toFixed(2)}`} />
        {job.customerNote ? <InfoRow label={L("Customer note", "Nota del cliente")} value={job.customerNote} /> : null}
      </View>

      <View style={{ paddingHorizontal: 20, marginTop: 14 }}>
        {!isDue ? (
          <View style={styles.waitCard}>
            <Text style={styles.waitText}>
              {L("This trip will unlock at scheduled time.", "Este viaje se habilitará a la hora programada.")}
            </Text>
            <Text style={styles.waitMins}>
              {L("Starts in", "Inicia en")} {minsLeft} {L("min", "min")}
            </Text>
          </View>
        ) : null}
        <PrimaryButton
          title={isDue ? L("Start trip now", "Iniciar viaje ahora") : L("Waiting for scheduled time", "Esperando hora programada")}
          onPress={startNow}
          disabled={!isDue}
        />
        <View style={{ marginTop: 10 }}>
          <PrimaryButton
            title={L("Cancel booked service", "Cancelar servicio agendado")}
            variant="warm"
            onPress={cancelBooked}
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
