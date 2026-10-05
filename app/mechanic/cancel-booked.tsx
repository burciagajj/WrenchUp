import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { PrimaryButton } from "@/components/primary-button";
import { useAuth } from "@/lib/auth-context";
import { resolveAuthSession } from "@/lib/resolve-auth-session";
import { fetchDispatchRequest, releaseDispatchFromMechanic, type DispatchRequest } from "@/lib/live-dispatch";
import { useL } from "@/hooks/use-locale";
import { haptic } from "@/lib/haptics";
import { useStore } from "@/lib/store";
import { getServiceType } from "@/lib/seed";
import { deriveBookedMeta } from "@/lib/booked-trip";
import type { ServiceCode } from "@/lib/types";
import { useTapGuard } from "@/hooks/use-tap-guard";

type CancelReason = {
  key: string;
  title: string;
};

const REASONS: CancelReason[] = [
  { key: "not_interested", title: "Not interested in this job anymore" },
  { key: "low_earnings", title: "Earnings seem low" },
  { key: "timing", title: "Can’t make the scheduled time" },
  { key: "safety", title: "Safety or vehicle concern" },
  { key: "other", title: "Other reason" },
];

export default function MechanicCancelBookedScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { user } = useAuth();
  const { dispatch } = useStore();
  const L = useL();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [request, setRequest] = useState<DispatchRequest | null>(null);
  const [selectedReason, setSelectedReason] = useState("");
  const [otherReason, setOtherReason] = useState("");

  const requestId = typeof id === "string" ? id : null;
  const bookedMeta = useMemo(
    () => deriveBookedMeta(request?.scheduled_for ?? null, request?.customer_note ?? null),
    [request?.customer_note, request?.scheduled_for],
  );
  const service = request ? getServiceType(request.service_code as ServiceCode) : null;

  useEffect(() => {
    let alive = true;
    if (!requestId || !user?.id) {
      setRequest(null);
      setLoading(false);
      return () => {
        alive = false;
      };
    }

    setLoading(true);
    const load = async () => {
      try {
        const resolved = await resolveAuthSession(user);
        if (!resolved || !alive) return;
        const remote = await fetchDispatchRequest(resolved.sessionToken, requestId);
        if (!alive) return;
        if (!remote || remote.assigned_mechanic_user_id !== user.id) {
          setRequest(null);
          return;
        }
        if (remote.status === "cancelled" || remote.status === "completed") {
          setRequest(null);
          return;
        }
        setRequest(remote);
      } catch (error) {
        console.error("[MechanicCancelBooked] load failed:", error);
        if (alive) setRequest(null);
      } finally {
        if (alive) setLoading(false);
      }
    };

    void load();
    return () => {
      alive = false;
    };
  }, [requestId, user]);

  const handleConfirm = useTapGuard()(async () => {
    if (!request || !requestId || !user?.id) return;
    const finalReason = selectedReason === "other" ? otherReason.trim() : REASONS.find((item) => item.key === selectedReason)?.title ?? "";
    if (!finalReason) {
      Alert.alert(L("Reason required", "Se requiere un motivo"), L("Please select or enter a reason.", "Selecciona o escribe un motivo."));
      return;
    }

    setSaving(true);
    try {
      const resolved = await resolveAuthSession(user);
      if (!resolved) return;
      // Routed through the same server-side release/reroute/notify path as
      // live-job cancellations (lib/mechanic-cancel-service.ts), which also
      // records a cancellation strike against this mechanic and applies a
      // temporary offer throttle after repeated cancellations of committed jobs.
      const updated = await releaseDispatchFromMechanic(resolved.sessionToken, requestId, {
        reason: finalReason,
      });
      if (!updated) {
        Alert.alert(
          L("Connection issue", "Problema de conexión"),
          L("Could not cancel this booked service right now. Please try again.", "No se pudo cancelar este servicio agendado ahora. Inténtalo de nuevo."),
        );
        return;
      }

      dispatch({
        type: "UPDATE_MECHANIC_JOB_STATUS",
        payload: { id: requestId, status: "cancelled" },
      });
      haptic.success();
      router.replace("/(tabs)/booked-requests" as any);
    } catch (error) {
      console.error("[MechanicCancelBooked] cancel failed:", error);
      Alert.alert(
        L("Cancellation failed", "No se pudo cancelar"),
        L("Please try again in a moment.", "Inténtalo de nuevo en un momento."),
      );
    } finally {
      setSaving(false);
    }
  });

  if (loading && !request) {
    return (
      <ScreenContainer showBackButton title={L("Cancel booked service", "Cancelar servicio agendado")}>
        <View style={styles.loadingWrap}>
          <Text style={styles.loadingText}>{L("Loading booked service...", "Cargando servicio agendado...")}</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (!request) {
    return (
      <ScreenContainer showBackButton title={L("Cancel booked service", "Cancelar servicio agendado")}>
        <View style={styles.loadingWrap}>
          <Text style={styles.loadingText}>{L("Booked job not found", "No se encontró el trabajo agendado")}</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["left", "right", "bottom"]} showBackButton title={L("Cancel booked service", "Cancelar servicio agendado")}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{L("Booked service", "Servicio agendado")}</Text>
          <Text style={styles.service}>{service?.name ?? L("Booked service", "Servicio agendado")}</Text>
          <Text style={styles.meta}>{request.customer_name ?? L("Customer", "Cliente")}</Text>
          <Text style={styles.meta}>{request.vehicle_label}</Text>
          <Text style={styles.meta}>{request.location_label}</Text>
          <Text style={styles.meta}>{bookedMeta.scheduledForMs ? new Date(bookedMeta.scheduledForMs).toLocaleString() : "—"}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{L("Select your reason for cancelation", "Selecciona tu motivo de cancelación")}</Text>
          <Text style={styles.helperText}>
            {L(
              "Pick the closest reason so we can keep the booking experience reliable and fair.",
              "Elige el motivo más cercano para que podamos mantener la experiencia de reserva confiable y justa.",
            )}
          </Text>

          {REASONS.map((reason) => {
            const selected = selectedReason === reason.key;
            return (
              <Pressable
                key={reason.key}
                onPress={() => setSelectedReason(reason.key)}
                style={({ pressed }) => [styles.reasonItem, selected && styles.reasonItemSelected, pressed && { opacity: 0.9 }]}
              >
                <View style={[styles.reasonDot, selected && styles.reasonDotSelected]} />
                <Text style={[styles.reasonText, selected && styles.reasonTextSelected]}>{reason.title}</Text>
              </Pressable>
            );
          })}

          {selectedReason === "other" ? (
            <TextInput
              value={otherReason}
              onChangeText={setOtherReason}
              placeholder={L("Type your reason here", "Escribe tu motivo aquí")}
              placeholderTextColor="#94A3B8"
              multiline
              style={[styles.input, { minHeight: 92, textAlignVertical: "top" }]}
            />
          ) : null}
        </View>

        <View style={{ marginTop: 8 }}>
          <PrimaryButton
            title={saving ? L("Cancelling...", "Cancelando...") : L("Cancel booked service", "Cancelar servicio agendado")}
            variant="danger"
            loading={saving}
            disabled={!selectedReason || (selectedReason === "other" && !otherReason.trim())}
            onPress={() => void handleConfirm()}
            hapticType="error"
          />
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  loadingText: { color: "#F8FAFC", fontSize: 16, fontWeight: "700", textAlign: "center" },
  content: { padding: 16, gap: 12 },
  card: {
    backgroundColor: "#1A1A2E",
    borderColor: "#2A2A40",
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 4,
  },
  cardTitle: { color: "#F97316", fontSize: 12, fontWeight: "900", textTransform: "uppercase", marginBottom: 2 },
  service: { color: "#F8FAFC", fontSize: 18, fontWeight: "900" },
  meta: { color: "#CBD5E1", fontSize: 13, fontWeight: "600" },
  section: {
    backgroundColor: "#1A1A2E",
    borderColor: "#2A2A40",
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 10,
  },
  sectionTitle: { color: "#F97316", fontSize: 14, fontWeight: "900", textTransform: "uppercase" },
  helperText: { color: "#CBD5E1", fontSize: 12, fontWeight: "600" },
  reasonItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2A2A40",
    backgroundColor: "#121212",
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  reasonItemSelected: {
    backgroundColor: "#0F172A",
    borderColor: "#F97316",
  },
  reasonDot: {
    width: 14,
    height: 14,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "#64748B",
  },
  reasonDotSelected: {
    borderColor: "#F97316",
    backgroundColor: "#F97316",
  },
  reasonText: { flex: 1, color: "#CBD5E1", fontSize: 14, fontWeight: "700" },
  reasonTextSelected: { color: "#F8FAFC" },
  input: {
    borderWidth: 1,
    borderColor: "#2A2A40",
    backgroundColor: "#121212",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: "#F8FAFC",
    fontSize: 14,
  },
});
