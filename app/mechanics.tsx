import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useMemo, useState } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { MECHANICS, getServiceType } from "@/lib/seed";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Avatar } from "@/components/avatar";
import { RatingStars } from "@/components/rating-stars";
import { computeFare } from "@/lib/fare";
import { haptic } from "@/lib/haptics";
import type { Mechanic } from "@/lib/types";
import { useLocaleContext } from "@/hooks/use-locale";
import { localizedServiceName } from "@/lib/service-i18n";

type SortKey = "eta" | "rating" | "price";

export default function MechanicsScreen() {
  const router = useRouter();
  const { service } = useLocalSearchParams<{ service?: string }>();
  const [sort, setSort] = useState<SortKey>("eta");
  const serviceType = typeof service === "string" ? getServiceType(service) : undefined;
  const { t, locale, formatPrice } = useLocaleContext();

  const sorted = useMemo(() => {
    const list = [...MECHANICS];
    if (sort === "eta") list.sort((a, b) => a.etaMinutes - b.etaMinutes);
    if (sort === "rating") list.sort((a, b) => b.rating - a.rating);
    if (sort === "price") list.sort((a, b) => a.hourlyRate - b.hourlyRate);
    return list;
  }, [sort]);

  const openMechanic = (m: Mechanic) => {
    haptic.light();
    router.push({
      pathname: "/mechanic/[id]" as any,
      params: { id: m.id, service: serviceType?.code ?? "" },
    } as any);
  };

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            haptic.light();
            router.back();
          }}
          hitSlop={10}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <IconSymbol name="chevron.left" size={24} color="#0F172A" />
        </Pressable>
        <View style={{ flex: 1, marginLeft: 6 }}>
          <Text style={styles.title}>{t("mechanics.title")}</Text>
          {serviceType ? (
            <Text style={styles.subtitle}>{t("mechanics.for_service", { service: localizedServiceName(serviceType.code, locale) })}</Text>
          ) : (
            <Text style={styles.subtitle}>{t("mechanics.subtitle_default")}</Text>
          )}
        </View>
      </View>

      <View style={styles.sortRow}>
        {[
          { key: "eta", label: t("mechanics.sort_eta") },
          { key: "rating", label: t("mechanics.sort_rating") },
          { key: "price", label: t("mechanics.sort_price") },
        ].map((opt) => (
          <Pressable
            key={opt.key}
            onPress={() => {
              haptic.selection();
              setSort(opt.key as SortKey);
            }}
            style={({ pressed }) => [
              styles.sortChip,
              sort === opt.key && styles.sortChipActive,
              pressed && { opacity: 0.8 },
            ]}
          >
            <Text style={[styles.sortText, sort === opt.key && styles.sortTextActive]}>
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={sorted}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32, gap: 12 }}
        renderItem={({ item }) => (
          <MechanicCard
            mechanic={item}
            estimatedTotal={serviceType ? computeFare(item, serviceType).total : undefined}
            etaUnit={t("common.minutes_short")}
            milesUnit={t("common.miles_short")}
            formatPrice={formatPrice}
            onPress={() => openMechanic(item)}
          />
        )}
      />
    </ScreenContainer>
  );
}

function MechanicCard({
  mechanic,
  estimatedTotal,
  etaUnit,
  milesUnit,
  formatPrice,
  onPress,
}: {
  mechanic: Mechanic;
  estimatedTotal?: number;
  etaUnit: string;
  milesUnit: string;
  formatPrice: (usd: number) => string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] }]}
    >
      <Avatar name={mechanic.name} url={mechanic.photoUrl} size={56} />
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={styles.name}>{mechanic.name}</Text>
        </View>
        <RatingStars rating={mechanic.rating} size={12} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 2 }}>
          {mechanic.specialties.slice(0, 2).map((s) => (
            <View key={s} style={styles.tagChip}>
              <Text style={styles.tagText}>{s}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <View style={styles.etaPill}>
          <IconSymbol name="clock.fill" size={11} color="#FFFFFF" />
          <Text style={styles.etaText}>{mechanic.etaMinutes} {etaUnit}</Text>
        </View>
        <Text style={styles.distance}>{mechanic.distanceMiles.toFixed(1)} {milesUnit}</Text>
        {typeof estimatedTotal === "number" ? (
          <Text style={styles.price}>{formatPrice(estimatedTotal)}</Text>
        ) : (
          <Text style={styles.price}>{formatPrice(mechanic.hourlyRate)}/hr</Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  title: { fontSize: 20, fontWeight: "800", color: "#0F172A" },
  subtitle: { fontSize: 13, color: "#64748B", marginTop: 2 },
  sortRow: { flexDirection: "row", paddingHorizontal: 20, gap: 8, marginBottom: 12 },
  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "#F5F7FA",
    borderRadius: 999,
  },
  sortChipActive: { backgroundColor: "#0F172A" },
  sortText: { fontSize: 12, fontWeight: "600", color: "#475569" },
  sortTextActive: { color: "#FFFFFF" },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  name: { fontSize: 16, fontWeight: "700", color: "#0F172A" },
  tagChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: "#F1F5F9",
    borderRadius: 4,
  },
  tagText: { fontSize: 10, color: "#475569", fontWeight: "600" },
  etaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#10B981",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  etaText: { color: "#FFFFFF", fontWeight: "800", fontSize: 12 },
  distance: { fontSize: 11, color: "#64748B", marginTop: 4 },
  price: { fontSize: 15, fontWeight: "800", color: "#0F172A", marginTop: 4 },
});
