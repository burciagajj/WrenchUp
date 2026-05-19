import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { ScreenContainer } from "@/components/screen-container";
import { useStore } from "@/lib/store";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { PrimaryButton } from "@/components/primary-button";
import { haptic } from "@/lib/haptics";
import type { Vehicle } from "@/lib/types";

const CURRENT_YEAR = new Date().getFullYear();

export default function VehicleFormScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { state, dispatch } = useStore();
  const existing = useMemo(
    () => (typeof id === "string" ? state.vehicles.find((v) => v.id === id) : undefined),
    [id, state.vehicles],
  );

  const [nickname, setNickname] = useState(existing?.nickname ?? "");
  const [year, setYear] = useState(existing?.year?.toString() ?? "");
  const [make, setMake] = useState(existing?.make ?? "");
  const [model, setModel] = useState(existing?.model ?? "");
  const [color, setColor] = useState(existing?.color ?? "");
  const [plate, setPlate] = useState(existing?.plate ?? "");

  const isValid =
    nickname.trim().length > 0 &&
    make.trim().length > 0 &&
    model.trim().length > 0 &&
    /^\d{4}$/.test(year) &&
    parseInt(year, 10) >= 1950 &&
    parseInt(year, 10) <= CURRENT_YEAR + 1;

  const handleSave = () => {
    if (!isValid) {
      haptic.error();
      return;
    }
    const vehicle: Vehicle = {
      id: existing?.id ?? `v_${Date.now()}`,
      nickname: nickname.trim(),
      year: parseInt(year, 10),
      make: make.trim(),
      model: model.trim(),
      color: color.trim() || "Unknown",
      plate: plate.trim().toUpperCase(),
    };
    haptic.success();
    if (existing) {
      dispatch({ type: "UPDATE_VEHICLE", payload: vehicle });
    } else {
      dispatch({ type: "ADD_VEHICLE", payload: vehicle });
    }
    router.back();
  };

  const handleDelete = () => {
    if (!existing) return;
    const doDelete = () => {
      haptic.warning();
      dispatch({ type: "DELETE_VEHICLE", payload: existing.id });
      router.back();
    };
    if (Platform.OS === "web") {
      doDelete();
    } else {
      Alert.alert("Delete vehicle", "This action cannot be undone.", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: doDelete },
      ]);
    }
  };

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            haptic.light();
            router.back();
          }}
          hitSlop={10}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <IconSymbol name="xmark" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>{existing ? "Edit vehicle" : "Add vehicle"}</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32, gap: 14 }}>
        <Field label="Nickname" value={nickname} onChangeText={setNickname} placeholder="Daily Driver" />
        <Field label="Year" value={year} onChangeText={setYear} placeholder="2024" keyboardType="number-pad" maxLength={4} />
        <Field label="Make" value={make} onChangeText={setMake} placeholder="Honda" autoCapitalize="words" />
        <Field label="Model" value={model} onChangeText={setModel} placeholder="Civic" autoCapitalize="words" />
        <Field label="Color" value={color} onChangeText={setColor} placeholder="Silver" autoCapitalize="words" />
        <Field label="License plate" value={plate} onChangeText={setPlate} placeholder="ABC1234" autoCapitalize="characters" maxLength={10} />

        <View style={{ height: 8 }} />
        <PrimaryButton
          title={existing ? "Save changes" : "Add vehicle"}
          onPress={handleSave}
          disabled={!isValid}
          hapticType="success"
        />
        {existing ? (
          <PrimaryButton
            title="Delete vehicle"
            variant="danger"
            onPress={handleDelete}
            hapticType="error"
          />
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize,
  maxLength,
}: {
  label: string;
  value: string;
  onChangeText: (s: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "number-pad";
  autoCapitalize?: "none" | "words" | "characters";
  maxLength?: number;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#94A3B8"
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        maxLength={maxLength}
        style={styles.input}
        returnKeyType="done"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
  },
  title: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  label: { fontSize: 12, color: "#64748B", fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  input: {
    backgroundColor: "#F5F7FA",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#0F172A",
  },
});
