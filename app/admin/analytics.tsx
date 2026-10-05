import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View, type DimensionValue } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { getApiBaseUrl } from "@/constants/oauth";
import { useAuth } from "@/lib/auth-context";
import { resolveAuthSession } from "@/lib/resolve-auth-session";
import {
  formatAnalyticsNumber,
  formatAnalyticsPercent,
  labelForRegionFilter,
  normalizeAnalyticsRegionFilter,
  type AnalyticsDashboardResponse,
  type AnalyticsRegionFilter,
  type AnalyticsSeriesPoint,
} from "@/lib/analytics-core";

type AnalyticsDashboardResponseBody = {
  data?: AnalyticsDashboardResponse;
  error?: string;
};

const REGION_OPTIONS: { label: string; value: AnalyticsRegionFilter }[] = [
  { label: "All", value: "all" },
  { label: "El Paso", value: "el_paso" },
  { label: "Juarez", value: "juarez" },
];

const METRIC_COLORS = {
  orange: "#FB923C",
  teal: "#14B8A6",
  green: "#22C55E",
  blue: "#60A5FA",
  violet: "#A78BFA",
  rose: "#FB7185",
} as const;

export default function AnalyticsDashboardScreen() {
  const { user } = useAuth();
  const [regionFilter, setRegionFilter] = useState<AnalyticsRegionFilter>("all");
  const [dashboard, setDashboard] = useState<AnalyticsDashboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const loadDashboard = useCallback(
    async (nextRegion: AnalyticsRegionFilter = regionFilter) => {
      const baseUrl = getApiBaseUrl();
      if (!baseUrl) {
        Alert.alert("API unavailable", "Set EXPO_PUBLIC_API_BASE_URL before loading analytics.");
        return;
      }
      if (!user?.id) {
        Alert.alert("Sign in required", "Sign in with an admin account to view analytics.");
        return;
      }

      setLoading(true);
      setLastError(null);
      try {
        const resolved = await resolveAuthSession(user);
        if (!resolved) {
          throw new Error("Could not resolve the current admin session.");
        }
        const res = await fetch(
          `${baseUrl}/api/admin/analytics?region=${encodeURIComponent(nextRegion)}`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${resolved.sessionToken}`,
            },
          },
        );
        const data = (await res.json().catch(() => ({}))) as AnalyticsDashboardResponseBody;
        if (!res.ok) {
          throw new Error(data.error || "Analytics request failed");
        }
        if (!data.data) {
          throw new Error("Analytics dashboard returned no data");
        }
        setDashboard(data.data);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Please try again.";
        setLastError(message);
        Alert.alert("Could not load analytics", message);
      } finally {
        setLoading(false);
      }
    },
    [regionFilter, user],
  );

  useEffect(() => {
    if (!user?.id || !dashboard) return;
    void loadDashboard(regionFilter);
  }, [regionFilter, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- filter changes should refresh current dashboard

  const summary = dashboard?.summary;
  const series7 = dashboard?.series7 ?? [];
  const series30 = dashboard?.series30 ?? [];

  const updatedLabel = useMemo(() => {
    if (!dashboard?.updatedAt) return null;
    return new Date(dashboard.updatedAt).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }, [dashboard?.updatedAt]);

  const refreshButton = (
    <Pressable
      onPress={() => void loadDashboard(regionFilter)}
      disabled={loading || !user?.id}
      style={({ pressed }) => [
        styles.headerButton,
        (pressed || loading || !user?.id) && { opacity: 0.85 },
      ]}
    >
      <IconSymbol name="arrow.clockwise" size={18} color="#FFFFFF" />
    </Pressable>
  );

  return (
    <ScreenContainer
      showBackButton
      title="Launch analytics"
      headerRight={refreshButton}
      containerClassName="bg-background"
    >
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.tokenCard}>
          <Text style={styles.label}>Admin access</Text>
          <Text style={styles.helper}>
            Signed in as {user?.email || "not signed in"}. This page only loads for admin users.
          </Text>
          <Pressable
            onPress={() => void loadDashboard(regionFilter)}
            disabled={loading || !user?.id}
            style={({ pressed }) => [
              styles.primaryBtn,
              (pressed || loading || !user?.id) && { opacity: 0.85 },
            ]}
          >
            <Text style={styles.primaryBtnText}>{loading ? "Loading..." : "Load dashboard"}</Text>
          </Pressable>
          <Text style={styles.helper}>
            The dashboard reads from `analytics_events` through the admin API.
          </Text>
        </View>

        <View style={styles.filterRow}>
          {REGION_OPTIONS.map((option) => {
            const active = regionFilter === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => setRegionFilter(option.value)}
                style={({ pressed }) => [
                  styles.filterChip,
                  active && styles.filterChipActive,
                  pressed && { opacity: 0.9 },
                ]}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {lastError ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Load error</Text>
            <Text style={styles.errorText}>{lastError}</Text>
          </View>
        ) : null}

        {summary ? (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{labelForRegionFilter(normalizeAnalyticsRegionFilter(regionFilter))} overview</Text>
              <Text style={styles.sectionMeta}>{updatedLabel ? `Updated ${updatedLabel}` : "Not updated yet"}</Text>
            </View>

            <View style={styles.metricsGrid}>
              <MetricCard label="Requests today" value={summary.requestsToday.toString()} color={METRIC_COLORS.orange} />
              <MetricCard label="Matches today" value={summary.matchesToday.toString()} color={METRIC_COLORS.teal} />
              <MetricCard label="Completed jobs today" value={summary.completedJobsToday.toString()} color={METRIC_COLORS.green} />
              <MetricCard label="Match rate" value={formatAnalyticsPercent(summary.matchRate)} color={METRIC_COLORS.blue} />
              <MetricCard label="Completion rate" value={formatAnalyticsPercent(summary.completionRate)} color={METRIC_COLORS.violet} />
              <MetricCard
                label="Average ETA"
                value={summary.averageEtaMinutes !== null ? `${formatAnalyticsNumber(summary.averageEtaMinutes)} min` : "—"}
                color={METRIC_COLORS.orange}
              />
              <MetricCard
                label="Average response time"
                value={summary.averageResponseTimeMinutes !== null ? `${formatAnalyticsNumber(summary.averageResponseTimeMinutes)} min` : "—"}
                color={METRIC_COLORS.teal}
              />
              <MetricCard label="Revenue" value={`$${summary.revenue.toFixed(2)}`} color={METRIC_COLORS.green} />
              <MetricCard label="Active mechanics" value={summary.activeMechanics.toString()} color={METRIC_COLORS.blue} />
              <MetricCard label="Active customers" value={summary.activeCustomers.toString()} color={METRIC_COLORS.rose} />
            </View>

            <View style={styles.chartCard}>
              <View style={styles.chartHeader}>
                <View>
                  <Text style={styles.chartTitle}>Last 7 days</Text>
                  <Text style={styles.chartSubtitle}>Requests, matches, and completed jobs</Text>
                </View>
              </View>
              <GroupedBarChart data={series7} />
            </View>

            <View style={styles.chartCard}>
              <View style={styles.chartHeader}>
                <View>
                  <Text style={styles.chartTitle}>Last 30 days</Text>
                  <Text style={styles.chartSubtitle}>Revenue trend</Text>
                </View>
              </View>
              <RevenueChart data={series30} />
            </View>
          </>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Load launch analytics</Text>
            <Text style={styles.emptyText}>
              Choose a region and load the dashboard to review launch readiness.
            </Text>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

function MetricCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function GroupedBarChart({ data }: { data: AnalyticsSeriesPoint[] }) {
  const max = Math.max(
    1,
    ...data.flatMap((point) => [point.requests, point.matches, point.completed]),
  );
  const series = [
    { key: "requests" as const, label: "Requests", color: METRIC_COLORS.orange },
    { key: "matches" as const, label: "Matches", color: METRIC_COLORS.teal },
    { key: "completed" as const, label: "Completed", color: METRIC_COLORS.green },
  ];

  return (
    <View>
      <View style={styles.legendRow}>
        {series.map((item) => (
          <View key={item.key} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: item.color }]} />
            <Text style={styles.legendText}>{item.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.chartPlot}>
        {data.map((point) => (
          <View key={point.date} style={styles.chartColumn}>
            <View style={styles.groupBars}>
              {series.map((item) => {
                const value = point[item.key];
                const height = `${Math.max(4, (value / max) * 100)}%` as DimensionValue;
                return (
                  <View key={item.key} style={styles.barTrack}>
                    <View style={[styles.barFill, { height, backgroundColor: item.color }]} />
                  </View>
                );
              })}
            </View>
            <Text style={styles.chartLabel} numberOfLines={1}>
              {point.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function RevenueChart({ data }: { data: AnalyticsSeriesPoint[] }) {
  const max = Math.max(1, ...data.map((point) => point.revenue));

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={[styles.revenueChart, { width: Math.max(560, data.length * 26) }]}>
        {data.map((point, index) => {
          const height = `${Math.max(4, (point.revenue / max) * 100)}%` as DimensionValue;
          const showLabel = index % 4 === 0 || index === data.length - 1;
          return (
            <View key={point.date} style={styles.revenueColumn}>
              <View style={styles.revenueTrack}>
                <View style={[styles.revenueFill, { height, backgroundColor: METRIC_COLORS.blue }]} />
              </View>
              <Text style={styles.revenueLabel} numberOfLines={1}>
                {showLabel ? point.label : " "}
              </Text>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 20,
    paddingBottom: 40,
    gap: 16,
  },
  tokenCard: {
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#243044",
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  label: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0,
  },
  input: {
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: "#F8FAFC",
    backgroundColor: "#0F172A",
  },
  tokenActions: {
    flexDirection: "row",
    gap: 10,
  },
  primaryBtn: {
    backgroundColor: "#F97316",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontWeight: "900",
  },
  helper: {
    color: "#94A3B8",
    fontSize: 12,
    lineHeight: 17,
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  filterRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#111827",
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  filterChipActive: {
    backgroundColor: "#F97316",
    borderColor: "#F97316",
  },
  filterChipText: {
    color: "#CBD5E1",
    fontSize: 13,
    fontWeight: "800",
  },
  filterChipTextActive: {
    color: "#FFFFFF",
  },
  errorCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#7F1D1D",
    backgroundColor: "#450A0A",
    padding: 14,
    gap: 4,
  },
  errorTitle: {
    color: "#FCA5A5",
    fontSize: 14,
    fontWeight: "900",
  },
  errorText: {
    color: "#FEE2E2",
    fontSize: 12,
    lineHeight: 17,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 10,
  },
  sectionTitle: {
    color: "#F8FAFC",
    fontSize: 18,
    fontWeight: "900",
  },
  sectionMeta: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "700",
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  metricCard: {
    flexBasis: "48%",
    flexGrow: 1,
    minHeight: 90,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#243044",
    backgroundColor: "#111827",
    padding: 12,
    gap: 8,
  },
  metricLabel: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 15,
  },
  metricValue: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 0,
  },
  chartCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#243044",
    backgroundColor: "#111827",
    padding: 14,
    gap: 12,
  },
  chartHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  chartTitle: {
    color: "#F8FAFC",
    fontSize: 16,
    fontWeight: "900",
  },
  chartSubtitle: {
    color: "#94A3B8",
    fontSize: 12,
    marginTop: 3,
  },
  legendRow: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 12,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 999,
  },
  legendText: {
    color: "#CBD5E1",
    fontSize: 12,
    fontWeight: "700",
  },
  chartPlot: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 8,
    minHeight: 180,
  },
  chartColumn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
  },
  groupBars: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 4,
    height: 132,
    width: "100%",
  },
  barTrack: {
    flex: 1,
    height: 132,
    maxWidth: 12,
    borderRadius: 999,
    backgroundColor: "#1F2937",
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  barFill: {
    width: "100%",
    borderRadius: 999,
  },
  chartLabel: {
    color: "#94A3B8",
    fontSize: 10,
    fontWeight: "700",
  },
  revenueChart: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
    minHeight: 180,
    paddingRight: 6,
  },
  revenueColumn: {
    width: 20,
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
  },
  revenueTrack: {
    width: 14,
    height: 132,
    borderRadius: 999,
    backgroundColor: "#1F2937",
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  revenueFill: {
    width: "100%",
    borderRadius: 999,
  },
  revenueLabel: {
    color: "#94A3B8",
    fontSize: 9,
    fontWeight: "700",
    minHeight: 12,
  },
  emptyCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#243044",
    backgroundColor: "#111827",
    padding: 16,
    gap: 8,
  },
  emptyTitle: {
    color: "#F8FAFC",
    fontSize: 16,
    fontWeight: "900",
  },
  emptyText: {
    color: "#94A3B8",
    fontSize: 13,
    lineHeight: 19,
  },
});
