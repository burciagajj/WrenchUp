import React, { useCallback } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { ScreenMenuHeader } from "@/components/screen-menu-header";
import { useJobs } from "@/lib/store";
import { useLocaleContext, useL } from "@/hooks/use-locale";
import { haptic } from "@/lib/haptics";
import { useAuth } from "@/lib/auth-context";
import { resolveAuthSession } from "@/lib/resolve-auth-session";
import { createDispute } from "@/lib/safety";
import type { Job } from "@/lib/types";

export default function DisputesScreen() {
  const jobs = useJobs();
  const { formatPrice, t } = useLocaleContext();
  const completed = jobs.filter((j) => j.status === "completed");
  const L = useL();
  const { user } = useAuth();

  const fileDispute = useCallback(async (job: Job) => {
    haptic.warning();
    if (!job.remoteRequestId || !user?.id) {
      Alert.alert(L("Dispute unavailable", "Disputa no disponible"), L("This service is missing a live request record.", "A este servicio le falta el registro en vivo."));
      return;
    }
    const resolved = await resolveAuthSession(user);
    if (!resolved) {
      Alert.alert(L("Sign in required", "Inicio de sesión requerido"), L("Please sign in again to file a dispute.", "Inicia sesión nuevamente para presentar una disputa."));
      return;
    }
    const saved = await createDispute({
      sessionToken: resolved.sessionToken,
      role: "customer",
      requestId: job.remoteRequestId,
      reason: "customer_service_dispute",
      message: `Customer disputed job ${job.id} for ${job.service}.`,
    });
    Alert.alert(
      saved ? L("Dispute Submitted", "Disputa enviada") : L("Could not submit dispute", "No se pudo enviar la disputa"),
      saved
        ? L(
            `Your dispute for job ${job.id.slice(-6)} has been submitted. Payout release is paused while our team reviews it.`,
            `Tu disputa para el servicio ${job.id.slice(-6)} fue enviada. La liberación del pago queda pausada mientras nuestro equipo la revisa.`,
          )
        : L("Please try again. If this is urgent, contact support directly.", "Inténtalo de nuevo. Si es urgente, contacta soporte directamente."),
    );
  }, [L, user]);

  const renderDispute = useCallback(({ item }: { item: Job }) => (
    <DisputeRow
      item={item}
      formatPrice={formatPrice}
      onDispute={() => void fileDispute(item)}
      L={L}
    />
  ), [formatPrice, L, fileDispute]);

  return (
    <ScreenContainer edges={["left", "right", "bottom"]}>
      <ScreenMenuHeader title={t("tabs.disputes" as any)} />
      <View style={styles.header}>
        <Text style={styles.headerText}>
          {L("File a dispute within 2 hours of confirming to hold the mechanic's remaining payout. You can still report a problem for up to 24 hours.", "Presenta una disputa dentro de 2 horas de confirmar para retener el resto del pago del mecánico. Aún puedes reportar un problema hasta 24 horas después.")}
        </Text>
      </View>

      {completed.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>{L("No completed services yet", "Aún no hay servicios completados")}</Text>
          <Text style={styles.emptySub}>{L("Completed services will appear here.", "Los servicios completados aparecerán aquí.")}</Text>
        </View>
      ) : (
        <FlatList
          data={completed}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 10 }}
          renderItem={renderDispute}
        />
      )}
    </ScreenContainer>
  );
}

const DisputeRow = React.memo(function DisputeRow({
  item,
  formatPrice,
  onDispute,
  L,
}: {
  item: Job;
  formatPrice: (amount: number) => string;
  onDispute: () => void;
  L: (en: string, es: string) => string;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{item.service.replace("_", " ").toUpperCase()}</Text>
      <Text style={styles.sub}>
        {new Date(item.completedAt ?? item.createdAt).toLocaleDateString()} • {formatPrice(item.fare.total + (item.tip ?? 0))}
      </Text>
      <Pressable onPress={onDispute} style={({ pressed }) => [styles.btn, pressed && { opacity: 0.85 }]}>
        <Text style={styles.btnText}>{L("File Dispute", "Presentar disputa")}</Text>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 14 },
  headerText: { color: "#C2410C", fontSize: 13 },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 6 },
  emptyTitle: { color: "#F8FAFC", fontSize: 18, fontWeight: "800" },
  emptySub: { color: "#94A3B8", fontSize: 13, textAlign: "center" },
  card: {
    backgroundColor: "#1A1A2E",
    borderColor: "#2A2A40",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  title: { color: "#F8FAFC", fontWeight: "800", fontSize: 13 },
  sub: { color: "#CBD5E1", fontSize: 12 },
  btn: {
    alignSelf: "flex-start",
    backgroundColor: "#F97316",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  btnText: { color: "#FFFFFF", fontWeight: "800", fontSize: 12 },
});
