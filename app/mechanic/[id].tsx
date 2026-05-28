import { ScrollView, StyleSheet, Text, View, Pressable } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { getMechanic, getServiceType, SERVICE_TYPES } from "@/lib/seed";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Avatar } from "@/components/avatar";
import { RatingStars } from "@/components/rating-stars";
import { PrimaryButton } from "@/components/primary-button";
import { computeFare } from "@/lib/fare";
import { haptic } from "@/lib/haptics";
import { useLocaleContext } from "@/hooks/use-locale";
import { localizedServiceName } from "@/lib/service-i18n";
import { formatDistanceByRegion } from "@/lib/distance";

export default function MechanicDetailScreen() {
  const router = useRouter();
  const { id, service } = useLocalSearchParams<{ id: string; service?: string }>();
  const mechanic = typeof id === "string" ? getMechanic(id) : undefined;
  const serviceType = typeof service === "string" ? getServiceType(service) : undefined;
  const { t, locale, formatPrice, region } = useLocaleContext();

  if (!mechanic) {
    return (
      <ScreenContainer>
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>Mechanic not found.</Text>
        </View>
      </ScreenContainer>
    );
  }

  const handleBook = () => {
    haptic.medium();
    // If no service was selected, default to a general check-up service
    const code = serviceType?.code ?? SERVICE_TYPES.find((s) => s.code === "general_checkup")!.code;
    router.push({ pathname: "/confirm" as any, params: { mechanicId: mechanic.id, service: code } } as any);
  };

  const estimated = computeFare(mechanic, serviceType ?? SERVICE_TYPES.find((s) => s.code === "general_checkup")!, region);

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.headerRow}>
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
        </View>

        {/* Hero */}
        <View style={styles.hero}>
          <Avatar name={mechanic.name} url={mechanic.photoUrl} size={92} />
          <Text style={styles.name}>{mechanic.name}</Text>
          <RatingStars rating={mechanic.rating} size={14} />
          <Text style={styles.summary}>
            {mechanic.jobsCompleted.toLocaleString()} {t("mechanic.jobs")} • {t("mechanic.years_short", { years: mechanic.yearsExperience })}
          </Text>
        </View>

        {/* Quick stats */}
        <View style={styles.statsRow}>
          <Stat icon="clock.fill" label={t("mechanic.eta")} value={`${mechanic.etaMinutes} ${t("common.minutes_short")}`} />
          <View style={styles.statDivider} />
          <Stat icon="location.fill" label={t("mechanic.distance")} value={formatDistanceByRegion(mechanic.distanceMiles, region)} />
          <View style={styles.statDivider} />
          <Stat icon="creditcard.fill" label={t("mechanic.rate")} value={`${formatPrice(mechanic.hourlyRate)}/hr`} />
        </View>

        {/* Bio */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("mechanic.about")}</Text>
          <Text style={styles.bio}>{mechanic.bio}</Text>
        </View>

        {/* Specialties */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("mechanic.specialties")}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {mechanic.specialties.map((s) => (
              <View key={s} style={styles.specialtyChip}>
                <Text style={styles.specialtyText}>{s}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Certifications */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("mechanic.certifications")}</Text>
          {mechanic.certifications.map((c) => (
            <View key={c} style={styles.certRow}>
              <IconSymbol name="checkmark.circle.fill" size={16} color="#10B981" />
              <Text style={styles.certText}>{c}</Text>
            </View>
          ))}
        </View>

        {/* Reviews */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("mechanic.reviews")}</Text>
          {mechanic.reviews.map((r) => (
            <View key={r.id} style={styles.reviewCard}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={styles.reviewAuthor}>{r.author}</Text>
                <RatingStars rating={r.rating} size={12} showNumber={false} />
              </View>
              <Text style={styles.reviewComment}>{r.comment}</Text>
              <Text style={styles.reviewDate}>{r.date}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Sticky footer */}
      <View style={styles.footer}>
        <View style={{ flex: 1 }}>
          <Text style={styles.footerLabel}>{t("mechanic.estimate_label", { service: localizedServiceName((serviceType?.code ?? "general_checkup") as any, locale) })}</Text>
          <Text style={styles.footerPrice}>{formatPrice(estimated.total)}</Text>
        </View>
        <PrimaryButton title={t("mechanic.book_now")} onPress={handleBook} fullWidth={false} hapticType="medium" />
      </View>
    </ScreenContainer>
  );
}

function Stat({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.statItem}>
      <IconSymbol name={icon} size={16} color="#F97316" />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { paddingHorizontal: 20, paddingTop: 8 },
  hero: { alignItems: "center", paddingVertical: 20, gap: 6 },
  name: { fontSize: 22, fontWeight: "800", color: "#0F172A" },
  summary: { fontSize: 13, color: "#64748B" },
  statsRow: {
    flexDirection: "row",
    marginHorizontal: 20,
    backgroundColor: "#F5F7FA",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  statItem: { flex: 1, alignItems: "center", gap: 2 },
  statValue: { fontSize: 15, fontWeight: "800", color: "#0F172A", marginTop: 2 },
  statLabel: { fontSize: 11, color: "#64748B", fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.4 },
  statDivider: { width: 1, height: 32, backgroundColor: "#E2E8F0" },
  section: { paddingHorizontal: 20, marginTop: 22 },
  sectionTitle: { fontSize: 13, color: "#64748B", fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  bio: { fontSize: 14, color: "#0F172A", lineHeight: 21 },
  specialtyChip: { paddingHorizontal: 10, paddingVertical: 5, backgroundColor: "#FFEDD5", borderRadius: 999 },
  specialtyText: { fontSize: 12, color: "#9A3412", fontWeight: "700" },
  certRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  certText: { fontSize: 14, color: "#0F172A", fontWeight: "500" },
  reviewCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  reviewAuthor: { fontSize: 13, fontWeight: "700", color: "#0F172A" },
  reviewComment: { fontSize: 14, color: "#334155", marginTop: 6, lineHeight: 20 },
  reviewDate: { fontSize: 11, color: "#94A3B8", marginTop: 4 },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#FFFFFF",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E2E8F0",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  footerLabel: { fontSize: 12, color: "#64748B", fontWeight: "600" },
  footerPrice: { fontSize: 22, fontWeight: "800", color: "#0F172A" },
  errorWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { fontSize: 16, color: "#64748B" },
});
