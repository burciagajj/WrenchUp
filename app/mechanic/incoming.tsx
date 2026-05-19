import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ScreenContainer } from "@/components/screen-container";
import { useStore } from "@/lib/store";
import { getServiceType } from "@/lib/seed";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { PrimaryButton } from "@/components/primary-button";
import { Avatar } from "@/components/avatar";
import { haptic } from "@/lib/haptics";
import { notifyNow } from "@/lib/notifications";

const COUNTDOWN_SECONDS = 30;

export default function IncomingJobScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, dispatch } = useStore();
  const job = typeof id === "string" ? state.mechanicJobs.find((j) => j.id === id) : undefined;
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);
  const expiredRef = useRef(false);

  // Countdown
  useEffect(() => {
    if (!job || job.status !== "pending") return;
    setSecondsLeft(COUNTDOWN_SECONDS);
    const start = Date.now();
    const id = setInterval(() => {
      const elapsed = Math.floor((Date.now() - start) / 1000);
      const left = Math.max(0, COUNTDOWN_SECONDS - elapsed);
      setSecondsLeft(left);
      if (left <= 0) {
        clearInterval(id);
        if (!expiredRef.current) {
          expiredRef.current = true;
          handleDecline(true);
        }
      }
    }, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id]);

  if (!job) {
    return (
      <ScreenContainer>
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>Job not found.</Text>
          <PrimaryButton title="Back" fullWidth={false} onPress={() => router.replace("/(tabs)" as any)} />
        </View>
      </ScreenContainer>
    );
  }

  // If status changes (already accepted/declined elsewhere), exit
  useEffect(() => {
    if (!job) return;
    if (job.status === "heading_there") {
      router.replace("/mechanic/active" as any);
    } else if (job.status === "declined" || job.status === "cancelled") {
      router.replace("/(tabs)" as any);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status]);

  const service = getServiceType(job.service);

  const handleAccept = () => {
    haptic.success();
    dispatch({
      type: "UPDATE_MECHANIC_JOB_STATUS",
      payload: { id: job.id, status: "heading_there" },
    });
    notifyNow({
      title: "Job accepted",
      body: `${job.customerName} is expecting you. ETA ${Math.max(5, Math.round(job.distanceMiles * 4))} min.`,
    });
    router.replace("/mechanic/active" as any);
  };

  const handleDecline = (auto = false) => {
    if (!auto) haptic.warning();
    dispatch({
      type: "UPDATE_MECHANIC_JOB_STATUS",
      payload: { id: job.id, status: "declined" },
    });
    if (auto) {
      notifyNow({ title: "Job missed", body: "Request expired before you could respond." });
    }
    router.replace("/(tabs)" as any);
  };

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>New job request</Text>
        <View style={styles.countdown}>
          <Text style={styles.countdownText}>{secondsLeft}s</Text>
        </View>
      </View>

      <View style={styles.heroCard}>
        <View style={styles.heroTop}>
          <Avatar name={job.customerName} size={56} />
          <View style={{ flex: 1 }}>
            <Text style={styles.customerName}>{job.customerName}</Text>
            <Text style={styles.vehicle}>{job.vehicle}</Text>
          </View>
          <View style={styles.payoutBox}>
            <Text style={styles.payoutLabel}>PAYOUT</Text>
            <Text style={styles.payoutValue}>${job.payout.toFixed(2)}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <Row icon={service?.icon ?? "wrench.fill"} label="Service" value={service?.name ?? "—"} />
        <Row icon="location.fill" label="Pickup" value={job.location} />
        <Row icon="car.fill" label="Distance" value={`${job.distanceMiles.toFixed(1)} mi away`} />
        <Row
          icon="clock.fill"
          label="Estimated time"
          value={`~${service?.estimatedMinutes ?? 30} min`}
        />
      </View>

      <View style={styles.footer}>
        <Pressable
          onPress={() => handleDecline(false)}
          style={({ pressed }) => [styles.declineBtn, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.declineText}>Decline</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <PrimaryButton
            title="Accept"
            onPress={handleAccept}
            hapticType="success"
            iconLeft={<IconSymbol name="checkmark" size={18} color="#FFFFFF" />}
          />
        </View>
      </View>
    </ScreenContainer>
  );
}

function Row({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>
        <IconSymbol name={icon} size={16} color="#F97316" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: { fontSize: 20, fontWeight: "800", color: "#0F172A" },
  countdown: {
    backgroundColor: "#F97316",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  countdownText: { color: "#FFFFFF", fontWeight: "800", fontSize: 13 },
  heroCard: {
    marginHorizontal: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 18,
    padding: 16,
    gap: 8,
  },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  customerName: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  vehicle: { fontSize: 13, color: "#64748B", marginTop: 2 },
  payoutBox: { alignItems: "flex-end" },
  payoutLabel: { fontSize: 10, color: "#64748B", fontWeight: "800", letterSpacing: 0.6 },
  payoutValue: { fontSize: 22, fontWeight: "800", color: "#10B981" },
  divider: { height: 1, backgroundColor: "#E2E8F0", marginVertical: 8 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 6, gap: 12 },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FFEDD5",
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { fontSize: 11, color: "#64748B", fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  rowValue: { fontSize: 14, color: "#0F172A", fontWeight: "600", marginTop: 2 },
  footer: {
    position: "absolute",
    left: 0, right: 0, bottom: 0,
    backgroundColor: "#FFFFFF",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E2E8F0",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  declineBtn: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: "#F1F5F9",
  },
  declineText: { color: "#0F172A", fontWeight: "700", fontSize: 15 },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  emptyText: { fontSize: 15, color: "#64748B" },
});
