import React, { useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View, ScrollView, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenContainer } from "@/components/screen-container";
import { useAppDrawer } from "@/lib/app-drawer-context";
import { useL, useT, useLocaleContext } from "@/hooks/use-locale";
import { useStore } from "@/lib/store";
import { getMechanic, getServiceType } from "@/lib/seed";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Avatar } from "@/components/avatar";
import { haptic } from "@/lib/haptics";

import type { Job, JobStatus, MechanicJob, MechanicJobStatus } from "@/lib/types";

type Filter = "all" | "active" | "completed" | "cancelled";
type ActivityItem =
  | { kind: "customer"; id: string; createdAt: number; status: JobStatus; data: Job }
  | { kind: "mechanic"; id: string; createdAt: number; status: MechanicJobStatus; data: MechanicJob };

function isActive(status: JobStatus | MechanicJobStatus): boolean {
  return ["searching", "accepted", "enroute", "arrived", "in_progress", "upcoming"].includes(status);
}

function isCompleted(status: JobStatus | MechanicJobStatus): boolean {
  return status === "completed";
}

function isCancelled(status: JobStatus | MechanicJobStatus): boolean {
  return status === "cancelled";
}

function firstName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "N/A";
  return trimmed.split(/\s+/)[0] ?? "N/A";
}

function stripStreetNumber(location: string): string {
  const cleaned = location.trim();
  if (!cleaned) return "N/A";
  const parts = cleaned.split(",").map((p) => p.trim()).filter(Boolean);
  const streetRaw = parts[0] ?? "";
  const street = streetRaw.replace(/^\d+[A-Za-z\-]*\s+/, "");
  const city = parts[1] ?? "";
  const state = parts[2] ?? "";
  return [street || streetRaw, city, state].filter(Boolean).join(", ") || cleaned;
}

function formatTime(ts?: number): string {
  if (!ts) return "N/A";
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function makeReceiptNumber(id: string, createdAt: number): string {
  const compact = id.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return `WU-${new Date(createdAt).toISOString().slice(2, 10).replace(/-/g, "")}-${compact.slice(-6)}`;
}

function maskPlateFirst3(plate?: string): string {
  if (!plate) return "N/A";
  const clean = plate.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (!clean) return "N/A";
  return `${clean.slice(0, 3)}***`;
}

function plateFromVehicleLabel(vehicleLabel?: string): string | undefined {
  if (!vehicleLabel) return undefined;
  const match = vehicleLabel.match(/([A-Za-z0-9]{3,8})$/);
  return match?.[1];
}

// Date grouping helpers for collapsible day sections
function getDateKey(ts: number): string {
  return new Date(ts).toISOString().split("T")[0]; // YYYY-MM-DD
}

function getFriendlyDateLabel(dateKey: string, L: (en: string, es: string) => string, locale: string): string {
  const date = new Date(dateKey + "T00:00:00");
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return L("Today", "Hoy");
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return L("Yesterday", "Ayer");
  }
  return date.toLocaleDateString(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
  } as any);
}

function groupItemsByDay(
  items: ActivityItem[],
  L: (en: string, es: string) => string,
  locale: string,
) {
  const groups: Record<string, ActivityItem[]> = {};
  items.forEach((item) => {
    const key = getDateKey(item.createdAt);
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  });

  return Object.keys(groups)
    .sort((a, b) => b.localeCompare(a))
    .map((dateKey) => ({
      dateKey,
      label: getFriendlyDateLabel(dateKey, L, locale),
      data: groups[dateKey],
    }));
}

