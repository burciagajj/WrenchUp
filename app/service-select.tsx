import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScreenContainer } from "@/components/screen-container";
import { SERVICE_TYPES } from "@/lib/seed";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { PrimaryButton } from "@/components/primary-button";
import { haptic } from "@/lib/haptics";
import { useLocaleContext } from "@/hooks/use-locale";
import { localizedServiceDesc, localizedServiceName } from "@/lib/service-i18n";

export default function ServiceSelectScreen() {
  const router = useRouter();
  const { preselect } = useLocalSearchParams<{ preselect?: string }>();
  const [selected, setSelected] = useState<string | null>(
    typeof preselect === "string" ? preselect : null,
  );
  const { t, locale, formatPrice } = useLocaleContext();

  const handleContinue = () => {
    if (!selected) return;
    haptic.medium();
    router.replace({ pathname: "/mechanics" as any, params: { service: selected } } as any);
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
        <Text style={styles.title}>{t("service_select.title")}</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 16, gap: 10 }}>
        {SERVICE_TYPES.map((s) => {
          const active = selected === s.code;
          return (
            <Pressable
              key={s.code}
              onPress={() => {
                haptic.selection();
                setSelected(s.code);
              }}
              style={({ pressed }) => [
                styles.card,
                active && styles.cardActive,
                pressed && { opacity: 0.9 },
              ]}
            >
              <View style={[styles.iconBubble, active ? { backgroundColor: "#FFEDD5" } : null]}>
                <IconSymbol name={s.icon} size={22} color={active ? "#F97316" : "#64748B"} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{localizedServiceName(s.code, locale)}</Text>
                <Text style={styles.cardDesc}>{localizedServiceDesc(s.code, locale)}</Text>
                <Text style={styles.cardMeta}>
                  {t("common.from")} {formatPrice(s.basePrice)} • ~{s.estimatedMinutes} {t("common.minutes_short")}
                </Text>
              </View>
              <View style={[styles.radio, active && styles.radioActive]}>
                {active ? <IconSymbol name="checkmark" size={14} color="#FFFFFF" /> : null}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton
          title={selected ? t("service_select.cta_find") : t("service_select.cta_select")}
          disabled={!selected}
          onPress={handleContinue}
          hapticType="medium"
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  title: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
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
  cardActive: { borderColor: "#F97316", backgroundColor: "#FFF7ED" },
  iconBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#F5F7FA",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#0F172A" },
  cardDesc: { fontSize: 12, color: "#64748B", marginTop: 2, lineHeight: 16 },
  cardMeta: { fontSize: 11, color: "#475569", marginTop: 4, fontWeight: "600" },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
  },
  radioActive: { backgroundColor: "#F97316", borderColor: "#F97316" },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
});
