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
  const isSpanish = locale === "es-MX";
  const OIL_PACKAGES = [
    { code: "full_synthetic", label: isSpanish ? "Sintético completo + filtro" : "Full Synthetic + filter" },
    { code: "conventional", label: isSpanish ? "Convencional + filtro" : "Conventional + filter" },
    { code: "own_oil_filter", label: isSpanish ? "Tengo mi propio aceite y filtro" : "I have my own oil and filter" },
  ] as const;
  const [oilPackage, setOilPackage] = useState<(typeof OIL_PACKAGES)[number]["code"]>("full_synthetic");
  const BOOKING_RECOMMENDED_SERVICES = new Set([
    "oil_change",
    "general_checkup",
    "ac_service",
    "engine_repair",
    "brake_service",
    "diagnostic",
    "other",
  ]);
  const QUICK_SERVICE_CODES = new Set(["battery_jump", "flat_tire", "lockout", "car_wash"]);
  const quickServices = SERVICE_TYPES.filter((s) => QUICK_SERVICE_CODES.has(s.code));
  const bookedServices = SERVICE_TYPES.filter((s) => BOOKING_RECOMMENDED_SERVICES.has(s.code));

  const handleContinue = () => {
    if (!selected) return;
    haptic.medium();
    if (BOOKING_RECOMMENDED_SERVICES.has(selected)) {
      router.replace({
        pathname: "/(tabs)/book-service" as any,
        params: {
          service: selected,
          oilPackage: selected === "oil_change" ? oilPackage : undefined,
        },
      } as any);
      return;
    }
    router.replace({
      pathname: "/confirm" as any,
      params: {
        service: selected,
        oilPackage: selected === "oil_change" ? oilPackage : undefined,
      },
    } as any);
  };

  return (
    <ScreenContainer edges={["top", "left", "right"]} style={{ backgroundColor: "#040B1B" }}>
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
        <Text style={styles.sectionTitle}>{isSpanish ? "Servicios rápidos" : "Quick services"}</Text>
        {quickServices.map((s) => {
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

        <Text style={[styles.sectionTitle, { marginTop: 8 }]}>{isSpanish ? "Servicios agendados" : "Booked services"}</Text>
        {bookedServices.map((s) => {
          const active = selected === s.code;
          return (
            <View key={s.code}>
              <Pressable
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
                  <Text style={styles.bookedHint}>
                    {isSpanish ? "Este servicio abre el flujo de agendado." : "This service opens the booking flow."}
                  </Text>
                </View>
                <View style={[styles.radio, active && styles.radioActive]}>
                  {active ? <IconSymbol name="checkmark" size={14} color="#FFFFFF" /> : null}
                </View>
              </Pressable>

              {selected === "oil_change" && s.code === "oil_change" ? (
                <View style={styles.inlineOilWrap}>
                  <Text style={styles.oilTitle}>{isSpanish ? "Tipo de aceite" : "Oil Type"}</Text>
                  {OIL_PACKAGES.map((opt) => (
                    <Pressable
                      key={opt.code}
                      onPress={() => {
                        haptic.selection();
                        setOilPackage(opt.code);
                      }}
                      style={({ pressed }) => [
                        styles.oilRow,
                        oilPackage === opt.code && styles.oilRowActive,
                        pressed && { opacity: 0.9 },
                      ]}
                    >
                  <Text style={styles.oilLabel}>{opt.label}</Text>
                  {opt.code !== "own_oil_filter" ? (
                    <Text style={styles.oilPrice}>{isSpanish ? "Precio en aceptación" : "Price on acceptance"}</Text>
                  ) : null}
                </Pressable>
              ))}
            </View>
              ) : null}
            </View>
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
  title: { fontSize: 18, fontWeight: "800", color: "#F8FAFC" },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#35E0D0",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  card: {
    backgroundColor: "rgba(20,31,56,0.9)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: 16,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  cardActive: { borderColor: "#F97316", backgroundColor: "rgba(249,115,22,0.18)" },
  iconBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(53,224,208,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#F8FAFC" },
  cardDesc: { fontSize: 12, color: "#CBD5E1", marginTop: 2, lineHeight: 16 },
  cardMeta: { fontSize: 11, color: "#94A3B8", marginTop: 4, fontWeight: "600" },
  bookedHint: { fontSize: 11, color: "#35E0D0", marginTop: 4, fontWeight: "700" },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#35E0D0",
    alignItems: "center",
    justifyContent: "center",
  },
  radioActive: { backgroundColor: "#F97316", borderColor: "#F97316" },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.16)",
    backgroundColor: "#0D162A",
  },
  oilWrap: {
    marginTop: 4,
    backgroundColor: "rgba(20,31,56,0.9)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  inlineOilWrap: {
    marginTop: 6,
    marginBottom: 2,
    marginHorizontal: 4,
    backgroundColor: "rgba(20,31,56,0.9)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  oilTitle: { fontSize: 14, fontWeight: "800", color: "#F8FAFC", marginBottom: 2 },
  oilRow: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  oilRowActive: {
    borderColor: "#F97316",
    backgroundColor: "rgba(249,115,22,0.2)",
  },
  oilLabel: { fontSize: 13, color: "#F8FAFC", fontWeight: "700" },
  oilPrice: { fontSize: 13, color: "#35E0D0", fontWeight: "800" },
});