export default function ActivityScreen() {
  const { state } = useStore();
  const t = useT();
  const { locale } = useLocaleContext();
  const L = useL();
  const FILTERS: { key: Filter; label: string }[] = [
    { key: "all", label: L("All", "Todos") },
    { key: "active", label: L("Active", "Activos") },
    { key: "completed", label: L("Completed", "Completados") },
    { key: "cancelled", label: L("Cancelled", "Cancelados") },
  ];
  const { openDrawer } = useAppDrawer();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ActivityItem | null>(null);

  // Track which date groups are expanded (dropdown behavior)
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    const source: ActivityItem[] = [
      ...state.jobs.map((j) => ({
        kind: "customer" as const,
        id: j.id,
        createdAt: j.createdAt,
        status: j.status,
        data: j,
      })),
      ...state.mechanicJobs.map((j) => ({
        kind: "mechanic" as const,
        id: j.id,
        createdAt: j.receivedAt,
        status: j.status,
        data: j,
      })),
    ];

    let list = [...source].sort((a, b) => {
      const aActive = isActive(a.status) ? 1 : 0;
      const bActive = isActive(b.status) ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;
      return b.createdAt - a.createdAt;
    });
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter((item) => {
        const cust = (item.data as any).customerName?.toLowerCase() || "";
        const mech = (item.data as any).mechanicName?.toLowerCase() || "";
        const loc = (item.data as any).location?.toLowerCase() || "";
        return cust.includes(q) || mech.includes(q) || loc.includes(q);
      });
    }
    if (filter === "all") return list;
    if (filter === "active") return list.filter((j) => isActive(j.status));
    if (filter === "completed") return list.filter((j) => isCompleted(j.status));
    if (filter === "cancelled") return list.filter((j) => isCancelled(j.status));
    return list;
  }, [state.jobs, state.mechanicJobs, filter, search]);

  const customerGroups = useMemo(
    () => groupItemsByDay(filtered.filter((item) => item.kind === "customer"), L, locale),
    [filtered, L, locale],
  );
  const mechanicGroups = useMemo(
    () => groupItemsByDay(filtered.filter((item) => item.kind === "mechanic"), L, locale),
    [filtered, L, locale],
  );

  const toggleDay = (dateKey: string) => {
    haptic.selection();
    setExpandedDays((prev) => ({
      ...prev,
      [dateKey]: !prev[dateKey],
    }));
  };

  const handlePress = (item: ActivityItem) => {
    haptic.light();
    setSelected(item);
  };

  return (
    <ScreenContainer edges={["left", "right"]}>
      {/* Teal Header - respects safe area on iOS */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
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

      <View style={styles.pageShell}>
        <View style={styles.pageTop}>
          <View style={styles.subheader}>
            <Text style={styles.subtitle}>{L("Your service history", "Tu historial de servicios")}</Text>
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

          {/* Search polish for activity */}
          <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={L("Search jobs by name or location...", "Buscar por nombre o ubicación...")}
              placeholderTextColor="#64748B"
              style={{
                backgroundColor: "#1F2937",
                color: "#F8FAFC",
                borderRadius: 10,
                padding: 10,
                fontSize: 14,
                borderWidth: 1,
                borderColor: "#374151",
              }}
            />
          </View>
        </View>

        <View style={styles.pageBody}>
          {filtered.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <IconSymbol name="doc.text.fill" size={36} color="#FB923C" />
              </View>
              <Text style={styles.emptyTitle}>{L("No jobs yet", "Aún no hay servicios")}</Text>
              <Text style={styles.emptyText}>
                {L("Once you book a mechanic, your service history will show up here.", "Cuando reserves un mecánico, tu historial aparecerá aquí.")}
              </Text>
            </View>
          ) : (
            <ScrollView
              style={styles.listScroll}
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.sectionBlock}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>{L("Customer activity", "Actividad del cliente")}</Text>
                  <Text style={styles.sectionCount}>{customerGroups.length}</Text>
                </View>
                {customerGroups.length === 0 ? (
                  <Text style={styles.sectionEmptyText}>{L("No customer history yet.", "Aún no hay historial de cliente.")}</Text>
                ) : (
                  customerGroups.map((group) => {
                    const key = `customer:${group.dateKey}`;
                    const isExpanded = expandedDays[key] ?? false;
                    return (
                      <View key={key} style={styles.daySection}>
                        <Pressable
                          onPress={() => toggleDay(key)}
                          style={({ pressed }) => [styles.dayHeader, pressed && { opacity: 0.7 }]}
                        >
                          <View style={styles.dayHeaderLeft}>
                            <Text style={styles.dayLabel}>{group.label}</Text>
                            <Text style={styles.dayCount}>
                              {group.data.length} {group.data.length === 1 ? L("service", "servicio") : L("services", "servicios")}
                            </Text>
                          </View>
                          <IconSymbol name={isExpanded ? "chevron.up" : "chevron.down"} size={18} color="#94A3B8" />
                        </Pressable>
                        {isExpanded ? (
                          <View style={styles.dayContent}>
                            {group.data.map((item) => (
                              <JobRow key={`${item.kind}-${item.id}`} item={item} onPress={() => handlePress(item)} />
                            ))}
                          </View>
                        ) : null}
                      </View>
                    );
                  })
                )}
              </View>

              <View style={styles.sectionBlock}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>{L("Mechanic activity", "Actividad del mecánico")}</Text>
                  <Text style={styles.sectionCount}>{mechanicGroups.length}</Text>
                </View>
                {mechanicGroups.length === 0 ? (
                  <Text style={styles.sectionEmptyText}>{L("No mechanic history yet.", "Aún no hay historial de mecánico.")}</Text>
                ) : (
                  mechanicGroups.map((group) => {
                    const key = `mechanic:${group.dateKey}`;
                    const isExpanded = expandedDays[key] ?? false;
                    return (
                      <View key={key} style={styles.daySection}>
                        <Pressable
                          onPress={() => toggleDay(key)}
                          style={({ pressed }) => [styles.dayHeader, pressed && { opacity: 0.7 }]}
                        >
                          <View style={styles.dayHeaderLeft}>
                            <Text style={styles.dayLabel}>{group.label}</Text>
                            <Text style={styles.dayCount}>
                              {group.data.length} {group.data.length === 1 ? L("service", "servicio") : L("services", "servicios")}
                            </Text>
                          </View>
                          <IconSymbol name={isExpanded ? "chevron.up" : "chevron.down"} size={18} color="#94A3B8" />
                        </Pressable>
                        {isExpanded ? (
                          <View style={styles.dayContent}>
                            {group.data.map((item) => (
                              <JobRow key={`${item.kind}-${item.id}`} item={item} onPress={() => handlePress(item)} />
                            ))}
                          </View>
                        ) : null}
                      </View>
                    );
                  })
                )}
              </View>
            </ScrollView>
          )}
        </View>
      </View>
      <ActivityDetailsModal
        item={selected}
        onClose={() => {
          haptic.selection();
          setSelected(null);
        }}
        vehicles={state.vehicles}
      />
    </ScreenContainer>
  );
}

