import { Pressable, ScrollView, StyleSheet, Text, View, Alert, Platform } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useStore, useMechanicActiveJob } from "@/lib/store";
import { getServiceType } from "@/lib/seed";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { PrimaryButton } from "@/components/primary-button";
import { Avatar } from "@/components/avatar";
import { LiveMap } from "@/components/live-map";
import { interpolate } from "@/lib/geo";
import { useEffect, useState } from "react";
import { haptic } from "@/lib/haptics";
import { notifyNow } from "@/lib/notifications";
import type { MechanicJobStatus } from "@/lib/types";

const FLOW: MechanicJobStatus[] = ["heading_there", "arrived", "in_progress", "completed"];

export default function MechanicActiveJobScreen() {
  const router = useRouter();
  const job = useMechanicActiveJob();
  const { dispatch } = useStore();
  const [elapsed, setElapsed] = useState(0);

  // Animate the mechanic puck while heading_there
  useEffect(() => {
    if (!job || job.status !== "heading_there") {
      setElapsed(0);
      return;
    }
    setElapsed(0);
    const start = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [job?.status, job?.id]);

  if (!job) {
    return (
      <ScreenContainer>
        <View style={styles.emptyWrap}>
          <View style={styles.emptyIcon}>
            <IconSymbol name="checkmark.circle.fill" size={42} color="#10B981" />
          </View>
          <Text style={styles.emptyTitle}>No active job</Text>
          <Text style={styles.emptyText}>Once you accept a request, it'll show up here.</Text>
          <PrimaryButton title="Back to dashboard" fullWidth={false} onPress={() => router.replace("/(tabs)" as any)} />
        </View>
      </ScreenContainer>
    );
  }

  const service = getServiceType(job.service);
  const idx = FLOW.indexOf(job.status);
  const nextStatus = idx >= 0 && idx < FLOW.length - 1 ? FLOW[idx + 1] : null;

  const advance = () => {
    if (!nextStatus) return;
    haptic.success();
    dispatch({
      type: "UPDATE_MECHANIC_JOB_STATUS",
      payload: { id: job.id, status: nextStatus },
    });
    if (nextStatus === "arrived") {
      notifyNow({ title: "Marked as arrived", body: `You're at ${job.customerName}'s location.` });
    } else if (nextStatus === "in_progress") {
      notifyNow({ title: "Service started", body: "Customer was notified." });
    } else if (nextStatus === "completed") {
      notifyNow({
        title: "Job completed",
        body: `You earned $${job.payout.toFixed(2)} on this trip.`,
      });
      // After a short delay, return to dashboard
      setTimeout(() => router.replace("/(tabs)" as any), 600);
    }
  };

  const handleCancel = () => {
    const doCancel = () => {
      haptic.warning();
      dispatch({
        type: "UPDATE_MECHANIC_JOB_STATUS",
        payload: { id: job.id, status: "cancelled" },
      });
      router.replace("/(tabs)" as any);
    };
    if (Platform.OS === "web") {
      doCancel();
    } else {
      Alert.alert("Cancel job?", "The customer will be notified and the job will be voided.", [
        { text: "Keep job", style: "cancel" },
        { text: "Cancel", style: "destructive", onPress: doCancel },
      ]);
    }
  };

  const ctaTitle = ctaLabel(job.status);
  const headline = headlineFor(job.status, job.customerName);

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Pressable
            onPress={() => router.replace("/(tabs)" as any)}
            hitSlop={10}
            style={({ pressed }) => [styles.topBack, pressed && { opacity: 0.7 }]}
          >
            <IconSymbol name="chevron.left" size={22} color="#0F172A" />
          </Pressable>
          <Text style={styles.topTitle}>Active job</Text>
          <View style={{ width: 36 }} />
        </View>

        <View style={{ paddingHorizontal: 20 }}>
          <LiveMap
            status={mapStatus(job.status)}
            pickup={job.pickup ?? null}
            mechanic={computeMechanicLive(job, elapsed)}
          />
        </View>

        <View style={styles.headline}>
          <Text style={styles.headlineTitle}>{headline}</Text>
          <Text style={styles.headlineSub}>
            {service?.name ?? "Service"} • payout ${job.payout.toFixed(2)}
          </Text>
        </View>

        {/* Customer */}
        <View style={styles.customerRow}>
          <Avatar name={job.customerName} size={52} />
          <View style={{ flex: 1 }}>
            <Text style={styles.customerName}>{job.customerName}</Text>
            <Text style={styles.customerVehicle}>{job.vehicle}</Text>
          </View>
          <ActionBtn icon="phone.fill" onPress={() => fakeCall(job.customerName)} />
          <ActionBtn icon="message.fill" onPress={() => fakeMsg(job.customerName)} />
        </View>

        {/* Address card */}
        <View style={styles.addressCard}>
          <View style={styles.iconBubble}>
            <IconSymbol name="location.fill" size={16} color="#F97316" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.addressLabel}>Pickup location</Text>
            <Text style={styles.addressValue}>{job.location}</Text>
          </View>
        </View>

        {/* Steps */}
        <View style={styles.stepsCard}>
          <Text style={styles.stepsTitle}>Your steps</Text>
          {FLOW.slice(0, -1).map((s, i) => {
            const stepIdx = i;
            const currentIdx = FLOW.indexOf(job.status);
            const done = stepIdx < currentIdx;
            const active = stepIdx === currentIdx;
            return (
              <View key={s} style={{ flexDirection: "row" }}>
                <View style={{ alignItems: "center", width: 22 }}>
                  <View
                    style={[
                      styles.dot,
                      { backgroundColor: done ? "#10B981" : active ? "#F97316" : "#CBD5E1" },
                    ]}
                  >
                    {done ? <IconSymbol name="checkmark" size={10} color="#FFFFFF" /> : null}
                  </View>
                  {i < FLOW.length - 2 ? (
                    <View
                      style={[styles.line, { backgroundColor: done ? "#10B981" : "#E2E8F0" }]}
                    />
                  ) : null}
                </View>
                <View style={{ flex: 1, paddingBottom: 16 }}>
                  <Text style={[styles.stepLabel, active && { color: "#F97316" }]}>
                    {stepLabel(s)}
                  </Text>
                  <Text style={styles.stepDesc}>{stepDesc(s)}</Text>
                </View>
              </View>
            );
          })}
        </View>

        <View style={{ paddingHorizontal: 20, marginTop: 16, gap: 10 }}>
          {nextStatus ? (
            <PrimaryButton
              title={ctaTitle}
              onPress={advance}
              hapticType="success"
              iconRight={<IconSymbol name="arrow.right" size={18} color="#FFFFFF" />}
            />
          ) : null}
          {job.status !== "in_progress" ? (
            <PrimaryButton
              title="Cancel job"
              variant="secondary"
              onPress={handleCancel}
            />
          ) : null}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function ActionBtn({ icon, onPress }: { icon: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
    >
      <IconSymbol name={icon} size={18} color="#FFFFFF" />
    </Pressable>
  );
}

function fakeCall(name: string) {
  haptic.light();
  if (Platform.OS !== "web") Alert.alert("Calling", `Calling ${name}…`);
}
function fakeMsg(name: string) {
  haptic.light();
  if (Platform.OS !== "web") Alert.alert("Message", `Send a message to ${name}.`);
}

function mapStatus(s: MechanicJobStatus): "idle" | "searching" | "enroute" | "arrived" | "in_progress" | "completed" {
  if (s === "heading_there") return "enroute";
  if (s === "arrived") return "arrived";
  if (s === "in_progress") return "in_progress";
  if (s === "completed") return "completed";
  return "idle";
}

const HEADING_DURATION = 20; // seconds for the puck animation along route

function computeMechanicLive(
  job: { pickup?: { latitude: number; longitude: number }; mechanicStart?: { latitude: number; longitude: number }; status: MechanicJobStatus },
  elapsed: number,
) {
  const pickup = job.pickup;
  const start = job.mechanicStart;
  if (!pickup || !start) return null;
  if (job.status === "heading_there") {
    const t = Math.min(1, elapsed / HEADING_DURATION);
    return interpolate(start, pickup, t);
  }
  // arrived / in_progress / completed
  return pickup;
}

function ctaLabel(s: MechanicJobStatus): string {
  switch (s) {
    case "heading_there": return "I've arrived";
    case "arrived": return "Start service";
    case "in_progress": return "Mark complete";
    default: return "Continue";
  }
}

function headlineFor(s: MechanicJobStatus, name: string): string {
  switch (s) {
    case "heading_there": return `Heading to ${name}`;
    case "arrived": return `You've arrived at ${name}'s location`;
    case "in_progress": return "Service in progress";
    case "completed": return "Job complete";
    default: return "";
  }
}

function stepLabel(s: MechanicJobStatus): string {
  switch (s) {
    case "heading_there": return "Heading there";
    case "arrived": return "Arrived";
    case "in_progress": return "Service in progress";
    default: return s;
  }
}
function stepDesc(s: MechanicJobStatus): string {
  switch (s) {
    case "heading_there": return "Drive to the customer location.";
    case "arrived": return "Find the customer and confirm the vehicle.";
    case "in_progress": return "Perform the service.";
    default: return "";
  }
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
  },
  topBack: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "#F5F7FA",
    alignItems: "center", justifyContent: "center",
  },
  topTitle: { fontSize: 16, fontWeight: "800", color: "#0F172A" },
  headline: { paddingHorizontal: 20, marginTop: 18 },
  headlineTitle: { fontSize: 22, fontWeight: "800", color: "#0F172A" },
  headlineSub: { fontSize: 13, color: "#64748B", marginTop: 4 },
  customerRow: {
    marginHorizontal: 20,
    marginTop: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 16,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  customerName: { fontSize: 15, fontWeight: "800", color: "#0F172A" },
  customerVehicle: { fontSize: 12, color: "#64748B", marginTop: 2 },
  actionBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: "#0F172A",
    alignItems: "center", justifyContent: "center",
  },
  addressCard: {
    marginHorizontal: 20,
    marginTop: 12,
    backgroundColor: "#F5F7FA",
    borderRadius: 14,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconBubble: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: "#FFEDD5",
    alignItems: "center", justifyContent: "center",
  },
  addressLabel: { fontSize: 11, color: "#64748B", fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  addressValue: { fontSize: 14, color: "#0F172A", fontWeight: "600", marginTop: 2 },
  stepsCard: {
    marginHorizontal: 20,
    marginTop: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 16,
    padding: 14,
  },
  stepsTitle: { fontSize: 13, color: "#64748B", fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 },
  dot: { width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  line: { width: 2, flex: 1, marginTop: 2 },
  stepLabel: { fontSize: 14, fontWeight: "700", color: "#0F172A" },
  stepDesc: { fontSize: 12, color: "#64748B", marginTop: 2, lineHeight: 17 },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: "#DCFCE7",
    alignItems: "center", justifyContent: "center",
  },
  emptyTitle: { fontSize: 20, fontWeight: "800", color: "#0F172A" },
  emptyText: { fontSize: 14, color: "#64748B", textAlign: "center", lineHeight: 20 },
});
