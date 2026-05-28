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
import { useAuth } from "@/lib/auth-context";
import { resolveAuthSession } from "@/lib/resolve-auth-session";
import { createDispatchRequest } from "@/lib/live-dispatch";
import { getApiUrl } from "@/lib/api-base-url";
import { formatDistanceByRegion } from "@/lib/distance";
import { buildVehicleLabel } from "@/lib/vehicle-label";

type AIPricing = {
  partsSubtotal: number;
  note: string;
};

export default function ConfirmScreen() {
  const router = useRouter();
  const { mechanicId, service, oilPackage } = useLocalSearchParams<{
    mechanicId: string;
    service: string;
    oilPackage?: "conventional" | "full_synthetic" | "own_oil_filter" | "synthetic_blend";
  }>();
  const { state, dispatch } = useStore();
  const { user } = useAuth();
  const vehicle = useSelectedVehicle();
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<string | null>(
    state.defaultPaymentMethodId
  );
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [showPriceEdit, setShowPriceEdit] = useState(false);
  const [claudeAnalysis, setClaudeAnalysis] = useState<string | null>(null);
  const [claudeLoading, setClaudeLoading] = useState(false);
  const [aiPricing, setAiPricing] = useState<AIPricing | null>(null);
  const [aiPricingReady, setAiPricingReady] = useState(false);

  const mechanicFromParam = typeof mechanicId === "string" ? getMechanic(mechanicId) : undefined;
  const serviceType = typeof service === "string" ? getServiceType(service) : undefined;
  const pricingMechanic = mechanicFromParam ?? {
    id: "unassigned",
    name: "Unassigned",
    photoUrl: "",
    rating: 0,
    jobsCompleted: 0,
    yearsExperience: 0,
    hourlyRate: 0,
    etaMinutes: 12,
    distanceMiles: 1.8,
    vehicle: "",
    bio: "",
    specialties: [],
    certifications: [],
    reviews: [],
    offsetMeters: { east: 220, north: 180 },
  };
  const { t, locale, formatPrice, region } = useLocaleContext();
  const isSpanish = locale === "es-MX";
  const aiEnabled = region !== "MX";
  const feeRate = 0.18; // booking/platform fee
  const paymentSheet = usePaymentSheet();
  const fare = serviceType ? computeFare(pricingMechanic, serviceType, region) : null;
  const oilUpcharge =
    serviceType?.code === "oil_change" ? 0 : 0;
  const partsSubtotal = aiPricing?.partsSubtotal ?? oilUpcharge;
  const subtotalBeforeBookingFee = fare ? fare.base + fare.service + fare.distance + partsSubtotal : 0;
  const bookingFee = +(subtotalBeforeBookingFee * feeRate).toFixed(2);
  const aiEstimatedTotal = +(subtotalBeforeBookingFee + bookingFee).toFixed(2);
  const [editedPrice, setEditedPrice] = useState<string>("0");

  useEffect(() => {
    setEditedPrice(aiEstimatedTotal > 0 ? aiEstimatedTotal.toFixed(2) : "0");
  }, [aiEstimatedTotal, serviceType?.code, vehicle?.id]);

  useEffect(() => {
    const analyze = async () => {
      if (!vehicle || !serviceType || !fare) {
        console.log("Missing vehicle or serviceType!");
        setAiPricingReady(false);
        return;
      }
      if (!aiEnabled) {
        // MX mode: deterministic pricing, no Claude dependency.
        setClaudeLoading(false);
        setAiPricing(null);
        setClaudeAnalysis(null);
        setAiPricingReady(true);
        return;
      }
      setAiPricingReady(false);
      setClaudeLoading(true);
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 9000);
        const response = await fetch(getApiUrl("/api/claude"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01",
          },
          signal: controller.signal,
          body: JSON.stringify({
            model: "claude-sonnet-4-5",
            max_tokens: 250,
            messages: [{
              role: "user",
              content:
                `Return valid JSON only with keys: partsSubtotal (number), note (string).\n` +
                `Vehicle: ${vehicle.year} ${vehicle.make} ${vehicle.model}.\n` +
                `Service: ${serviceType.code}.\n` +
                `Oil package: ${oilPackage ?? "n/a"}.\n` +
                `Base labor+dispatch estimate: ${fare.total}.\n` +
                `Estimate realistic parts-only subtotal for this service (oil/filter/etc).`,
            }]
          })
        });
        clearTimeout(timeoutId);
        const data = await response.json();
        const text = data?.content?.[0]?.text as string | undefined;
        if (text) {
          const cleaned = text.replace(/```json|```/g, "").trim();
          try {
            const parsed = JSON.parse(cleaned) as Partial<AIPricing>;
            const aiParts = Number(parsed.partsSubtotal);
            if (Number.isFinite(aiParts) && aiParts >= 0) {
              setAiPricing({
                partsSubtotal: +aiParts.toFixed(2),
                note: typeof parsed.note === "string" ? parsed.note : "",
              });
              setClaudeAnalysis(typeof parsed.note === "string" ? parsed.note : null);
              return;
            }
          } catch {
            // fall through to default display
          }
          setClaudeAnalysis(cleaned);
        } else if (data.error) {
          console.error("Claude API error:", data.error);
          setClaudeAnalysis(
            isSpanish
              ? "No se pudo estimar con IA. Usando precio base para continuar."
              : "AI estimate unavailable. Using base parts pricing so you can continue."
          );
          setAiPricing({ partsSubtotal: oilUpcharge, note: "fallback" });
        }
      } catch (err) {
        const aborted =
          err instanceof Error &&
          (err.name === "AbortError" || err.message.toLowerCase().includes("aborted"));
        if (!aborted) {
          console.error("Claude error:", err);
        } else {
          console.warn("[Confirm] Claude pricing timed out, using fallback pricing.");
        }
        setClaudeAnalysis(
          isSpanish
            ? "Análisis IA no disponible ahora. Continuamos con precio base."
            : "AI analysis unavailable right now. Continuing with base pricing."
        );
        setAiPricing({ partsSubtotal: oilUpcharge, note: "fallback" });
      } finally {
        setClaudeLoading(false);
        setAiPricingReady(true);
      }
    };
    analyze();
  }, [vehicle?.id, serviceType?.code, oilPackage, fare?.total, aiEnabled]);

  if (!serviceType) {
    return (
      <ScreenContainer>
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>Booking details unavailable.</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (!fare) {
    return (
      <ScreenContainer>
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>Pricing unavailable.</Text>
        </View>
      </ScreenContainer>
    );
  }

  const handleConfirmPayment = async (methodId: string) => {
    if (!vehicle) {
      haptic.error();
      setPaymentError("Vehicle not selected");
      return;
    }
    if (aiEnabled && (!aiPricingReady || claudeLoading)) {
      haptic.light();
      setPaymentError(
        isSpanish
          ? "La IA aún está calculando el precio de refacciones para este vehículo. Intenta en unos segundos."
          : "AI is still pricing parts for this vehicle. Please try again in a few seconds."
      );
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
          amount: amountToStripeAmount(aiEstimatedTotal, currency),
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
      const start = mechanicCoords(pricingMechanic, pickup);
      // Use edited price if provided, otherwise use calculated fare
      const finalPrice = editedPrice && parseFloat(editedPrice) > 0 ? parseFloat(editedPrice) : aiEstimatedTotal;
      const adjustedFare = { ...fare, total: finalPrice };
      const platformFeeAmount = +(finalPrice * feeRate).toFixed(2);
      const mechanicPayout = +(finalPrice - platformFeeAmount).toFixed(2);
      
      let remoteRequestId: string | undefined;
      if (user?.id) {
        try {
          const resolved = await resolveAuthSession(user);
          if (resolved) {
            const request = await createDispatchRequest(resolved.sessionToken, {
              customerUserId: user.id,
              customerName: state.userName,
              customerPhotoUrl: state.photoUrl ?? null,
              serviceCode: serviceType.code,
              vehicleLabel: vehicle ? buildVehicleLabel(vehicle) : "Vehicle",
              locationLabel: state.defaultLocation,
              offeredPrice: finalPrice,
              oilPackage:
                serviceType.code === "oil_change"
                  ? (oilPackage === "conventional" || oilPackage === "full_synthetic" ? oilPackage : null)
                  : null,
              platformFeeRate: feeRate,
              platformFeeAmount,
              mechanicPayout,
              currency: region === "MX" ? "MXN" : "USD",
              regionCode: region,
            });
            remoteRequestId = request.id;
          }
        } catch (error) {
          console.error("[Confirm] Failed to create live dispatch request:", error);
        }
      }

      const job: Job = {
        id: `j_${Date.now()}`,
        mechanicId: mechanicFromParam?.id ?? "unassigned",
        vehicleId: vehicle.id,
        service: serviceType.code,
        location: state.defaultLocation,
        status: "searching",
        createdAt: Date.now(),
        remoteRequestId,
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
      router.replace("/request-pending" as any);
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

  const handleAddTestCard = () => {
    const id = `pm_test_4242_${Date.now()}`;
    const testCard = {
      id,
      type: "card" as const,
      card: {
        brand: "visa",
        last4: "4242",
        expMonth: 12,
        expYear: 2034,
      },
      billingDetails: {
        name: state.userName || "Customer",
        email: user?.email?.trim() || "customer.test@wrenchup.app",
      },
    };
    dispatch({ type: "ADD_PAYMENT_METHOD", payload: testCard });
    dispatch({ type: "SET_DEFAULT_PAYMENT_METHOD", payload: id });
    setSelectedPaymentMethodId(id);
    setPaymentError(null);
    haptic.success();
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

        {mechanicFromParam ? (
          <View style={styles.card}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Avatar name={mechanicFromParam.name} url={mechanicFromParam.photoUrl} size={56} />
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{mechanicFromParam.name}</Text>
                <Text style={styles.cardSub}>
                  {t("mechanic.eta")} {mechanicFromParam.etaMinutes} {t("common.minutes_short")} • {formatDistanceByRegion(mechanicFromParam.distanceMiles, region)}
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* Detail rows */}
        <View style={styles.card}>
          <DetailRow icon="wrench.fill" label={t("confirm.service")} value={localizedServiceName(serviceType.code, locale)} />
          {serviceType.code === "oil_change" ? (
            <>
              <Divider />
              <DetailRow
                icon="drop.fill"
                label={isSpanish ? "Aceite" : "Oil"}
                value={
                  oilPackage === "conventional"
                    ? (isSpanish ? "Convencional + filtro" : "Conventional + filter")
                    : oilPackage === "own_oil_filter"
                      ? (isSpanish ? "Tengo mi propio aceite y filtro" : "I have my own oil and filter")
                      : (isSpanish ? "Sintético completo + filtro" : "Full Synthetic + filter")
                }
              />
            </>
          ) : null}
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
        {/* Claude AI Analysis (hidden in MX mode) */}
        {aiEnabled ? (
          <View style={[styles.card, { borderColor: "#F97316", backgroundColor: "#FFF7ED" }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: "800", color: "#F97316" }}>⚡ Powered by Claude AI</Text>
            </View>
            {claudeLoading ? (
              <Text style={{ fontSize: 13, color: "#64748B" }}>
                {isSpanish ? "Analizando vehículo y ajustando refacciones..." : "Analyzing vehicle and adjusting parts pricing..."}
              </Text>
            ) : (
              <Text style={{ fontSize: 13, color: "#475569", lineHeight: 20 }}>{claudeAnalysis}</Text>
            )}
          </View>
        ) : null}
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
                  placeholder={aiEstimatedTotal.toFixed(2)}
                  placeholderTextColor="#CBD5E1"
                  value={editedPrice}
                  onChangeText={setEditedPrice}
                  keyboardType="decimal-pad"
                />
              </View>
              <Text style={styles.priceEditNote}>
                Original price: {formatPrice(aiEstimatedTotal || 0)}
              </Text>
            </View>
          )}
        </View>

        {/* Payment Method Selection */}
        <View style={[styles.card, { borderColor: "#FDBA74", backgroundColor: "#FFF7ED" }]}>
          <Text style={{ color: "#9A3412", fontSize: 12, lineHeight: 18 }}>
            By continuing with payment, you agree to the Terms of Service and Privacy Policy.
          </Text>
          <View style={{ marginTop: 8, flexDirection: "row", gap: 16 }}>
            <Pressable onPress={() => router.push("/legal/terms" as any)}>
              <Text style={{ color: "#C2410C", fontSize: 12, fontWeight: "700" }}>Terms of Service</Text>
            </Pressable>
            <Pressable onPress={() => router.push("/legal/privacy" as any)}>
              <Text style={{ color: "#C2410C", fontSize: 12, fontWeight: "700" }}>Privacy Policy</Text>
            </Pressable>
          </View>
        </View>

        {/* Payment Method Selection */}
        <StripePaymentSheet
          amount={Math.round((editedPrice && parseFloat(editedPrice) > 0 ? parseFloat(editedPrice) : aiEstimatedTotal) * 100)}
          currency={region === "MX" ? "mxn" : "usd"}
          savedMethods={state.paymentMethods}
          defaultMethodId={state.defaultPaymentMethodId}
          selectedMethodId={selectedPaymentMethodId}
          onSelectMethod={setSelectedPaymentMethodId}
          onAddNewCard={handleAddPaymentMethod}
          onAddTestCard={handleAddTestCard}
          onConfirmPayment={handleConfirmPayment}
          loading={state.paymentStatus === "processing" || (aiEnabled && (claudeLoading || !aiPricingReady))}
          error={paymentError}
        />
        {/* Fare breakdown */}
        <View style={styles.card}>
          <Text style={styles.fareTitle}>{t("confirm.fare_estimate" as any)}</Text>
          <FareRow label={`${t("confirm.service" as any)} (${localizedServiceName(serviceType.code, locale)})`} value={formatPrice(fare.service)} />
          <FareRow
            label={t("confirm.dispatch" as any, {
              distance: region === "MX" ? (pricingMechanic.distanceMiles * 1.60934).toFixed(1) : pricingMechanic.distanceMiles.toFixed(1),
              unit: region === "MX" ? t("common.km_short") : t("common.miles_short"),
            })}
            value={formatPrice(fare.distance)}
          />
          <FareRow label={aiEnabled ? (isSpanish ? "Refacciones (IA)" : "Parts (AI)") : (isSpanish ? "Refacciones" : "Parts")} value={formatPrice(partsSubtotal)} />
          <FareRow label={isSpanish ? "Reserva (18%)" : "Booking fee (18%)"} value={formatPrice(bookingFee)} />
          <View style={{ height: 8 }} />
          <Divider />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{t("confirm.estimated_total")}</Text>
            <Text style={styles.totalValue}>{formatPrice(aiEstimatedTotal)}</Text>
          </View>
          <Text style={[styles.disclaimer, { marginTop: 6 }]}>
            {isSpanish
              ? `Comisión de plataforma ${Math.round(feeRate * 100)}% incluida en el total.`
              : `Platform fee ${Math.round(feeRate * 100)}% is included in this total.`}
          </Text>
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