const JobRow = React.memo(function JobRow({ item, onPress }: { item: ActivityItem; onPress: () => void }) {
  const L = useL();
  const { formatPrice } = useLocaleContext();
  const service = getServiceType(item.data.service);
  if (!service) return null;

  const name =
    item.kind === "mechanic"
      ? item.data.customerName
      : getMechanic(item.data.mechanicId)?.name || item.data.mechanicName || L("Assigned Mechanic", "Mecánico asignado");
  const photoUrl =
    item.kind === "mechanic"
      ? undefined
      : getMechanic(item.data.mechanicId)?.photoUrl || item.data.mechanicPhotoUrl || undefined;
  const date = new Date(item.createdAt);
  const amount = item.kind === "mechanic" ? item.data.payout : item.data.fare.total + (item.data.tip ?? 0);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
    >
      <Avatar name={name} url={photoUrl} size={48} />
      <View style={styles.rowContent}>
        <View style={styles.rowTopLine}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {service.name}
          </Text>
          <View style={styles.rowAmountWrap}>
            <Text style={styles.rowAmount}>
              {formatPrice(amount)}
            </Text>
          </View>
        </View>
        <View style={styles.rowMetaLine}>
          <Text style={styles.rowSub} numberOfLines={1}>
            {firstName(name)} • {date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </Text>
          <View style={styles.rowTags}>
            <StatusChip status={item.status} />
            <View style={styles.kindChip}>
              <Text style={styles.kindChipText}>
                {item.kind === "mechanic" ? L("Mechanic", "Mecánico") : L("Customer", "Cliente")}
              </Text>
            </View>
          </View>
        </View>
      </View>
      <View style={styles.rowChevron}>
        <IconSymbol name="chevron.right" size={16} color="#94A3B8" />
      </View>
    </Pressable>
  );
});

