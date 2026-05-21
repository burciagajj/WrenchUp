import { ScrollView, StyleSheet, Text, View, Pressable } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { getMechanic, getServiceType } from "@/lib/seed";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Avatar } from "@/components/avatar";
import { PrimaryButton } from "@/components/primary-button";
import { computeFare } from "@/lib/fare";
import { useStore, useSelectedVehicle } from "@/lib/store";
import { haptic } from "@/lib/haptics";
import type { Job } from "@/lib/types";
import { mechanicCoords } from "@/lib/geo";
import { DEFAULT_COORDS } from "@/lib/seed";
import { useLocaleContext } from "@/hooks/use-locale";
import { localizedServiceName } from "@/lib/service-i18n";
import { StripePaymentSheet } from "@/components/stripe-payment-sheet";
import { usePaymentSheet } from "@/hooks/use-payment-sheet";
import { amountToStripeAmount, getCurrencyForRegion } from "@/lib/stripe";
import { useEffect, useState } from "react";
import { Platform, TextInput } from "react-native";

export default function ConfirmScreen() {
  const router = useRouter();
  const { mechanicId, service } = useLocalSearchParams<{ mechanicId: string; service: string }>();
  const { state, dispatch } = useStore();
  const vehicle = useSelectedVehicle();
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<string | null>(
    state.defaultPaymentMethodId
  );
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [showPriceEdit, setShowPriceEdit] = useState(false);
  const [claudeAnalysis, setClaudeAnalysis] = useState<string | null>(null);
  const [claudeLoading, setClaudeLoading] = useState(false);

  const mechanic = typeof mechanicId === "string" ? getMechanic(mechanicId) : undefined;
  const serviceType = typeof service === "string" ? getServiceType(service) : undefined;
  const { t, locale, formatPrice, region } = useLocaleContext();
  const paymentSheet = usePaymentSheet();
  useEffect(() => {
    const analyze = async () => {
      console.log("Claude analyzing...", vehicle, serviceType, fare.total);
      if (!vehicle || !serviceType) {
        console.log("Missing vehicle or serviceType!");
        return;
      }
      setClaudeLoading(true);
      try {
        const response = await fetch("/api/claude", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-5",
            max_tokens: 300,
            messages: [{
              role: "user",
              content: `Vehicle: ${vehicle.year} ${vehicle.make} ${vehicle.model}. Service needed: ${serviceType.code}. Estimated price: $${fare.total}. In 2-3 short sentences, tell the customer if this price is fair and what to expect. Be friendly and simple.`
            }]
          })
        });
        const data = await response.json();
        console.log("Full Claude response:", JSON.stringify(data));
if (data.content && data.content[0] && data.content[0].text) {
  setClaudeAnalysis(data.content[0].text);
} else if (data.error) {
  console.error("Claude API error:", data.error);
} else {
  console.log("Unexpected response:", data);
}
      } catch (err) {
        console.error("Claude error:", err);
      } finally {
        setClaudeLoading(false);
      }
    };
    analyze();
  }, [vehicle?.id, serviceType?.code]);

  if (!mechanic || !serviceType) {
    return (
      <ScreenContainer>
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>Booking details unavailable.</Text>
        </View>
      </ScreenContainer>
    );
  }

  const fare = computeFare(mechanic, serviceType);
  const [editedPrice, setEditedPrice] = useState<string>(
    fare && fare.total ? fare.total.toFixed(2) : ""
  );

  const handleConfirmPayment = async (methodId: string) => {
    if (!vehicle) {
      haptic.error();
      setPaymentError("Vehicle not selected");
      return;
    }
    try {
      setPaymentError(null);
      dispatch({
        type: "SET_PAYMENT_STATUS",
        payload: { status: "processing" },
      });

      // On native we attempt PaymentSheet first. If the backend PaymentIntent
      // procedure is not wired yet (`backend_pending`), we transparently fall
      // back to the saved-card flow so the booking still completes.
      if (Platform.OS !== "web") {
        const currency = getCurrencyForRegion(region);
        const result = await paymentSheet.present({
          amount: amountToStripeAmount(fare.total, currency),
          currency,
        });
        if (result.status === "canceled") {
          dispatch({ type: "SET_PAYMENT_STATUS", payload: { status: "idle" } });
          return;
        }
        if (result.status === "failed") {
          haptic.error();
          setPaymentError(result.message);
          dispatch({
            type: "SET_PAYMENT_STATUS",
            payload: { status: "error", error: result.message },
          });
          return;
        }
        // "completed" / "unsupported" / "backend_pending" all proceed below.
      }

      // Simulated charge until the backend PaymentIntent endpoint is in place.
      await new Promise((resolve) => setTimeout(resolve, 600));

      haptic.success();
      const pickup = state.userCoords ?? DEFAULT_COORDS;
      const start = mechanicCoords(mechanic, pickup);
      // Use edited price if provided, otherwise use calculated fare
      const finalPrice = editedPrice && parseFloat(editedPrice) > 0 ? parseFloat(editedPrice) : fare.total;
      const adjustedFare = { ...fare, total: finalPrice };
      
      const job: Job = {
        id: `j_${Date.now()}`,
        mechanicId: mechanic.id,
        vehicleId: vehicle.id,
        service: serviceType.code,
        location: state.defaultLocation,
        status: "searching",
        createdAt: Date.now(),
        fare: adjustedFare,
        pickup,
        mechanicStart: start,
        paymentMethodId: methodId,
      };
      dispatch({ type: "CREATE_JOB", payload: job });
      dispatch({
        type: "SET_PAYMENT_STATUS",
        payload: { status: "success" },
      });
      router.replace("/tracking" as any);
    } catch (err) {
      haptic.error();
      const message = err instanceof Error ? err.message : "Payment failed";
      setPaymentError(message);
      dispatch({
        type: "SET_PAYMENT_STATUS",
        payload: { status: "error", error: message },
      });
    }
  };

  const handleAddPaymentMethod = () => {
    router.push("/payment-methods" as any);
  };

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
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
          <Text style={styles.headerTitle}>{t("confirm.title")}</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Mechanic card */}
        <View style={styles.card}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Avatar name={mechanic.name} url={mechanic.photoUrl} size={56} />
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{mechanic.name}</Text>
              <Text style={styles.cardSub}>
                {t("mechanic.eta")} {mechanic.etaMinutes} {t("common.minutes_short")} • {mechanic.distanceMiles.toFixed(1)} {t("common.miles_short")}
              </Text>
            </View>
          </View>
        </View>

        {/* Detail rows */}
        <View style={styles.card}>
          <DetailRow icon="wrench.fill" label={t("confirm.service")} value={localizedServiceName(serviceType.code, locale)} />
          <Divider />
          <DetailRow
            icon="car.fill"
            label={t("confirm.vehicle")}
            value={vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : t("home.no_vehicle")}
          />
          <Divider />
          <DetailRow icon="location.fill" label={t("confirm.location")} value={state.defaultLocation} />
          <Divider />
        </View>
        {/* Claude AI Analysis */}
