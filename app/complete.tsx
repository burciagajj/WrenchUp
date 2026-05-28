import { ScrollView, StyleSheet, Text, View, Pressable, TextInput } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScreenContainer } from "@/components/screen-container";
import { useStore, useJob } from "@/lib/store";
import { getMechanic, getServiceType } from "@/lib/seed";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Avatar } from "@/components/avatar";
import { PrimaryButton } from "@/components/primary-button";
import { haptic } from "@/lib/haptics";
import { useAuth } from "@/lib/auth-context";
import { resolveAuthSession } from "@/lib/resolve-auth-session";
import { updateDispatchStatus } from "@/lib/live-dispatch";
import { generateReceiptNumber } from "@/lib/receipt";

const TIP_OPTIONS = [0, 5, 10, 15];

export default function CompleteScreen() {
  const router = useRouter();
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const { dispatch } = useStore();
  const { user } = useAuth();
  const job = useJob(jobId);
  const [rating, setRating] = useState<number>(5);
  const [tip, setTip] = useState<number>(5);
  const [comment, setComment] = useState("");

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
  if (!service) {
    return (
      <ScreenContainer>
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>Service details unavailable.</Text>
        </View>
      </ScreenContainer>
    );
  }

  const mechanicName =
    mechanic?.name || job.mechanicName || "Assigned Mechanic";
  const mechanicPhotoUrl = mechanic?.photoUrl || null;

  const handleSubmit = async () => {
    haptic.success();
    dispatch({
      type: "COMPLETE_JOB",
      payload: { id: job.id, rating, tip, ratingComment: comment.trim() || undefined },
    });
    router.replace("/(tabs)/activity" as any);

    if (job.remoteRequestId && user?.id) {
      const remoteRequestId = job.remoteRequestId;
      void (async () => {
        try {
          const resolved = await resolveAuthSession(user);
          if (resolved) {
            const now = new Date();
            const releaseAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
            await updateDispatchStatus(resolved.sessionToken, remoteRequestId, "completed", {
              receiptNumber: generateReceiptNumber(),
              customerCompletedAt: now.toISOString(),
              paymentState: "ready_for_release",
              disputeWindowEndsAt: releaseAt.toISOString(),
              fundsReleaseAt: releaseAt.toISOString(),
            });
          }
        } catch (error) {
          console.warn("[Complete] Deferred remote completion sync:", error);
        }
      })();
    }
  };

  const total = job.fare.total + tip;

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <IconSymbol name="checkmark.circle.fill" size={48} color="#10B981" />
          </View>
          <Text style={styles.heroTitle}>Service complete</Text>
          <Text style={styles.heroSub}>{service.name} by {mechanicName}</Text>
        </View>

        {/* Receipt */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Receipt</Text>
          <ReceiptRow label="Booking fee" value={job.fare.base} />
          <ReceiptRow label="Service" value={job.fare.service} />
          <ReceiptRow label="Dispatch" value={job.fare.distance} />
          <ReceiptRow label="Tip" value={tip} highlight />
          <View style={styles.divider} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
          </View>
        </View>

        {/* Tip */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Add a tip</Text>
          <View style={styles.tipRow}>
            {TIP_OPTIONS.map((t) => (
              <Pressable
                key={t}
                onPress={() => {
                  haptic.selection();
                  setTip(t);
                }}
                style={({ pressed }) => [
                  styles.tipChip,
                  tip === t && styles.tipChipActive,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text style={[styles.tipText, tip === t && styles.tipTextActive]}>
                  {t === 0 ? "No tip" : `$${t}`}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Rating */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Rate {mechanicName}</Text>
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((s) => (
              <Pressable
                key={s}
                onPress={() => {
                  haptic.selection();
                  setRating(s);
                }}
                hitSlop={6}
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
              >
                <IconSymbol
                  name={s <= rating ? "star.fill" : "star"}
                  size={36}
                  color="#F59E0B"
                />
              </Pressable>
            ))}
          </View>
          <TextInput
            value={comment}
            onChangeText={setComment}
            placeholder="Leave a comment (optional)"
            placeholderTextColor="#94A3B8"
            multiline
            style={styles.input}
            returnKeyType="done"
            blurOnSubmit
          />
        </View>

        <View style={{ paddingHorizontal: 20, marginTop: 12 }}>
          <Avatar name={mechanicName} url={mechanicPhotoUrl ?? undefined} size={48} />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton title="Submit & Done" onPress={handleSubmit} hapticType="success" />
      </View>
    </ScreenContainer>
  );
}

function ReceiptRow({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <View style={styles.receiptRow}>
      <Text style={styles.receiptLabel}>{label}</Text>
      <Text style={[styles.receiptValue, highlight && { color: "#F97316", fontWeight: "800" }]}>
        ${value.toFixed(2)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", paddingTop: 24, paddingBottom: 10 },
  heroIcon: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: "#DCFCE7",
    alignItems: "center", justifyContent: "center",
    marginBottom: 10,
  },
  heroTitle: { fontSize: 24, fontWeight: "800", color: "#0F172A" },
  heroSub: { fontSize: 14, color: "#64748B", marginTop: 4 },
  card: {
    marginHorizontal: 20,
    marginTop: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 16,
    padding: 16,
  },
  cardTitle: { fontSize: 15, fontWeight: "800", color: "#0F172A", marginBottom: 10 },
  receiptRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  receiptLabel: { fontSize: 14, color: "#475569" },
  receiptValue: { fontSize: 14, color: "#0F172A", fontWeight: "600" },
  divider: { height: 1, backgroundColor: "#E2E8F0", marginVertical: 10 },
  totalRow: { flexDirection: "row", justifyContent: "space-between" },
  totalLabel: { fontSize: 16, fontWeight: "800", color: "#0F172A" },
  totalValue: { fontSize: 22, fontWeight: "800", color: "#F97316" },
  tipRow: { flexDirection: "row", gap: 8 },
  tipChip: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: "#F5F7FA",
    borderRadius: 12,
    alignItems: "center",
  },
  tipChipActive: { backgroundColor: "#F97316" },
  tipText: { fontSize: 14, fontWeight: "700", color: "#475569" },
  tipTextActive: { color: "#FFFFFF" },
  starsRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 8, marginBottom: 12 },
  input: {
    backgroundColor: "#F5F7FA",
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: "#0F172A",
    minHeight: 70,
    textAlignVertical: "top",
  },
  footer: {
    position: "absolute",
    left: 0, right: 0, bottom: 0,
    backgroundColor: "#FFFFFF",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E2E8F0",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
  },
  errorWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { fontSize: 16, color: "#64748B" },
});
