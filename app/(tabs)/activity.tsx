import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useAppDrawer } from "@/lib/app-drawer-context";
import { useT } from "@/hooks/use-locale";
import { useStore } from "@/lib/store";
import { getMechanic, getServiceType } from "@/lib/seed";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Avatar } from "@/components/avatar";
import { haptic } from "@/lib/haptics";
import type { Job, JobStatus } from "@/lib/types";

type Filter = "all" | "active" | "completed" | "cancelled";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
];

function isActive(status: JobStatus): boolean {
  return ["searching", "accepted", "enroute", "arrived", "in_progress"].includes(status);
}

export default function ActivityScreen() {
  const router = useRouter();
  const { state } = useStore();
  const t = useT();
  const { openDrawer } = useAppDrawer();
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    const list = [...state.jobs].sort((a, b) => b.createdAt - a.createdAt);
    if (filter === "all") return list;
    if (filter === "active") return list.filter((j) => isActive(j.status));
    if (filter === "completed") return list.filter((j) => j.status === "completed");
    if (filter === "cancelled") return list.filter((j) => j.status === "cancelled");
    return list;
  }, [state.jobs, filter]);

  const handlePress = (job: Job) => {
    haptic.light();
    if (isActive(job.status)) {
      router.push("/tracking" as any);
    } else {
      router.push({ pathname: "/job/[id]" as any, params: { id: job.id } } as any);
    }
  };

  return (
    <ScreenContainer edges={["left", "right", "bottom"]}>
      {/* Orange Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => { haptic.light(); openDrawer(); }}
          style={({ pressed }) => [styles.menuButton, pressed && { opacity: 0.7 }]}
          hitSlop={8}
        >
          <IconSymbol name="line.3.horizontal" size={22} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.headerTitle}>{t("tabs.activity")}</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.subheader}>
        <Text style={styles.subtitle}>Your service history</Text>
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <Pressable
            key={f.key}
            onPress={() => {
              haptic.selection();
              setFilter(f.key);
            }}
            style={({ pressed }) => [
              styles.filterChip,
              filter === f.key && styles.filterChipActive,
              pressed && { opacity: 0.8 },
            ]}
          >
            <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {filtered.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <IconSymbol name="doc.text.fill" size={36} color="#F97316" />
          </View>
          <Text style={styles.emptyTitle}>No jobs yet</Text>
          <Text style={styles.emptyText}>
            Once you book a mechanic, your service history will show up here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32, gap: 10 }}
          renderItem={({ item }) => <JobRow job={item} onPress={() => handlePress(item)} />}
        />
      )}
    </ScreenContainer>
  );
}

function JobRow({ job, onPress }: { job: Job; onPress: () => void }) {
  const mechanic = getMechanic(job.mechanicId);
  const service = getServiceType(job.service);
  if (!mechanic || !service) return null;
  const active = isActive(job.status);
  const date = new Date(job.createdAt);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
    >
      <Avatar name={mechanic.name} url={mechanic.photoUrl} size={48} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={styles.rowTitle}>{service.name}</Text>
          <StatusChip status={job.status} />
        </View>
        <Text style={styles.rowSub}>
          {mechanic.name} • {date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={styles.rowAmount}>
          ${(job.fare.total + (job.tip ?? 0)).toFixed(2)}
        </Text>
        <IconSymbol name="chevron.right" size={16} color="#94A3B8" />
      </View>
    </Pressable>
  );
}

function StatusChip({ status }: { status: JobStatus }) {
  const map: Record<JobStatus, { bg: string; color: string; label: string }> = {
    searching: { bg: "#FEF3C7", color: "#92400E", label: "Searching" },
    accepted: { bg: "#DBEAFE", color: "#1E40AF", label: "Accepted" },
    enroute: { bg: "#DBEAFE", color: "#1E40AF", label: "En route" },
    arrived: { bg: "#DCFCE7", color: "#166534", label: "Arrived" },
    in_progress: { bg: "#FFEDD5", color: "#9A3412", label: "In progress" },
    completed: { bg: "#DCFCE7", color: "#166534", label: "Completed" },
    cancelled: { bg: "#FEE2E2", color: "#991B1B", label: "Cancelled" },
  };
  const s = map[status];
  return (
    <View style={{ backgroundColor: s.bg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 }}>
      <Text style={{ color: s.color, fontSize: 10, fontWeight: "700" }}>{s.label.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: "#F97316",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  menuButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  subheader: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  subtitle: { fontSize: 14, color: "#64748B" },
  filterRow: { flexDirection: "row", gap: 8, paddingHorizontal: 20, paddingBottom: 16 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#F5F7FA",
  },
  filterChipActive: {
    backgroundColor: "#0F172A",
  },
  filterText: { fontSize: 13, fontWeight: "600", color: "#475569" },
  filterTextActive: { color: "#FFFFFF" },
  row: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rowTitle: { fontSize: 15, fontWeight: "700", color: "#0F172A" },
  rowSub: { fontSize: 12, color: "#64748B" },
  rowAmount: { fontSize: 15, fontWeight: "800", color: "#0F172A" },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#FFEDD5",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  emptyText: { fontSize: 14, color: "#64748B", textAlign: "center", lineHeight: 20 },
});
