import { ScrollView, StyleSheet, Text, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { ScreenMenuHeader } from "@/components/screen-menu-header";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth-context";
import { useLocaleContext } from "@/hooks/use-locale";

function startOfPeriod4AM(nowMs: number): number {
  const d = new Date(nowMs);
  const start = new Date(d);
  start.setHours(4, 0, 0, 0);
  if (d.getTime() < start.getTime()) start.setDate(start.getDate() - 1);
  return start.getTime();
}

export default function EarningsScreen() {
  const { state } = useStore();
  const { user } = useAuth();
  const { formatPrice, locale, t } = useLocaleContext();
  const isEs = locale === "es-MX";
  const L = (en: string, es: string) => (isEs ? es : en);
  const role = state.dashboardRoleOverride ?? user?.role ?? state.role;

  const start = startOfPeriod4AM(Date.now());
  const startLabel = new Date(start).toLocaleString(locale === "es-MX" ? "es-MX" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const mechanicCompleted = state.mechanicJobs.filter((j) => j.status === "completed");
  const mechanicToday = mechanicCompleted
    .filter((j) => (j.completedAt ?? j.receivedAt) >= start)
    .reduce((sum, j) => sum + j.payout, 0);
  const mechanicAll = mechanicCompleted.reduce((sum, j) => sum + j.payout, 0);

  const customerCompleted = state.jobs.filter((j) => j.status === "completed");
  const customerToday = customerCompleted
    .filter((j) => (j.completedAt ?? j.createdAt) >= start)
    .reduce((sum, j) => sum + j.fare.total + (j.tip ?? 0), 0);
  const customerAll = customerCompleted.reduce((sum, j) => sum + j.fare.total + (j.tip ?? 0), 0);

  const todayValue = role === "mechanic" ? mechanicToday : customerToday;
  const allValue = role === "mechanic" ? mechanicAll : customerAll;
  const jobsCount = role === "mechanic" ? mechanicCompleted.length : customerCompleted.length;

  return (
    <ScreenContainer edges={["left", "right", "bottom"]}>
      <ScreenMenuHeader title={t("tabs.earnings")} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>
            {role === "mechanic"
              ? L("Earnings today (resets 4:00 AM)", "Ganancias de hoy (se reinicia a las 4:00 a. m.)")
              : L("Spending today (resets 4:00 AM)", "Gasto de hoy (se reinicia a las 4:00 a. m.)")}
          </Text>
          <Text style={styles.heroValue}>{formatPrice(todayValue)}</Text>
          <Text style={styles.heroMeta}>{L("Window start", "Inicio de período")}: {startLabel}</Text>
        </View>

        <View style={styles.card}>
          <Row label={role === "mechanic" ? L("Total earned", "Total ganado") : L("Total spent", "Total gastado")} value={formatPrice(allValue)} />
          <Row label={role === "mechanic" ? L("Completed jobs", "Trabajos completados") : L("Completed services", "Servicios completados")} value={`${jobsCount}`} />
          <Row label={role === "mechanic" ? L("Average per job", "Promedio por trabajo") : L("Average per service", "Promedio por servicio")} value={formatPrice(jobsCount ? allValue / jobsCount : 0)} />
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 30,
    gap: 14,
  },
  hero: {
    backgroundColor: "#1A1A2E",
    borderColor: "#2A2A40",
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    alignItems: "center",
  },
  heroLabel: {
    color: "#C2410C",
    fontSize: 12,
    fontWeight: "700",
  },
  heroValue: {
    color: "#F8FAFC",
    fontSize: 34,
    fontWeight: "900",
    marginTop: 6,
  },
  heroMeta: {
    color: "#CBD5E1",
    fontSize: 12,
    marginTop: 6,
  },
  card: {
    backgroundColor: "#1A1A2E",
    borderColor: "#2A2A40",
    borderWidth: 1,
    borderRadius: 16,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#2A2A40",
  },
  rowLabel: {
    color: "#E5E7EB",
    fontSize: 14,
    fontWeight: "600",
  },
  rowValue: {
    color: "#FB923C",
    fontSize: 14,
    fontWeight: "800",
  },
});
