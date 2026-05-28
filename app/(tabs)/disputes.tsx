import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { ScreenMenuHeader } from "@/components/screen-menu-header";
import { useStore } from "@/lib/store";
import { useLocaleContext } from "@/hooks/use-locale";
import { haptic } from "@/lib/haptics";

export default function DisputesScreen() {
  const { state } = useStore();
  const { formatPrice, locale, t } = useLocaleContext();
  const completed = state.jobs.filter((j) => j.status === "completed");
  const isEs = locale === "es-MX";
  const L = (en: string, es: string) => (isEs ? es : en);

  const fileDispute = (jobId: string) => {
    haptic.warning();
    Alert.alert(
      L("Dispute Submitted", "Disputa enviada"),
      L(
        `Your dispute for job ${jobId.slice(-6)} has been submitted. Our team will review it within 24 hours.`,
        `Tu disputa para el servicio ${jobId.slice(-6)} fue enviada. Nuestro equipo la revisará en 24 horas.`
      )
    );
  };

  return (
    <ScreenContainer edges={["left", "right", "bottom"]}>
      <ScreenMenuHeader title={t("tabs.disputes" as any)} />
      <View style={styles.header}>
        <Text style={styles.headerText}>
          {L("File a dispute for any completed service within 24 hours.", "Presenta una disputa por cualquier servicio completado dentro de 24 horas.")}
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
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.title}>{item.service.replace("_", " ").toUpperCase()}</Text>
              <Text style={styles.sub}>
                {new Date(item.completedAt ?? item.createdAt).toLocaleDateString()} • {formatPrice(item.fare.total + (item.tip ?? 0))}
              </Text>
              <Pressable onPress={() => fileDispute(item.id)} style={({ pressed }) => [styles.btn, pressed && { opacity: 0.85 }]}>
                <Text style={styles.btnText}>{L("File Dispute", "Presentar disputa")}</Text>
              </Pressable>
            </View>
          )}
        />
      )}
    </ScreenContainer>
  );
}

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

