import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View, Alert, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { PrimaryButton } from "@/components/primary-button";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useActiveJob, useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth-context";
import { resolveAuthSession } from "@/lib/resolve-auth-session";
import { useLocaleContext, useL } from "@/hooks/use-locale";
import { useMechanicOffers } from "@/hooks/use-mechanic-offers";
import { assignDispatchToMechanic, declineMechanicOffer, fetchDispatchRequest } from "@/lib/live-dispatch";
import { deriveServiceAndFeeFromTotal, QUICK_SERVICE_BOOKING_FEE_RATE } from "@/lib/fare";
import { notifyDispatchEvent } from "@/lib/dispatch-notifications";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { haptic } from "@/lib/haptics";
import type { MechanicOffer } from "@/lib/mechanic-offer";
import type { DispatchRequest } from "@/lib/live-dispatch";
import { safeReplace } from "@/lib/safe-router";
import { usePartsCostProposal } from "@/hooks/use-parts-cost-proposal";
import { PartsCostApprovalCard } from "@/components/parts-cost-approval-card";

export default function MechanicOffersScreen() {
  const router = useRouter();
  const job = useActiveJob();
  const { dispatch, state } = useStore();
  const { user } = useAuth();
  const { region, formatPrice } = useLocaleContext();
  const L = useL();
  const { offers, reload } = useMechanicOffers(job);
  const [pendingMechanicId, setPendingMechanicId] = useState<string | null>(null);
  const redirectedRef = useRef(false);
  const { proposal: partsProposal, reload: reloadPartsProposal } = usePartsCostProposal(job?.remoteRequestId);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  // The customer's card was only ever authorized (Stripe hold placed) for
  // this amount at booking time — it's immutable server-side (see
  // base_offered_price in lib/live-dispatch.ts). A mechanic's offer can
  // propose anything, but Stripe caps capture at this ceiling, so an
  // accepted offer above it can fail to collect later. Fetched once (not on
  // every offers poll) since the baseline never changes for a request.
  const [baseOfferedPrice, setBaseOfferedPrice] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    void resolveAuthSession(user).then((resolved) => {
      if (alive && resolved) setSessionToken(resolved.sessionToken);
    });
    return () => {
      alive = false;
    };
  }, [user]);

  useEffect(() => {
    if (!sessionToken || !job?.remoteRequestId) return;
    let alive = true;
    void fetchDispatchRequest(sessionToken, job.remoteRequestId).then((request) => {
      if (!alive || !request) return;
      const baseline =
        typeof request.base_offered_price === "number" && request.base_offered_price > 0
          ? request.base_offered_price
          : request.offered_price;
      setBaseOfferedPrice(baseline);
    }).catch((err) => {
      console.warn("[MechanicOffers] Could not load authorized price baseline:", err);
    });
    return () => {
      alive = false;
    };
  }, [sessionToken, job?.remoteRequestId]);

  // Once the request has actually been matched (an offer got accepted, here
  // or from another device), there's nothing left to negotiate — move on to
  // the tracking screen. Cancellation is handled separately below: we stay
  // put and show every offer as expired instead of navigating away.
  useEffect(() => {
    if (!job || redirectedRef.current) return;
    if (["accepted", "enroute", "arrived", "in_progress", "completed"].includes(job.status)) {
      redirectedRef.current = true;
      safeReplace("/tracking");
    }
  }, [job?.status]); // eslint-disable-line react-hooks/exhaustive-deps -- only status matters for this redirect

  if (!job) {
    return (
      <ScreenContainer showBackButton title={L("Offers from mechanics", "Ofertas de mecánicos")}>
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>{L("No active request.", "No hay solicitud activa.")}</Text>
        </View>
      </ScreenContainer>
    );
  }

  const tripCancelled = job.status === "cancelled";
  const stillSearching = job.status === "searching";

  const handleAccept = async (offer: MechanicOffer) => {
    if (!job.remoteRequestId || !user?.id || pendingMechanicId) return;
    // The card was only ever authorized up to baseOfferedPrice — Stripe
    // can't capture above that, so warn before locking in an offer that
    // exceeds it instead of only finding out at capture time.
    if (typeof baseOfferedPrice === "number" && offer.proposedTotal > baseOfferedPrice + 0.01) {
      haptic.warning();
      Alert.alert(
        L("Price above what you authorized", "Precio superior al autorizado"),
        L(
          `This offer (${formatPrice(offer.proposedTotal)}) is higher than the ${formatPrice(baseOfferedPrice)} you authorized when booking. If we're unable to collect the difference from your card, we'll follow up with you directly.`,
          `Esta oferta (${formatPrice(offer.proposedTotal)}) es mayor que los ${formatPrice(baseOfferedPrice)} que autorizaste al reservar. Si no podemos cobrar la diferencia con tu tarjeta, te contactaremos directamente.`,
        ),
        [
          { text: L("Cancel", "Cancelar"), style: "cancel" },
          { text: L("Accept anyway", "Aceptar de todos modos"), onPress: () => void doAccept(offer) },
        ],
      );
      return;
    }
    void doAccept(offer);
  };

  const doAccept = async (offer: MechanicOffer) => {
    if (!job.remoteRequestId || !user?.id) return;
    setPendingMechanicId(offer.mechanicUserId);
    try {
      const resolved = await resolveAuthSession(user);
      if (!resolved) {
        Alert.alert(
          L("Connection issue", "Problema de conexión"),
          L("Could not accept the offer right now. Please try again.", "No se pudo aceptar la oferta ahora. Inténtalo de nuevo."),
        );
        return;
      }
      let assigned: DispatchRequest | null = null;
      try {
        assigned = await assignDispatchToMechanic(
          resolved.sessionToken,
          job.remoteRequestId,
          offer.mechanicUserId,
          offer.mechanicName,
          { offeredPrice: offer.proposedTotal },
        );
      } catch (err) {
        console.warn("[MechanicOffers] assign offer failed:", err);
      }
      if (!assigned) {
        haptic.error();
        Alert.alert(
          L("Offer no longer available", "Oferta ya no disponible"),
          L("This mechanic may no longer be available. Try another offer.", "Este mecánico ya no está disponible. Prueba con otra oferta."),
        );
        void reload();
        return;
      }
      void notifyDispatchEvent({
        sessionToken: resolved.sessionToken,
        requestId: job.remoteRequestId,
        event: "customer_accepted_quote",
        initiatorUserId: user.id,
        actorUserId: user.id,
      });
      void trackAnalyticsEvent({
        eventName: "customer_accepted_quote",
        userId: user.id,
        role: "customer",
        sessionToken: resolved.sessionToken,
        properties: {
          request_id: job.remoteRequestId,
          region_code: region,
          service_code: job.service,
          customer_name: state.userName,
          mechanic_name: offer.mechanicName,
          proposed_total: offer.proposedTotal,
        },
      });
      const { service: acceptedService, fee: acceptedFee } = deriveServiceAndFeeFromTotal(offer.proposedTotal);
      dispatch({
        type: "UPDATE_JOB_ASSIGNMENT",
        payload: {
          id: job.id,
          mechanicId: offer.mechanicUserId,
          mechanicName: offer.mechanicName,
          customerQuoteAcceptedAt: Date.now(),
          fare: { service: acceptedService, bookingFee: acceptedFee, total: offer.proposedTotal },
        },
      });
      haptic.success();
      redirectedRef.current = true;
      router.replace("/tracking" as any);
    } catch (error) {
      console.error("[MechanicOffers] accept failed:", error);
      haptic.error();
    } finally {
      setPendingMechanicId(null);
    }
  };

  const handleDecline = (offer: MechanicOffer) => {
    if (!job.remoteRequestId || !user?.id || pendingMechanicId) return;
    Alert.alert(
      L("Decline this offer?", "¿Rechazar esta oferta?"),
      L(
        `We'll keep looking for another mechanic instead of ${offer.mechanicName}.`,
        `Seguiremos buscando otro mecánico en lugar de ${offer.mechanicName}.`,
      ),
      [
        { text: L("Keep offer", "Mantener oferta"), style: "cancel" },
        {
          text: L("Decline", "Rechazar"),
          style: "destructive",
          onPress: async () => {
            setPendingMechanicId(offer.mechanicUserId);
            try {
              const resolved = await resolveAuthSession(user);
              if (!resolved) return;
              await declineMechanicOffer(resolved.sessionToken, job.remoteRequestId!, offer.mechanicUserId);
              haptic.medium();
              await reload();
            } catch (error) {
              console.error("[MechanicOffers] decline failed:", error);
              Alert.alert(
                L("Connection issue", "Problema de conexión"),
                L("Could not decline right now. Please try again.", "No se pudo rechazar ahora. Inténtalo de nuevo."),
              );
            } finally {
              setPendingMechanicId(null);
            }
          },
        },
      ],
    );
  };

  return (
    <ScreenContainer showBackButton title={L("Offers from mechanics", "Ofertas de mecánicos")}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 14 }}>
        {tripCancelled ? (
          <View style={styles.cancelledBanner}>
            <IconSymbol name="exclamationmark.triangle.fill" size={18} color="#F87171" />
            <Text style={styles.cancelledBannerText}>
              {L(
                "This request was cancelled — offers below are no longer available.",
                "Esta solicitud fue cancelada — las ofertas de abajo ya no están disponibles.",
              )}
            </Text>
          </View>
        ) : null}

        {partsProposal && sessionToken && job.remoteRequestId ? (
          <PartsCostApprovalCard
            requestId={job.remoteRequestId}
            partsCost={partsProposal.partsCost}
            currency={partsProposal.currency}
            sessionToken={sessionToken}
            formatPrice={formatPrice}
            onApproved={() => void reloadPartsProposal()}
            onDeclined={() => void reloadPartsProposal()}
          />
        ) : null}

        {offers.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>
              {L("No offers received yet.", "Aún no se han recibido ofertas.")}
            </Text>
          </View>
        ) : (
          offers.map((offer) => {
            const isActive = stillSearching && !tripCancelled && offer.mechanicUserId === job.mechanicId;
            const { fee } = deriveServiceAndFeeFromTotal(offer.proposedTotal);
            const isPending = pendingMechanicId === offer.mechanicUserId;
            return (
              <View
                key={offer.mechanicUserId}
                style={[styles.card, !isActive && styles.cardInactive]}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.mechanicName}>{offer.mechanicName}</Text>
                  {!isActive ? (
                    <View style={styles.expiredBadge}>
                      <Text style={styles.expiredBadgeText}>{L("Expired", "Expirada")}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.priceLine}>
                  {L("Proposed final price", "Precio final propuesto")}: {formatPrice(offer.proposedTotal)}
                </Text>
                <Text style={styles.feeNote}>
                  {L(
                    `Includes a ${Math.round(QUICK_SERVICE_BOOKING_FEE_RATE * 100)}% dispatch fee: ${formatPrice(fee)}`,
                    `Incluye una tarifa de despacho del ${Math.round(QUICK_SERVICE_BOOKING_FEE_RATE * 100)}%: ${formatPrice(fee)}`,
                  )}
                </Text>
                {typeof baseOfferedPrice === "number" && offer.proposedTotal > baseOfferedPrice + 0.01 ? (
                  <Text style={styles.warningNote}>
                    {L(
                      `Above the ${formatPrice(baseOfferedPrice)} you authorized when booking`,
                      `Supera los ${formatPrice(baseOfferedPrice)} que autorizaste al reservar`,
                    )}
                  </Text>
                ) : null}
                {offer.note ? <Text style={styles.noteText}>{offer.note}</Text> : null}
                {isActive ? (
                  <View style={styles.actionsRow}>
                    <Pressable
                      onPress={() => handleDecline(offer)}
                      disabled={isPending}
                      style={({ pressed }) => [
                        styles.declineBtn,
                        (isPending || pressed) && { opacity: 0.7 },
                      ]}
                    >
                      <Text style={styles.declineBtnText}>{L("Decline", "Rechazar")}</Text>
                    </Pressable>
                    <View style={{ flex: 1 }}>
                      <PrimaryButton
                        title={L("Accept", "Aceptar")}
                        size="md"
                        loading={isPending}
                        disabled={isPending}
                        hapticType="success"
                        onPress={() => void handleAccept(offer)}
                      />
                    </View>
                  </View>
                ) : (
                  <Text style={styles.unavailableText}>
                    {tripCancelled
                      ? L("This trip was cancelled.", "Este viaje fue cancelado.")
                      : L("This mechanic is no longer available for this request.", "Este mecánico ya no está disponible para esta solicitud.")}
                  </Text>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  emptyWrap: { alignItems: "center", justifyContent: "center", paddingVertical: 60 },
  emptyText: { color: "#CBD5E1", fontSize: 14, fontWeight: "600" },
  cancelledBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(248,113,113,0.12)",
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.4)",
    borderRadius: 12,
    padding: 12,
  },
  cancelledBannerText: { color: "#FCA5A5", fontSize: 12, fontWeight: "700", flex: 1, lineHeight: 17 },
  card: {
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 16,
    padding: 14,
    gap: 6,
  },
  cardInactive: {
    backgroundColor: "#1E293B",
    borderColor: "#475569",
    opacity: 0.85,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  mechanicName: { color: "#F8FAFC", fontSize: 15, fontWeight: "900" },
  expiredBadge: {
    backgroundColor: "rgba(148,163,184,0.18)",
    borderWidth: 1,
    borderColor: "#64748B",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  expiredBadgeText: { color: "#CBD5E1", fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  priceLine: { color: "#FDBA74", fontSize: 14, fontWeight: "900" },
  feeNote: { color: "#94A3B8", fontSize: 11 },
  warningNote: { color: "#F59E0B", fontSize: 11, fontWeight: "700", marginTop: 2 },
  noteText: { color: "#E2E8F0", fontSize: 12, lineHeight: 17 },
  actionsRow: { flexDirection: "row", gap: 10, marginTop: 8, alignItems: "stretch" },
  declineBtn: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#475569",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  declineBtnText: { color: "#F8FAFC", fontSize: 14, fontWeight: "700" },
  unavailableText: { color: "#94A3B8", fontSize: 12, marginTop: 6, fontStyle: "italic" },
});
