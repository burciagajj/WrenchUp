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
import { useLocaleContext, useL } from "@/hooks/use-locale";
import { localizedServiceName } from "@/lib/service-i18n";
import { formatDistanceByRegion } from "@/lib/distance";
import { haversineMeters, metersToMiles } from "@/lib/geo";
import { isMechanicLocationStale } from "@/lib/live-location-freshness";

export default function MatchedMechanicScreen() {
  const router = useRouter();
  const job = useActiveJob();
  const { t, locale, region } = useLocaleContext();
  const L = useL();
  const seeded = job ? getMechanic(job.mechanicId) : undefined;
  const mechanic = seeded ?? (job
    ? {
        id: job.mechanicId,
        name: job.mechanicName ?? L("Assigned Mechanic", "Mecánico asignado"),
        photoUrl: job.mechanicPhotoUrl ?? "",
        rating: 4.9,
        jobsCompleted: 0,
        yearsExperience: 5,
        hourlyRate: 0,
        etaMinutes: 12,
        distanceMiles: 1.8,
        vehicle: L("Service Vehicle", "Vehículo de servicio"),
        bio: L("Verified mechanic assigned to your request.", "Mecánico verificado asignado a tu solicitud."),
        specialties: [],
        certifications: [],
        reviews: [],
        offsetMeters: { east: 180, north: 140 },
      }
    : undefined);
  const service = job ? getServiceType(job.service) : undefined;
  const liveMechanicPoint = job?.mechanicLiveCoords ?? job?.mechanicStart ?? null;
  const liveEta = liveMechanicPoint && job?.pickup ? estimateEtaMinutes(liveMechanicPoint, job.pickup) : null;
  const mechanicLocationStale =
    !!job?.mechanicLiveCoords && isMechanicLocationStale(job?.mechanicLocationUpdatedAt ?? null);
  const displayEta = mechanicLocationStale ? null : liveEta;

  if (!job || !mechanic || !service) {
    return (
      <ScreenContainer showBackButton title={L("Mechanic matched", "Mecánico asignado")}>
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>{L("No mechanic match available.", "No hay mecánico asignado.")}</Text>
          <PrimaryButton title={t("tracking.back_home")} onPress={() => router.replace("/(tabs)" as any)} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <View style={styles.header}>
        <View style={{ width: 24 }} />
        <Text style={styles.title}>{L("Mechanic matched", "Mecánico asignado")}</Text>
        <Pressable
          onPress={() => {
            haptic.light();
            router.back();
          }}
          hitSlop={10}
        >
          <IconSymbol name="xmark" size={22} color="#F8FAFC" />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Avatar name={mechanic.name} url={mechanic.photoUrl} size={88} />
          <Text style={styles.name}>{mechanic.name}</Text>
          <View style={styles.verifiedBadge}>
            <IconSymbol name="checkmark.seal.fill" size={14} color="#FDBA74" />
            <Text style={styles.verifiedText}>{L("Verified mechanic", "Mecánico verificado")}</Text>
          </View>
          <RatingStars rating={mechanic.rating} size={13} />
          <Text style={styles.meta}>
            {mechanic.jobsCompleted.toLocaleString()} {L("jobs", "trabajos")} • {mechanic.yearsExperience}+ {L("years", "años")}
          </Text>
          <Text style={styles.bio}>{mechanic.bio}</Text>
        </View>

        <View style={styles.infoCard}>
          <InfoRow label={L("Service", "Servicio")} value={localizedServiceName(service.code, locale)} />
          <InfoRow
            label={L("ETA", "ETA")}
            value={displayEta !== null ? `${displayEta} ${t("common.minutes_short")}` : L("Calculating...", "Calculando...")}
          />
          <InfoRow label={L("Distance", "Distancia")} value={formatDistanceByRegion(mechanic.distanceMiles, region)} />
          <InfoRow label={L("Vehicle", "Vehículo")} value={mechanic.vehicle} />
        </View>

        <PrimaryButton
          title={L("Continue Tracking", "Continuar seguimiento")}
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

function estimateEtaMinutes(
  mechanicPoint: { latitude: number; longitude: number } | null,
  pickupPoint: { latitude: number; longitude: number } | null,
): number {
  if (!mechanicPoint || !pickupPoint) return 0;
  const miles = metersToMiles(haversineMeters(mechanicPoint, pickupPoint));
  const effectiveMph = 24;
  return Math.max(1, Math.ceil((miles / effectiveMph) * 60));
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
  title: { fontSize: 18, fontWeight: "800", color: "#F8FAFC" },
  content: { padding: 20, gap: 14, paddingBottom: 30 },
  card: {
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 18,
    padding: 16,
    alignItems: "center",
    gap: 8,
  },
  name: { fontSize: 22, fontWeight: "800", color: "#F8FAFC" },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    backgroundColor: "rgba(20,184,166,0.18)",
    borderWidth: 1,
    borderColor: "rgba(94,234,212,0.45)",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  verifiedText: { color: "#FFEDD5", fontSize: 12, fontWeight: "800" },
  meta: { fontSize: 12, color: "#CBD5E1", fontWeight: "700" },
  bio: { fontSize: 14, lineHeight: 20, color: "#E2E8F0", textAlign: "center", marginTop: 6 },
  infoCard: {
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#334155",
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
    borderBottomColor: "#334155",
  },
  rowLabel: { fontSize: 13, color: "#CBD5E1", fontWeight: "800" },
  rowValue: { fontSize: 14, color: "#F8FAFC", fontWeight: "800", maxWidth: "65%", textAlign: "right" },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  emptyText: { fontSize: 14, color: "#CBD5E1", marginBottom: 14 },
});
