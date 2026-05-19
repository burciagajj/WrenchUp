import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useStore } from "@/lib/store";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { PrimaryButton } from "@/components/primary-button";
import { haptic } from "@/lib/haptics";
import type { Vehicle } from "@/lib/types";

export default function VehiclesScreen() {
  const router = useRouter();
  const { state, dispatch } = useStore();

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Vehicles</Text>
          <Text style={styles.subtitle}>Add cars you want serviced</Text>
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
          <Text style={styles.emptyTitle}>No vehicles yet</Text>
          <Text style={styles.emptyText}>
            Add your first vehicle so mechanics know what they're working on.
          </Text>
          <PrimaryButton
            title="Add Vehicle"
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
  selected,
  onSelect,
  onEdit,
}: {
  vehicle: Vehicle;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
}) {
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
              <Text style={styles.selectedChipText}>SELECTED</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.details}>
          {vehicle.year} {vehicle.make} {vehicle.model} • {vehicle.color}
        </Text>
        <Text style={styles.plate}>Plate: {vehicle.plate}</Text>
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
  title: { fontSize: 28, fontWeight: "800", color: "#0F172A" },
  subtitle: { fontSize: 14, color: "#64748B", marginTop: 2 },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 16,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  cardSelected: {
    borderColor: "#F97316",
    backgroundColor: "#FFF7ED",
  },
  iconBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#F5F7FA",
    alignItems: "center",
    justifyContent: "center",
  },
  nickname: { fontSize: 16, fontWeight: "700", color: "#0F172A" },
  details: { fontSize: 13, color: "#475569", marginTop: 2 },
  plate: { fontSize: 12, color: "#64748B", marginTop: 2 },
  selectedChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: "#F97316",
    borderRadius: 4,
  },
  selectedChipText: { color: "#FFFFFF", fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
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
  emptyTitle: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  emptyText: { fontSize: 14, color: "#64748B", textAlign: "center", lineHeight: 20 },
});
