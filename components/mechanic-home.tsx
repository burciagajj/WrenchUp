import { ScrollView, StyleSheet, Text, View, Pressable, Switch } from "react-native";
import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useStore, useMechanicActiveJob, usePendingMechanicJob } from "@/lib/store";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { PrimaryButton } from "@/components/primary-button";
import { haptic } from "@/lib/haptics";
import { generateMechanicJob } from "@/lib/mechanic-sim";
import { notifyNow } from "@/lib/notifications";
import { getServiceType } from "@/lib/seed";
import type { MechanicJob } from "@/lib/types";

export function MechanicHome() {
  const router = useRouter();
  const { state, dispatch } = useStore();
  const pending = usePendingMechanicJob();
  const active = useMechanicActiveJob();

  // Stats from completed mechanic jobs
  const stats = useMemo(() => {
    const completed = state.mechanicJobs.filter((j) => j.status === "completed");
    const earnings = completed.reduce((sum, j) => sum + j.payout, 0);
    return { count: completed.length, earnings };
  }, [state.mechanicJobs]);

  // Auto-generate a fake incoming request every ~10s while online and idle.
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (!state.mechanicOnline) return;

    const tryGenerate = () => {
      // Only generate if there's no pending and no active job
      const hasActive = state.mechanicJobs.some(
        (j) => j.status === "pending" || j.status === "heading_there" ||
               j.status === "arrived" || j.status === "in_progress",
      );
      if (hasActive) return;
      const job = generateMechanicJob(state.userCoords);
      dispatch({ type: "ADD_MECHANIC_JOB", payload: job });
      const service = getServiceType(job.service);
      notifyNow({
        title: "New job request",
        body: `${service?.name ?? "Service"} • $${job.payout.toFixed(2)} • ${job.distanceMiles} mi`,
        data: { kind: "mechanic_request", id: job.id },
      });
      haptic.medium();
    };

    // Generate one quickly so user sees the flow, then on interval.
    const first = setTimeout(tryGenerate, 1500);
    intervalRef.current = setInterval(tryGenerate, 12000);
    return () => {
      clearTimeout(first);
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.mechanicOnline]);

  // When a pending request comes in, route to incoming sheet
  useEffect(() => {
    if (pending) {
      router.push({ pathname: "/mechanic/incoming" as any, params: { id: pending.id } } as any);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending?.id]);

  const handleToggleOnline = (value: boolean) => {
    haptic.medium();
    dispatch({ type: "SET_MECHANIC_ONLINE", payload: value });
  };

  const switchToCustomer = () => {
    haptic.selection();
    dispatch({ type: "SET_ROLE", payload: "customer" });
  };

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={styles.headerPad}>
          <Text style={styles.greeting}>Mechanic dashboard</Text>
          <Text style={styles.userName}>{state.userName}</Text>
        </View>

        {/* Online toggle hero */}
        <View style={{ paddingHorizontal: 20 }}>
          <View
            style={[
              styles.onlineCard,
              state.mechanicOnline ? styles.onlineCardActive : styles.onlineCardIdle,
            ]}
          >
            <View style={{ flex: 1 }}>
              <View style={styles.statusRow}>
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: state.mechanicOnline ? "#10B981" : "#94A3B8" },
                  ]}
                />
                <Text style={styles.statusLabel}>
                  {state.mechanicOnline ? "ONLINE" : "OFFLINE"}
                </Text>
              </View>
              <Text style={styles.onlineHeadline}>
                {state.mechanicOnline ? "Receiving job requests" : "Go online to start earning"}
              </Text>
              <Text style={styles.onlineSub}>
                {state.mechanicOnline
                  ? "We'll send you nearby jobs as they come in."
                  : "Toggle on when you're ready to accept work."}
              </Text>
            </View>
            <Switch
              value={state.mechanicOnline}
              onValueChange={handleToggleOnline}
              trackColor={{ false: "#CBD5E1", true: "#FB923C" }}
              thumbColor={state.mechanicOnline ? "#F97316" : "#F8FAFC"}
              ios_backgroundColor="#CBD5E1"
            />
          </View>
        </View>

        {/* Active job pill */}
        {active ? (
          <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
            <Pressable
              onPress={() => {
                haptic.light();
                router.push("/mechanic/active" as any);
              }}
              style={({ pressed }) => [styles.activeBanner, pressed && { opacity: 0.9 }]}
            >
              <View style={styles.activeIcon}>
                <IconSymbol name="wrench.fill" size={20} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.activeTitle}>Active job in progress</Text>
                <Text style={styles.activeSub}>
                  {active.customerName} • ${active.payout.toFixed(2)}
                </Text>
              </View>
              <IconSymbol name="chevron.right" size={20} color="#FFFFFF" />
            </Pressable>
          </View>
        ) : null}

        {/* Stats */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Today's stats</Text>
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>${stats.earnings.toFixed(2)}</Text>
              <Text style={styles.statLabel}>Earnings</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{stats.count}</Text>
              <Text style={styles.statLabel}>Jobs done</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={styles.statValue}>4.9</Text>
              <Text style={styles.statLabel}>Rating</Text>
            </View>
          </View>
        </View>

        {/* Recent activity */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent activity</Text>
          {state.mechanicJobs.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <IconSymbol name="bolt.fill" size={26} color="#F97316" />
              </View>
              <Text style={styles.emptyTitle}>No jobs yet</Text>
              <Text style={styles.emptyText}>
                Go online and we'll route incoming requests to you here.
              </Text>
            </View>
          ) : (
            state.mechanicJobs.slice(0, 6).map((j) => <MechanicJobRow key={j.id} job={j} />)
          )}
        </View>

        <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
          <PrimaryButton
            title="Switch to customer mode"
            variant="secondary"
            onPress={switchToCustomer}
          />
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function MechanicJobRow({ job }: { job: MechanicJob }) {
  const service = getServiceType(job.service);
  const time = new Date(job.receivedAt).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <View style={styles.jobRow}>
      <View style={styles.jobIcon}>
        <IconSymbol name={service?.icon ?? "wrench.fill"} size={18} color="#F97316" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.jobTitle}>
          {service?.name ?? "Service"} • {job.customerName}
        </Text>
        <Text style={styles.jobMeta}>
          {time} • {statusLabel(job.status)}
        </Text>
      </View>
      <Text style={styles.jobPay}>${job.payout.toFixed(2)}</Text>
    </View>
  );
}

