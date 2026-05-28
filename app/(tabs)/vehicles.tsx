import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { ScreenMenuHeader } from "@/components/screen-menu-header";
import { useLocaleContext, useT } from "@/hooks/use-locale";
import { useStore } from "@/lib/store";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { PrimaryButton } from "@/components/primary-button";
import { haptic } from "@/lib/haptics";
import type { Vehicle } from "@/lib/types";

export default function VehiclesScreen() {
  const router = useRouter();
  const { state, dispatch } = useStore();
  const t = useT();
  const { locale } = useLocaleContext();
  const isEs = locale === "es-MX";
  const L = (en: string, es: string) => (isEs ? es : en);

  return (
    <ScreenContainer edges={["left", "right", "bottom"]}>
      <ScreenMenuHeader title={t("tabs.vehicles")} />
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.subtitle}>{L("Add cars you want serviced", "Agrega los autos que quieres atender")}</Text>
        </View>
        <Pressable
          onPress={() => {
            haptic.light();
            router.push("/vehicle-form" as any);
          }}
          style={({ pressed }) => [styles.addButton, pressed && { opacity: 0.8 }]}
        >
          <IconSymbol name="plus" size={22} color="#FFFFFF" />
        </Pressable>
      </View>

      {state.vehicles.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <IconSymbol name="car.fill" size={36} color="#F97316" />
          </View>
          <Text style={styles.emptyTitle}>{L("No vehicles yet", "Aún no hay vehículos")}</Text>
          <Text style={styles.emptyText}>
            {L("Add your first vehicle so mechanics know what they're working on.", "Agrega tu primer vehículo para que los mecánicos sepan en qué trabajarán.")}
          </Text>
          <PrimaryButton
            title={L("Add Vehicle", "Agregar vehículo")}
            fullWidth={false}
            onPress={() => router.push("/vehicle-form" as any)}
          />
        </View>
      ) : (
        <FlatList
          data={state.vehicles}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32, gap: 12 }}
          renderItem={({ item }) => (
            <VehicleRow
              vehicle={item}
              isEs={isEs}
              selected={item.id === state.selectedVehicleId}
              onSelect={() => {
                haptic.selection();
                dispatch({ type: "SELECT_VEHICLE", payload: item.id });
              }}
              onEdit={() => {
                haptic.light();
                router.push({ pathname: "/vehicle-form" as any, params: { id: item.id } } as any);
              }}
            />
          )}
        />
      )}
    </ScreenContainer>
  );
}

function VehicleRow({
  vehicle,
  isEs,
  selected,
  onSelect,
  onEdit,
}: {
  vehicle: Vehicle;
  isEs: boolean;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
}) {
  const L = (en: string, es: string) => (isEs ? es : en);
  return (
    <Pressable
      onPress={onSelect}
      style={({ pressed }) => [
        styles.card,
        selected && styles.cardSelected,
        pressed && { opacity: 0.9 },
      ]}
    >
      <View style={[styles.iconBubble, selected ? { backgroundColor: "#FFEDD5" } : null]}>
        <IconSymbol name="car.fill" size={22} color={selected ? "#F97316" : "#64748B"} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={styles.nickname}>{vehicle.nickname}</Text>
          {selected ? (
            <View style={styles.selectedChip}>
              <Text style={styles.selectedChipText}>{L("SELECTED", "ACTIVO")}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.details}>
          {vehicle.year} {vehicle.make} {vehicle.model} • {vehicle.color}
        </Text>
        <Text style={styles.meta}>
          {[vehicle.trim, vehicle.engineSize, vehicle.transmissionType?.toUpperCase(), vehicle.drivetrain]
            .filter(Boolean)
            .join(" • ")}
        </Text>
        <Text style={styles.plate}>{L("Plate", "Placa")}: {vehicle.plate}</Text>
        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusChip,
              vehicle.approvalStatus === "approved"
                ? styles.statusApproved
                : vehicle.approvalStatus === "rejected"
                ? styles.statusRejected
                : styles.statusPending,
            ]}
          >
            <Text style={styles.statusChipText}>
              {vehicle.approvalStatus === "approved"
                ? L("Approved", "Aprobado")
                : vehicle.approvalStatus === "rejected"
                ? L("Rejected", "Rechazado")
                : L("Pending approval", "Pendiente de aprobación")}
            </Text>
          </View>
        </View>
      </View>
      <Pressable onPress={onEdit} hitSlop={10} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
        <IconSymbol name="pencil" size={20} color="#64748B" />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
  },
  title: { fontSize: 28, fontWeight: "800", color: "#F8FAFC" },
  subtitle: { fontSize: 14, color: "#C2410C", marginTop: 2 },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    backgroundColor: "#1A1A2E",
    borderWidth: 1,
    borderColor: "#2A2A40",
    borderRadius: 16,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  cardSelected: {
    borderColor: "#F97316",
    backgroundColor: "#2A1D16",
  },
  iconBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#121212",
    alignItems: "center",
    justifyContent: "center",
  },
  nickname: { fontSize: 16, fontWeight: "700", color: "#F8FAFC" },
  details: { fontSize: 13, color: "#CBD5E1", marginTop: 2 },
  meta: { fontSize: 12, color: "#94A3B8", marginTop: 2 },
  plate: { fontSize: 12, color: "#C2410C", marginTop: 2 },
  selectedChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: "#F97316",
    borderRadius: 4,
  },
  selectedChipText: { color: "#FFFFFF", fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  statusRow: {
    marginTop: 6,
    flexDirection: "row",
  },
  statusChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  statusPending: {
    backgroundColor: "#3A2A1A",
  },
  statusApproved: {
    backgroundColor: "#14532D",
  },
  statusRejected: {
    backgroundColor: "#7F1D1D",
  },
  statusChipText: {
    color: "#F8FAFC",
    fontSize: 11,
    fontWeight: "700",
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 14,
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
});
