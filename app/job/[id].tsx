import { ScrollView, StyleSheet, Text, View, Pressable } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useJob } from "@/lib/store";
import { getMechanic, getServiceType } from "@/lib/seed";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Avatar } from "@/components/avatar";
import { RatingStars } from "@/components/rating-stars";
import { PrimaryButton } from "@/components/primary-button";
import { haptic } from "@/lib/haptics";

export default function JobDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const job = useJob(id);

  if (!job) {
    return (
      <ScreenContainer>
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>Job not found.</Text>
        </View>
      </ScreenContainer>
    );
  }

  const mechanic = getMechanic(job.mechanicId);
  const service = getServiceType(job.service);
  if (!mechanic || !service) return null;

  const date = new Date(job.createdAt);
  const tip = job.tip ?? 0;
  const total = job.fare.total + tip;

  const handleRebook = () => {
    haptic.medium();
    router.push({
      pathname: "/confirm" as any,
      params: { mechanicId: mechanic.id, service: service.code },
    } as any);
  };

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Pressable
            onPress={() => {
              haptic.light();
              router.back();
            }}
            hitSlop={10}
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
          >
            <IconSymbol name="chevron.left" size={22} color="#0F172A" />
          </Pressable>
          <Text style={styles.topTitle}>Job details</Text>
          <View style={{ width: 36 }} />
        </View>

        <View style={styles.hero}>
          <Text style={styles.serviceName}>{service.name}</Text>
          <Text style={styles.date}>
            {date.toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}{" "}
            • {date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
          </Text>
        </View>

        <View style={styles.mechanicCard}>
          <Avatar name={mechanic.name} url={mechanic.photoUrl} size={52} />
          <View style={{ flex: 1 }}>
            <Text style={styles.mechanicName}>{mechanic.name}</Text>
            <RatingStars rating={mechanic.rating} size={12} />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Receipt</Text>
          <Row label="Booking fee" value={`$${job.fare.base.toFixed(2)}`} />
          <Row label="Service" value={`$${job.fare.service.toFixed(2)}`} />
          <Row label="Dispatch" value={`$${job.fare.distance.toFixed(2)}`} />
          {tip > 0 ? <Row label="Tip" value={`$${tip.toFixed(2)}`} highlight /> : null}
          <View style={styles.divider} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Details</Text>
          <Row label="Location" value={job.location} />
          <Row label="Status" value={job.status.replace("_", " ")} />
          {job.rating ? <Row label="Your rating" value={`${job.rating} / 5`} /> : null}
          {job.ratingComment ? (
            <View style={{ marginTop: 8 }}>
              <Text style={styles.commentLabel}>Your comment</Text>
              <Text style={styles.commentText}>{job.ratingComment}</Text>
            </View>
          ) : null}
        </View>

        <View style={{ paddingHorizontal: 20, marginTop: 12 }}>
          <PrimaryButton
            title="Rebook this service"
            onPress={handleRebook}
            iconRight={<IconSymbol name="arrow.right" size={18} color="#FFFFFF" />}
            hapticType="medium"
          />
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, highlight && { color: "#F97316", fontWeight: "800" }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "#F5F7FA",
    alignItems: "center", justifyContent: "center",
  },
  topTitle: { fontSize: 16, fontWeight: "800", color: "#0F172A" },
  hero: { paddingHorizontal: 20, paddingTop: 12 },
  serviceName: { fontSize: 24, fontWeight: "800", color: "#0F172A" },
  date: { fontSize: 13, color: "#64748B", marginTop: 4 },
  mechanicCard: {
    marginHorizontal: 20,
    marginTop: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 16,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  mechanicName: { fontSize: 15, fontWeight: "800", color: "#0F172A" },
  card: {
    marginHorizontal: 20,
    marginTop: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 16,
    padding: 14,
  },
  cardTitle: { fontSize: 14, fontWeight: "800", color: "#0F172A", marginBottom: 8 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  rowLabel: { fontSize: 13, color: "#475569" },
  rowValue: { fontSize: 13, color: "#0F172A", fontWeight: "600", textTransform: "capitalize" },
  divider: { height: 1, backgroundColor: "#E2E8F0", marginVertical: 8 },
  totalRow: { flexDirection: "row", justifyContent: "space-between" },
  totalLabel: { fontSize: 15, fontWeight: "800", color: "#0F172A" },
  totalValue: { fontSize: 18, fontWeight: "800", color: "#F97316" },
  commentLabel: { fontSize: 11, color: "#64748B", fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  commentText: { fontSize: 13, color: "#0F172A", marginTop: 4, lineHeight: 19 },
  errorWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { fontSize: 16, color: "#64748B" },
});