function statusLabel(s: string): string {
  return s.replace(/_/g, " ");
}

const styles = StyleSheet.create({
  headerPad: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  greeting: { color: "#64748B", fontSize: 14, fontWeight: "500" },
  userName: { color: "#0F172A", fontSize: 28, fontWeight: "800", marginTop: 2 },
  onlineCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
  },
  onlineCardActive: { backgroundColor: "#FFF7ED", borderColor: "#FED7AA" },
  onlineCardIdle: { backgroundColor: "#F5F7FA", borderColor: "#E2E8F0" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1, color: "#475569" },
  onlineHeadline: { fontSize: 18, fontWeight: "800", color: "#0F172A", marginTop: 6 },
  onlineSub: { fontSize: 12, color: "#64748B", marginTop: 4, lineHeight: 17 },
  activeBanner: {
    backgroundColor: "#10B981",
    borderRadius: 16,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  activeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  activeTitle: { color: "#FFFFFF", fontWeight: "800", fontSize: 14 },
  activeSub: { color: "#D1FAE5", fontSize: 12, marginTop: 2 },
  section: { paddingHorizontal: 20, marginTop: 22 },
  sectionTitle: { fontSize: 13, color: "#64748B", fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0F172A",
    paddingVertical: 16,
    borderRadius: 16,
  },
  statBox: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 18, fontWeight: "800", color: "#FFFFFF" },
  statLabel: { fontSize: 11, color: "#94A3B8", marginTop: 4, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  statDivider: { width: 1, height: 30, backgroundColor: "#1F2937" },
  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 18,
    alignItems: "center",
    gap: 6,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#FFEDD5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: "#0F172A" },
  emptyText: { fontSize: 13, color: "#64748B", textAlign: "center", lineHeight: 18 },
  jobRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 8,
  },
  jobIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FFEDD5",
    alignItems: "center",
    justifyContent: "center",
  },
  jobTitle: { fontSize: 14, fontWeight: "700", color: "#0F172A" },
  jobMeta: { fontSize: 12, color: "#64748B", marginTop: 2, textTransform: "capitalize" },
  jobPay: { fontSize: 15, fontWeight: "800", color: "#0F172A" },
});