const StatusChip = React.memo(function StatusChip({ status }: { status: JobStatus | MechanicJobStatus }) {
  const L = useL();
  const map: Record<JobStatus | MechanicJobStatus, { bg: string; color: string; label: string }> = {
    searching: { bg: "#FEF3C7", color: "#92400E", label: L("Searching", "Buscando") },
    accepted: { bg: "#DBEAFE", color: "#1E40AF", label: L("Accepted", "Aceptado") },
    enroute: { bg: "#DBEAFE", color: "#1E40AF", label: L("En route", "En camino") },
    arrived: { bg: "#DCFCE7", color: "#166534", label: L("Arrived", "Llegó") },
    in_progress: { bg: "#FFEDD5", color: "#9A3412", label: L("In progress", "En progreso") },
    completed: { bg: "#DCFCE7", color: "#166534", label: L("Completed", "Completado") },
    cancelled: { bg: "#FEE2E2", color: "#991B1B", label: L("Cancelled", "Cancelado") },
    pending: { bg: "#FFEDD5", color: "#9A3412", label: L("Pending", "Pendiente") },
    upcoming: { bg: "#FFEDD5", color: "#9A3412", label: L("Upcoming", "Próximo") },
    heading_there: { bg: "#DBEAFE", color: "#1E40AF", label: L("Heading there", "En camino") },
    declined: { bg: "#FEE2E2", color: "#991B1B", label: L("Declined", "Rechazado") },
  };
  const s = map[status];
  return (
    <View style={{ backgroundColor: s.bg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 }}>
      <Text style={{ color: s.color, fontSize: 10, fontWeight: "700" }}>{s.label.toUpperCase()}</Text>
    </View>
  );
});

