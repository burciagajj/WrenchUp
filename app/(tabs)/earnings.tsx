import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { ScreenMenuHeader } from "@/components/screen-menu-header";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth-context";
import { useLocaleContext, useL } from "@/hooks/use-locale";
import { useConnectPayouts } from "@/hooks/use-connect-payouts";
import { haptic } from "@/lib/haptics";

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
  const L = useL();
  const role = state.dashboardRoleOverride ?? user?.role ?? state.role;
  const payouts = useConnectPayouts(user, role === "mechanic");

  const start = startOfPeriod4AM(Date.now());
  const startLabel = new Date(start).toLocaleString(locale === "es-MX" ? "es-MX" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const mechanicCompleted = state.mechanicJobs.filter((j) => j.status === "completed");
  const mechanicCompletedToday = mechanicCompleted.filter((j) => (j.completedAt ?? j.receivedAt) >= start);
  const mechanicPayoutToday = mechanicCompletedToday.reduce((sum, j) => sum + j.payout, 0);
  const mechanicTipToday = mechanicCompletedToday.reduce((sum, j) => sum + (j.tip ?? 0), 0);
  const mechanicToday = mechanicPayoutToday + mechanicTipToday;
  const mechanicPayoutAll = mechanicCompleted.reduce((sum, j) => sum + j.payout, 0);
  const mechanicTipAll = mechanicCompleted.reduce((sum, j) => sum + (j.tip ?? 0), 0);
  const mechanicAll = mechanicPayoutAll + mechanicTipAll;
  const mechanicTippedJobsCount = mechanicCompleted.filter((j) => (j.tip ?? 0) > 0).length;

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

        {role === "mechanic" ? (
          <>
            <Text style={styles.sectionLabel}>{L("Tip breakdown", "Desglose de propinas")}</Text>
            <View style={styles.card}>
              <Row label={L("Job payouts", "Pagos por trabajo")} value={formatPrice(mechanicPayoutAll)} />
              <Row label={L("Tips", "Propinas")} value={formatPrice(mechanicTipAll)} />
              <Row label={L("Tips today", "Propinas de hoy")} value={formatPrice(mechanicTipToday)} />
              <Row
                label={L("Jobs tipped", "Trabajos con propina")}
                value={`${mechanicTippedJobsCount}/${mechanicCompleted.length}`}
              />
            </View>
            <Text style={styles.sectionLabel}>{L("Payouts", "Pagos")}</Text>
            <View style={styles.card}>
              {payouts.status.payoutsEnabled ? (
                <View style={styles.payoutSetupContainer}>
                  <View style={styles.payoutRow}>
                    <View style={styles.payoutStatusDotActive} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.payoutStatusTitle}>
                        {L("Payouts active", "Pagos activos")}
                      </Text>
                      <Text style={styles.payoutStatusSubtitle}>
                        {L(
                          "Your Stripe account is set up. Job payouts are transferred automatically after each completed job.",
                          "Tu cuenta de Stripe está configurada. Los pagos por trabajo se transfieren automáticamente después de cada trabajo completado.",
                        )}
                      </Text>
                    </View>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    disabled={payouts.openingSettings}
                    onPress={() => {
                      void payouts.openPayoutSettings();
                    }}
                    style={({ pressed }) => [
                      styles.payoutButton,
                      pressed ? { opacity: 0.85 } : null,
                      payouts.openingSettings ? { opacity: 0.6 } : null,
                    ]}
                  >
                    {payouts.openingSettings ? (
                      <ActivityIndicator color="#0B1220" />
                    ) : (
                      <Text style={styles.payoutButtonText}>
                        {L("Edit payout info", "Editar información de pagos")}
                      </Text>
                    )}
                  </Pressable>
                  {payouts.error ? <Text style={styles.payoutErrorText}>{payouts.error}</Text> : null}
                </View>
              ) : (
                <View style={styles.payoutSetupContainer}>
                  <View style={styles.payoutRow}>
                    <View
                      style={
                        payouts.status.detailsSubmitted
                          ? styles.payoutStatusDotPending
                          : styles.payoutStatusDotInactive
                      }
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.payoutStatusTitle}>
                        {payouts.status.detailsSubmitted
                          ? L("Verification in progress", "Verificación en curso")
                          : L("Set up payouts", "Configura tus pagos")}
                      </Text>
                      <Text style={styles.payoutStatusSubtitle}>
                        {payouts.status.detailsSubmitted
                          ? L(
                              "Stripe is reviewing your information. This usually takes a few minutes to a couple of days.",
                              "Stripe está revisando tu información. Esto suele tardar desde unos minutos hasta un par de días.",
                            )
                          : L(
                              "Connect a Stripe account so job payouts go straight to your bank account.",
                              "Conecta una cuenta de Stripe para que los pagos por trabajo lleguen directo a tu cuenta bancaria.",
                            )}
                      </Text>
                    </View>
                  </View>
                  <Pressable
                    disabled={payouts.startingOnboarding}
                    onPress={() => {
                      haptic.light();
                      void payouts.startOnboarding();
                    }}
                    style={({ pressed }) => [
                      styles.payoutButton,
                      pressed ? { opacity: 0.85 } : null,
                      payouts.startingOnboarding ? { opacity: 0.6 } : null,
                    ]}
                  >
                    {payouts.startingOnboarding ? (
                      <ActivityIndicator color="#0B1220" />
                    ) : (
                      <Text style={styles.payoutButtonText}>
                        {payouts.status.detailsSubmitted
                          ? L("Continue setup", "Continuar configuración")
                          : L("Set up payouts", "Configurar pagos")}
                      </Text>
                    )}
                  </Pressable>
                  {payouts.error ? <Text style={styles.payoutErrorText}>{payouts.error}</Text> : null}
                </View>
              )}
            </View>
          </>
        ) : null}
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
  sectionLabel: {
    color: "#94A3B8",
    fontSize: 11.5,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginTop: 4,
    marginLeft: 2,
  },
  payoutSetupContainer: {
    padding: 14,
    gap: 12,
  },
  payoutRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  payoutStatusDotActive: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
    backgroundColor: "#22C55E",
  },
  payoutStatusDotPending: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
    backgroundColor: "#F59E0B",
  },
  payoutStatusDotInactive: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
    backgroundColor: "#64748B",
  },
  payoutStatusTitle: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "800",
  },
  payoutStatusSubtitle: {
    color: "#94A3B8",
    fontSize: 12.5,
    lineHeight: 17,
    marginTop: 3,
  },
  payoutButton: {
    backgroundColor: "#FB923C",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  payoutButtonText: {
    color: "#0B1220",
    fontSize: 14,
    fontWeight: "900",
  },
  payoutErrorText: {
    color: "#F87171",
    fontSize: 12,
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
