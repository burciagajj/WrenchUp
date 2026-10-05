import { ScrollView, StyleSheet, Text, View, Pressable, TextInput, Alert } from "react-native";
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
import * as LocalAuthentication from "expo-local-authentication";
import { useLocaleContext, useL } from "@/hooks/use-locale";
import { resolveAuthSession } from "@/lib/resolve-auth-session";
import { updateDispatchStatus } from "@/lib/live-dispatch";
import { DISPUTE_WINDOW_MS } from "@/lib/payout-split-core";
import { generateReceiptNumber } from "@/lib/receipt";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { useTapGuard } from "@/hooks/use-tap-guard";

const TIP_OPTIONS = [0, 5, 10, 15];

export default function CompleteScreen() {
  const router = useRouter();
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const { dispatch } = useStore();
  const { user } = useAuth();
  const job = useJob(jobId);
  const L = useL();
  const { region } = useLocaleContext();
  const [rating, setRating] = useState<number>(5);
  const [tip, setTip] = useState<number>(5);
  const [comment, setComment] = useState("");
  const guardSubmit = useTapGuard();

  if (!job) {
    return (
      <ScreenContainer>
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>{L("Job not found.", "Trabajo no encontrado.")}</Text>
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
          <Text style={styles.errorText}>{L("Service details unavailable.", "Detalles del servicio no disponibles.")}</Text>
        </View>
      </ScreenContainer>
    );
  }

  const mechanicName =
    mechanic?.name || job.mechanicName || "Assigned Mechanic";
  const mechanicPhotoUrl = mechanic?.photoUrl || null;

  const handleSubmit = guardSubmit(async () => {
    haptic.success();

    // Extra authentication: biometric gate before final payout release (protects both parties)
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      if (hasHardware) {
        const res = await LocalAuthentication.authenticateAsync({
          promptMessage: L("Verify to release mechanic payout", "Verifica para liberar el pago del mecánico"),
          fallbackLabel: L("Use passcode", "Usar código"),
        });
        if (!res.success) {
          Alert.alert(L("Authentication required", "Autenticación requerida"), L("Biometric confirmation needed to complete.", "Se necesita confirmación biométrica para completar."));
          return;
        }
      }
    } catch {}

    if (job.remoteRequestId && user?.id) {
      const remoteRequestId = job.remoteRequestId;
      // Awaited (not fire-and-forget) so the tap guard above stays engaged
      // until this completes — otherwise handleSubmit would return early and
      // a rapid re-tap could re-enter mid-network-call.
      await (async () => {
        try {
          const resolved = await resolveAuthSession(user);
          if (!resolved) {
            Alert.alert(
              L("Connection issue", "Problema de conexión"),
              L("Could not confirm completion right now. Please try again.", "No se pudo confirmar la finalización ahora. Inténtalo de nuevo."),
            );
            return;
          }
          const now = new Date();
          // Charge the customer's card right away (funds_release_at = now) and
          // pay the mechanic a deposit; the rest of their payout is released
          // when the dispute window closes — see lib/payout-split-core.ts.
          const disputeWindowEndsAt = new Date(now.getTime() + DISPUTE_WINDOW_MS);
          const synced = await updateDispatchStatus(resolved.sessionToken, remoteRequestId, "completed", {
            receiptNumber: generateReceiptNumber(),
            customerCompletedAt: now.toISOString(),
            paymentState: "ready_for_release",
            disputeWindowEndsAt: disputeWindowEndsAt.toISOString(),
            fundsReleaseAt: now.toISOString(),
            rating,
            tip,
            ratingComment: comment.trim() || null,
          });
          if (!synced.ok) {
            Alert.alert(
              L("Connection issue", "Problema de conexión"),
              L("Could not confirm completion right now. Please try again.", "No se pudo confirmar la finalización ahora. Inténtalo de nuevo."),
            );
            return;
          }
          if (synced.degraded) {
            // Completion itself saved, but some fields (rating/tip/comment/etc)
            // didn't persist — surface this instead of silently proceeding as
            // if everything was recorded. Non-blocking: the job still completes.
            console.warn("[Complete] Completion synced with dropped fields:", synced.droppedFields);
            Alert.alert(
              L("Rating may not have saved", "Es posible que la calificación no se haya guardado"),
              L(
                "Your trip is marked complete, but we couldn't confirm your rating/tip were saved. You can add them again from your trip history.",
                "Tu viaje está marcado como completo, pero no pudimos confirmar que tu calificación/propina se guardaron. Puedes agregarlas de nuevo desde tu historial de viajes.",
              ),
            );
          }
          // This action serves as the customer's final confirmation that the mechanic completed the work satisfactorily.
          // Only after this step should the mechanic receive payout.
          dispatch({
            type: "COMPLETE_JOB",
            payload: { id: job.id, rating, tip, ratingComment: comment.trim() || undefined },
          });
          void (async () => {
            try {
              if (resolved) {
                void trackAnalyticsEvent({
                  eventName: "review_submitted",
                  userId: user?.id ?? null,
                  role: "customer",
                  sessionToken: resolved.sessionToken,
                  properties: {
                    request_id: job.remoteRequestId ?? job.id,
                    region_code: region,
                    service_code: job.service,
                    rating,
                    tip_amount: tip,
                    comment_length: comment.trim().length,
                  },
                });
              }
            } catch (error) {
              console.warn("[Complete] Review analytics tracking failed:", error);
            }
          })();
          router.replace("/(tabs)/activity" as any);
        } catch (error) {
          console.warn("[Complete] Deferred remote completion sync:", error);
          Alert.alert(
            L("Connection issue", "Problema de conexión"),
            L("Could not confirm completion right now. Please try again.", "No se pudo confirmar la finalización ahora. Inténtalo de nuevo."),
          );
        }
      })();
    } else {
      dispatch({
        type: "COMPLETE_JOB",
        payload: { id: job.id, rating, tip, ratingComment: comment.trim() || undefined },
      });
      void (async () => {
        try {
          void trackAnalyticsEvent({
            eventName: "review_submitted",
            userId: user?.id ?? null,
            role: "customer",
            properties: {
              request_id: job.remoteRequestId ?? job.id,
              region_code: region,
              service_code: job.service,
              rating,
              tip_amount: tip,
              comment_length: comment.trim().length,
            },
          });
        } catch (error) {
          console.warn("[Complete] Review analytics tracking failed:", error);
        }
      })();
      router.replace("/(tabs)/activity" as any);
    }
  });

  const total = job.fare.total + tip;

  return (
    <ScreenContainer showBackButton title="Service complete">
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <IconSymbol name="checkmark.circle.fill" size={48} color="#10B981" />
          </View>
          <Text style={styles.heroTitle}>{L("Service complete", "Servicio completado")}</Text>
          <Text style={styles.heroSub}>{service.name} by {mechanicName}</Text>
        </View>

        {/* Receipt */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Receipt</Text>
          <ReceiptRow label="Service" value={job.fare.service} />
          <ReceiptRow
            label={`Dispatch fee (${Math.round((job.fare.bookingFee / job.fare.service) * 100)}%)`}
            value={job.fare.bookingFee}
          />
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

        <View style={{ paddingHorizontal: 20, marginTop: 8 }}>
          <Text style={{ fontSize: 11, color: "#64748B", textAlign: "center", lineHeight: 15 }}>
            {L("This final confirmation charges your card and pays your mechanic a deposit now. The rest is released after 2 hours. If something is wrong, open a dispute from your Activity within that time.", "Esta confirmación final cobra tu tarjeta y le paga un adelanto al mecánico ahora. El resto se libera después de 2 horas. Si algo está mal, abre una disputa desde tu Actividad dentro de ese tiempo.")}
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton 
          title={L("Confirm Completion & Submit Review", "Confirmar finalización y enviar reseña")} 
          onPress={handleSubmit} 
          hapticType="success" 
        />
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