function ActivityDetailsModal({
  item,
  onClose,
  vehicles,
}: {
  item: ActivityItem | null;
  onClose: () => void;
  vehicles: { id: string; year: number; make: string; model: string; plate: string }[];
}) {
  const L = useL();
  const { formatPrice } = useLocaleContext();

  if (!item) return null;

  const service = getServiceType(item.data.service);
  const amount = item.kind === "mechanic" ? item.data.payout : item.data.fare.total + (item.data.tip ?? 0);
  const arrivalTs = item.kind === "mechanic" ? (item.data.acceptedAt ?? item.data.receivedAt) : (item.data.acceptedAt ?? item.data.createdAt);
  const leftTs = item.kind === "mechanic" ? item.data.completedAt : item.data.completedAt;
  const location = stripStreetNumber(item.data.location);
  const receipt = makeReceiptNumber(item.id, item.createdAt);

  const workedByName =
    item.kind === "customer"
      ? firstName(getMechanic((item.data as Job).mechanicId)?.name || item.data.mechanicName || "Mechanic")
      : firstName(item.data.customerName || "Customer");

  const counterpartLabel =
    item.kind === "customer"
      ? L("Mechanic", "Mecánico")
      : L("Customer", "Cliente");

  const vehicleLabel =
    item.kind === "mechanic"
      ? item.data.vehicle
      : (() => {
          const vehicle = vehicles.find((v) => v.id === item.data.vehicleId);
          return vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : "N/A";
        })();
  const rawPlate =
    item.kind === "mechanic"
      ? plateFromVehicleLabel(item.data.vehicle)
      : vehicles.find((v) => v.id === item.data.vehicleId)?.plate;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{service?.name ?? L("Service details", "Detalles del servicio")}</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <IconSymbol name="xmark" size={18} color="#E2E8F0" />
            </Pressable>
          </View>
          <DetailRow label={counterpartLabel} value={workedByName} />
          <DetailRow label={L("Amount paid", "Monto pagado")} value={formatPrice(amount)} />
          <DetailRow label={L("Time arrived", "Hora de llegada")} value={formatTime(arrivalTs)} />
          <DetailRow label={L("Time left", "Hora de salida")} value={formatTime(leftTs)} />
          <DetailRow label={L("Service address", "Dirección del servicio")} value={location} />
          <DetailRow label={L("Receipt #", "Recibo #")} value={receipt} />
          <DetailRow label={L("Vehicle worked on", "Vehículo atendido")} value={vehicleLabel} />
          <DetailRow label={L("Plate", "Placa")} value={maskPlateFirst3(rawPlate)} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pageShell: {
    flex: 1,
  },
  pageTop: {
    flexShrink: 0,
  },
  pageBody: {
    flex: 1,
  },
  listScroll: {
    flex: 1,
  },
  header: {
    backgroundColor: "#F97316", // Orange to match unified headers
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
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
  subtitle: { fontSize: 14, color: "#FFEDD5" }, // light teal tint for new header color
  filterRow: { flexDirection: "row", gap: 8, paddingHorizontal: 20, paddingBottom: 16 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#1A1A2E",
  },
  filterChipActive: {
    backgroundColor: "#0F172A",
  },
  filterText: { fontSize: 13, fontWeight: "600", color: "#E5E7EB" },
  filterTextActive: { color: "#FFFFFF" },
  row: {
    backgroundColor: "#1A1A2E",
    borderWidth: 1,
    borderColor: "#2A2A40",
    borderRadius: 14,
    padding: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  rowContent: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  rowTopLine: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  rowTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    fontWeight: "700",
    color: "#F8FAFC",
  },
  rowAmountWrap: {
    alignItems: "flex-end",
    minWidth: 84,
  },
  rowAmount: {
    fontSize: 15,
    fontWeight: "900",
    color: "#FF9A57",
    textAlign: "right",
  },
  rowMetaLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    minWidth: 0,
  },
  rowSub: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    color: "#C2410C",
  },
  rowTags: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  kindChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  kindChipText: {
    color: "#94A3B8",
    fontSize: 10,
    fontWeight: "700",
  },
  rowChevron: {
    paddingTop: 4,
    alignItems: "flex-end",
  },
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
  emptyTitle: { fontSize: 18, fontWeight: "800", color: "#F8FAFC" },
  emptyText: { fontSize: 14, color: "#C2410C", textAlign: "center", lineHeight: 20 },
  sectionBlock: {
    marginBottom: 18,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    color: "#FFEDD5",
    fontSize: 15,
    fontWeight: "900",
  },
  sectionCount: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "700",
  },
  sectionEmptyText: {
    color: "#94A3B8",
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 23, 0.65)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#2A2A40",
    backgroundColor: "#121212",
    padding: 14,
    gap: 10,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  modalTitle: {
    color: "#F8FAFC",
    fontWeight: "800",
    fontSize: 16,
  },
  detailRow: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2A2A40",
    backgroundColor: "#1A1A2E",
    padding: 10,
    gap: 4,
  },
  detailLabel: { color: "#F97316", fontSize: 12, fontWeight: "700" },
  detailValue: { color: "#E2E8F0", fontSize: 14, fontWeight: "600" },

  // === Date-based dropdown / collapsible sections ===
  daySection: {
    marginBottom: 12,
    backgroundColor: "#1A1A2E",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#2A2A40",
    overflow: "hidden",
  },
  dayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#111827",
  },
  dayHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dayLabel: {
    fontSize: 15,
    fontWeight: "800",
    color: "#F8FAFC",
  },
  dayCount: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "600",
  },
  dayContent: {
    padding: 8,
    gap: 8,
  },
});