<View style={[styles.card, { borderColor: "#F97316", backgroundColor: "#FFF7ED" }]}>
  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
    <Text style={{ fontSize: 13, fontWeight: "800", color: "#F97316" }}>⚡ Powered by Claude AI</Text>
  </View>
  {claudeLoading ? (
    <Text style={{ fontSize: 13, color: "#64748B" }}>Analyzing your service...</Text>
  ) : (
    <Text style={{ fontSize: 13, color: "#475569", lineHeight: 20 }}>{claudeAnalysis}</Text>
  )}
</View>
        {/* Price Edit Section */}
        <View style={styles.card}>
          <Pressable
            onPress={() => setShowPriceEdit(!showPriceEdit)}
            style={({ pressed }) => ({
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text style={styles.priceEditLabel}>Adjust Price (Optional)</Text>
            <IconSymbol
              name={showPriceEdit ? "chevron.up" : "chevron.down"}
              size={20}
              color="#F97316"
            />
          </Pressable>
          {showPriceEdit && (
            <View style={{ marginTop: 12 }}>
              <Text style={styles.priceEditHint}>
                Suggest a different price. Mechanic will review and accept or counter.
              </Text>
              <View style={styles.priceInputRow}>
                <Text style={styles.currencySymbol}>$</Text>
                <TextInput
                  style={styles.priceInput}
                  placeholder={fare.total?.toFixed(2)}
                  placeholderTextColor="#CBD5E1"
                  value={editedPrice}
                  onChangeText={setEditedPrice}
                  keyboardType="decimal-pad"
                />
              </View>
              <Text style={styles.priceEditNote}>
                Original price: {formatPrice(fare.total || 0)}
              </Text>
            </View>
          )}
        </View>

        {/* Payment Method Selection */}
        <StripePaymentSheet
          amount={Math.round((editedPrice && parseFloat(editedPrice) > 0 ? parseFloat(editedPrice) : (fare?.total || 0)) * 100)}
          currency={locale === "es-MX" ? "mxn" : "usd"}
          savedMethods={state.paymentMethods}
          defaultMethodId={state.defaultPaymentMethodId}
          selectedMethodId={selectedPaymentMethodId}
          onSelectMethod={setSelectedPaymentMethodId}
          onAddNewCard={handleAddPaymentMethod}
          onConfirmPayment={handleConfirmPayment}
          loading={state.paymentStatus === "processing"}
          error={paymentError}
        />
        {/* Fare breakdown */}
        <View style={styles.card}>
          <Text style={styles.fareTitle}>{t("confirm.fare_estimate" as any)}</Text>
          <FareRow label={t("confirm.booking_fee" as any)} value={formatPrice(fare.base)} />
          <FareRow label={`${t("confirm.service" as any)} (${localizedServiceName(serviceType.code, locale)})`} value={formatPrice(fare.service)} />
          <FareRow label={t("confirm.dispatch" as any)} value={formatPrice(fare.distance)} />
          <View style={{ height: 8 }} />
          <Divider />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{t("confirm.estimated_total")}</Text>
            <Text style={styles.totalValue}>{formatPrice(fare.total)}</Text>
          </View>
          <Text style={styles.disclaimer}>{t("confirm.disclaimer")}</Text>
        </View>
      </ScrollView>

      {/* Sticky footer handled by StripePaymentSheet */}
    </ScreenContainer>
  );
}

function DetailRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIcon}>
        <IconSymbol name={icon} size={16} color="#F97316" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue} numberOfLines={2}>{value}</Text>
      </View>
    </View>
  );
}

function FareRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fareRow}>
      <Text style={styles.fareLabel}>{label}</Text>
      <Text style={styles.fareValue}>{value}</Text>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
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
  headerTitle: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  card: {
    marginHorizontal: 20,
    marginTop: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 16,
    padding: 14,
  },
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#0F172A" },
  cardSub: { fontSize: 12, color: "#64748B", marginTop: 2 },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  detailIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FFEDD5",
    alignItems: "center",
    justifyContent: "center",
  },
  detailLabel: { fontSize: 11, color: "#64748B", fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  detailValue: { fontSize: 14, color: "#0F172A", fontWeight: "600", marginTop: 2 },
  divider: { height: 1, backgroundColor: "#E2E8F0", marginVertical: 4 },
  fareTitle: { fontSize: 15, fontWeight: "800", color: "#0F172A", marginBottom: 8 },
  fareRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  fareLabel: { fontSize: 13, color: "#475569" },
  fareValue: { fontSize: 13, color: "#0F172A", fontWeight: "600" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  totalLabel: { fontSize: 15, fontWeight: "800", color: "#0F172A" },
  totalValue: { fontSize: 20, fontWeight: "800", color: "#F97316" },
  disclaimer: { fontSize: 11, color: "#64748B", marginTop: 10, lineHeight: 16 },
  priceEditLabel: { fontSize: 14, fontWeight: "600", color: "#0F172A" },
  priceEditHint: { fontSize: 12, color: "#64748B", marginBottom: 12, lineHeight: 16 },
  priceInputRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  currencySymbol: { fontSize: 18, fontWeight: "700", color: "#0F172A" },
  priceInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: "#0F172A",
    fontWeight: "600",
  },
  priceEditNote: { fontSize: 11, color: "#94A3B8", fontStyle: "italic" },
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
  errorWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { fontSize: 16, color: "#64748B" },
});
