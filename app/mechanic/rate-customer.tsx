import { ScrollView, StyleSheet, Text, View, Pressable, TextInput } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScreenContainer } from "@/components/screen-container";
import { useStore } from "@/lib/store";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Avatar } from "@/components/avatar";
import { PrimaryButton } from "@/components/primary-button";
import { haptic } from "@/lib/haptics";
import { useAuth } from "@/lib/auth-context";
import { useLocaleContext, useL } from "@/hooks/use-locale";
import { resolveAuthSession } from "@/lib/resolve-auth-session";
import { updateDispatchRequest } from "@/lib/live-dispatch";
import { trackAnalyticsEvent } from "@/lib/analytics";

/** Mechanic's side of the two-way rating flow — mirrors app/complete.tsx (the
 * customer rating the mechanic), just without the tip/payout-release steps
 * since those are the customer's responsibility on their own screen. */
export default function RateCustomerScreen() {
  const router = useRouter();
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const { state, dispatch } = useStore();
  const { user } = useAuth();
  const { region } = useLocaleContext();
  const L = useL();
  const [rating, setRating] = useState<number>(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const job = state.mechanicJobs.find((j) => j.id === jobId);

  if (!job) {
    return (
      <ScreenContainer>
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>{L("Job not found.", "Trabajo no encontrado.")}</Text>
        </View>
      </ScreenContainer>
    );
  }

  const finish = () => router.replace("/(tabs)" as any);

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    haptic.success();
    try {
      if (job.remoteRequestId && user?.id) {
        const resolved = await resolveAuthSession(user);
        if (resolved) {
          await updateDispatchRequest(resolved.sessionToken, job.remoteRequestId, {
            customer_rating: rating,
            customer_rating_comment: comment.trim() || null,
          });
          void trackAnalyticsEvent({
            eventName: "review_submitted",
            userId: user.id,
            role: "mechanic",
            sessionToken: resolved.sessionToken,
            properties: {
              request_id: job.remoteRequestId,
              region_code: region,
              service_code: job.service,
              rating,
              comment_length: comment.trim().length,
            },
          });
        }
      }
      dispatch({
        type: "RATE_CUSTOMER",
        payload: { id: job.id, customerRating: rating, customerRatingComment: comment.trim() || undefined },
      });
    } catch (error) {
      console.warn("[RateCustomer] Failed to submit rating:", error);
    } finally {
      finish();
    }
  };

  const handleSkip = () => {
    haptic.light();
    finish();
  };

  return (
    <ScreenContainer showBackButton title={L("Rate customer", "Calificar cliente")}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <IconSymbol name="checkmark.circle.fill" size={48} color="#10B981" />
          </View>
          <Text style={styles.heroTitle}>{L("Job done!", "¡Trabajo terminado!")}</Text>
          <Text style={styles.heroSub}>
            {L("How was working with", "¿Cómo fue trabajar con")} {job.customerName}?
          </Text>
        </View>

        <View style={{ paddingHorizontal: 20, marginTop: 8, alignItems: "center" }}>
          <Avatar name={job.customerName} url={job.customerPhotoUrl ?? undefined} size={56} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {L("Rate", "Calificar a")} {job.customerName}
          </Text>
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
                <IconSymbol name={s <= rating ? "star.fill" : "star"} size={36} color="#F59E0B" />
              </Pressable>
            ))}
          </View>
          <TextInput
            value={comment}
            onChangeText={setComment}
            placeholder={L("Leave a comment (optional)", "Deja un comentario (opcional)")}
            placeholderTextColor="#94A3B8"
            multiline
            style={styles.input}
            returnKeyType="done"
            blurOnSubmit
          />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton title={L("Submit rating", "Enviar calificación")} onPress={handleSubmit} hapticType="success" />
        <Pressable onPress={handleSkip} style={{ marginTop: 10, alignItems: "center" }}>
          <Text style={styles.skipText}>{L("Skip", "Omitir")}</Text>
        </Pressable>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", paddingTop: 24, paddingBottom: 10 },
  heroIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  heroTitle: { fontSize: 24, fontWeight: "800", color: "#0F172A" },
  heroSub: { fontSize: 14, color: "#64748B", marginTop: 4, textAlign: "center", paddingHorizontal: 24 },
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
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#FFFFFF",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E2E8F0",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
  },
  skipText: { fontSize: 13, fontWeight: "700", color: "#94A3B8" },
  errorWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { fontSize: 16, color: "#64748B" },
});
