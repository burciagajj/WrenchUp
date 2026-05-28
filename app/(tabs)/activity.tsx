import { FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useMemo, useState } from "react";
import { ScreenContainer } from "@/components/screen-container";
import { useAppDrawer } from "@/lib/app-drawer-context";
import { useT } from "@/hooks/use-locale";
import { useStore } from "@/lib/store";
import { getMechanic, getServiceType } from "@/lib/seed";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Avatar } from "@/components/avatar";
import { haptic } from "@/lib/haptics";
import type { Job, JobStatus, MechanicJob, MechanicJobStatus, Role } from "@/lib/types";
import { useLocaleContext } from "@/hooks/use-locale";

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

export default function ActivityScreen() {
  const { state } = useStore();
  const t = useT();
  const { locale } = useLocaleContext();
  const isEs = locale === "es-MX";
  const L = (en: string, es: string) => (isEs ? es : en);
  const FILTERS: { key: Filter; label: string }[] = [
    { key: "all", label: L("All", "Todos") },
    { key: "active", label: L("Active", "Activos") },
    { key: "completed", label: L("Completed", "Completados") },
    { key: "cancelled", label: L("Cancelled", "Cancelados") },
  ];
  const { openDrawer } = useAppDrawer();
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<ActivityItem | null>(null);
  const activeRole: Role = state.dashboardRoleOverride ?? state.role;

  const filtered = useMemo(() => {
    const source: ActivityItem[] =
      activeRole === "mechanic"
        ? state.mechanicJobs.map((j) => ({
            kind: "mechanic" as const,
            id: j.id,
            createdAt: j.receivedAt,
            status: j.status,
            data: j,
          }))
        : state.jobs.map((j) => ({
            kind: "customer" as const,
            id: j.id,
            createdAt: j.createdAt,
            status: j.status,
            data: j,
          }));

    const list = [...source].sort((a, b) => {
      const aActive = isActive(a.status) ? 1 : 0;
      const bActive = isActive(b.status) ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;
      return b.createdAt - a.createdAt;
    });
    if (filter === "all") return list;
    if (filter === "active") return list.filter((j) => isActive(j.status));
    if (filter === "completed") return list.filter((j) => isCompleted(j.status));
    if (filter === "cancelled") return list.filter((j) => isCancelled(j.status));
    return list;
  }, [state.jobs, state.mechanicJobs, filter, activeRole]);

  const handlePress = (item: ActivityItem) => {
    haptic.light();
    setSelected(item);
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

      {filtered.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <IconSymbol name="doc.text.fill" size={36} color="#F97316" />
          </View>
          <Text style={styles.emptyTitle}>{L("No jobs yet", "Aún no hay servicios")}</Text>
          <Text style={styles.emptyText}>
            {L("Once you book a mechanic, your service history will show up here.", "Cuando reserves un mecánico, tu historial aparecerá aquí.")}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => `${item.kind}-${item.id}`}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32, gap: 10 }}
          renderItem={({ item }) => <JobRow item={item} onPress={() => handlePress(item)} isEs={isEs} />}
        />
      )}
      <ActivityDetailsModal
        item={selected}
        role={activeRole}
        isEs={isEs}
        onClose={() => {
          haptic.selection();
          setSelected(null);
        }}
        vehicles={state.vehicles}
      />
    </ScreenContainer>
  );
}

function JobRow({ item, onPress, isEs }: { item: ActivityItem; onPress: () => void; isEs: boolean }) {
  const L = (en: string, es: string) => (isEs ? es : en);
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
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={styles.rowTitle}>{service.name}</Text>
          <StatusChip status={item.status} isEs={isEs} />
        </View>
        <Text style={styles.rowSub}>
          {firstName(name)} • {date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={styles.rowAmount}>
          ${amount.toFixed(2)}
        </Text>
        <IconSymbol name="chevron.right" size={16} color="#94A3B8" />
      </View>
    </Pressable>
  );
}

function StatusChip({ status, isEs }: { status: JobStatus | MechanicJobStatus; isEs: boolean }) {
  const L = (en: string, es: string) => (isEs ? es : en);
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
}

function ActivityDetailsModal({
  item,
  role,
  isEs,
  onClose,
  vehicles,
}: {
  item: ActivityItem | null;
  role: Role;
  isEs: boolean;
  onClose: () => void;
  vehicles: { id: string; year: number; make: string; model: string; plate: string }[];
}) {
  if (!item) return null;

  const service = getServiceType(item.data.service);
  const L = (en: string, es: string) => (isEs ? es : en);
  const amount = item.kind === "mechanic" ? item.data.payout : item.data.fare.total + (item.data.tip ?? 0);
  const arrivalTs = item.kind === "mechanic" ? (item.data.acceptedAt ?? item.data.receivedAt) : (item.data.acceptedAt ?? item.data.createdAt);
  const leftTs = item.kind === "mechanic" ? item.data.completedAt : item.data.completedAt;
  const location = stripStreetNumber(item.data.location);
  const receipt = makeReceiptNumber(item.id, item.createdAt);

  const workedByName =
    role === "customer"
      ? firstName(
          getMechanic((item.data as Job).mechanicId)?.name ||
            (item.kind === "customer" ? (item.data.mechanicName ?? "Mechanic") : "Mechanic"),
        )
      : firstName(item.kind === "mechanic" ? item.data.customerName : "Customer");

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
          <DetailRow label={role === "customer" ? L("Mechanic", "Mecánico") : L("Customer", "Cliente")} value={workedByName} />
          <DetailRow label={L("Amount paid", "Monto pagado")} value={`$${amount.toFixed(2)}`} />
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
  subtitle: { fontSize: 14, color: "#C2410C" },
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
    alignItems: "center",
    gap: 12,
  },
  rowTitle: { fontSize: 15, fontWeight: "700", color: "#F8FAFC" },
  rowSub: { fontSize: 12, color: "#C2410C" },
  rowAmount: { fontSize: 15, fontWeight: "800", color: "#F8FAFC" },
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
});
