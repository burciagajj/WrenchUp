import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useActiveJob } from "@/lib/store";
import { getMechanic, getServiceType } from "@/lib/seed";
import { Avatar } from "@/components/avatar";
import { RatingStars } from "@/components/rating-stars";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { PrimaryButton } from "@/components/primary-button";
import { haptic } from "@/lib/haptics";
import { useLocaleContext } from "@/hooks/use-locale";
import { localizedServiceName } from "@/lib/service-i18n";
import { formatDistanceByRegion } from "@/lib/distance";

export default function MatchedMechanicScreen() {
  const router = useRouter();
  const job = useActiveJob();
  const { t, locale, region } = useLocaleContext();
  const seeded = job ? getMechanic(job.mechanicId) : undefined;
  const mechanic = seeded ?? (job
    ? {
        id: job.mechanicId,
        name: job.mechanicName ?? "Assigned Mechanic",
        photoUrl: job.mechanicPhotoUrl ?? "",
        rating: 4.9,
        jobsCompleted: 0,
        yearsExperience: 5,
        hourlyRate: 0,
        etaMinutes: 12,
        distanceMiles: 1.8,
        vehicle: "Service Vehicle",
        bio: "Verified mechanic assigned to your request.",
        specialties: [],
        certifications: [],
        reviews: [],
        offsetMeters: { east: 180, north: 140 },
      }
    : undefined);
  const service = job ? getServiceType(job.service) : undefined;

  if (!job || !mechanic || !service) {
    return (
      <ScreenContainer>
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>No mechanic match available.</Text>
          <PrimaryButton title={t("tracking.back_home")} onPress={() => router.replace("/(tabs)" as any)} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <View style={styles.header}>
        <View style={{ width: 24 }} />
        <Text style={styles.title}>Mechanic matched</Text>
        <Pressable
          onPress={() => {
            haptic.light();
            router.back();
          }}
          hitSlop={10}
        >
          <IconSymbol name="xmark" size={22} color="#0F172A" />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Avatar name={mechanic.name} url={mechanic.photoUrl} size={88} />
          <Text style={styles.name}>{mechanic.name}</Text>
          <RatingStars rating={mechanic.rating} size={13} />
          <Text style={styles.meta}>
            {mechanic.jobsCompleted.toLocaleString()} jobs • {mechanic.yearsExperience}+ years
          </Text>
          <Text style={styles.bio}>{mechanic.bio}</Text>
        </View>

        <View style={styles.infoCard}>
          <InfoRow label="Service" value={localizedServiceName(service.code, locale)} />
          <InfoRow label="ETA" value={`${mechanic.etaMinutes} ${t("common.minutes_short")}`} />
          <InfoRow label="Distance" value={formatDistanceByRegion(mechanic.distanceMiles, region)} />
          <InfoRow label="Vehicle" value={mechanic.vehicle} />
        </View>

        <PrimaryButton
          title="Continue Tracking"
          onPress={() => {
            haptic.light();
            router.back();
          }}
        />
      </ScrollView>
    </ScreenContainer>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  content: { padding: 20, gap: 14, paddingBottom: 30 },
  card: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 18,
    padding: 16,
    alignItems: "center",
    gap: 8,
  },
  name: { fontSize: 22, fontWeight: "800", color: "#0F172A" },
  meta: { fontSize: 12, color: "#64748B", fontWeight: "600" },
  bio: { fontSize: 14, lineHeight: 20, color: "#334155", textAlign: "center", marginTop: 6 },
  infoCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
  },
  rowLabel: { fontSize: 13, color: "#64748B", fontWeight: "700" },
  rowValue: { fontSize: 14, color: "#0F172A", fontWeight: "700", maxWidth: "65%", textAlign: "right" },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  emptyText: { fontSize: 14, color: "#64748B", marginBottom: 14 },
});
