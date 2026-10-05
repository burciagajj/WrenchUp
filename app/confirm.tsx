import { Alert, ScrollView, StyleSheet, Text, View, Pressable, TextInput, Platform } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import Constants from "expo-constants";
import { ScreenContainer } from "@/components/screen-container";
import { getMechanic, getServiceType } from "@/lib/seed";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Avatar } from "@/components/avatar";
import { computeFare, deriveServiceAndFeeFromTotal, QUICK_SERVICE_BOOKING_FEE_RATE } from "@/lib/fare";
import { useStore, useSelectedVehicle } from "@/lib/store";
import { haptic } from "@/lib/haptics";
import { safeReplace } from "@/lib/safe-router";
import type { Job } from "@/lib/types";
import { mechanicCoords } from "@/lib/geo";
import { useLocaleContext, useL } from "@/hooks/use-locale";
import { localizedServiceName } from "@/lib/service-i18n";
import { StripePaymentSheet } from "@/components/stripe-payment-sheet";
import { usePaymentSheet } from "@/hooks/use-payment-sheet";
import { amountToStripeAmount, getCurrencyForRegion } from "@/lib/stripe";
import { useState, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import * as LocalAuthentication from "expo-local-authentication";
import { resolveAuthSession } from "@/lib/resolve-auth-session";
import { cancelBlockingCustomerRequest, findBlockingCustomerJob } from "@/lib/active-customer-job";
import { createDispatchRequest } from "@/lib/live-dispatch";
import { verifyPaymentBeforeDispatch } from "@/lib/payment-verification";
import { formatDistanceByRegion } from "@/lib/distance";
import { buildVehicleLabel } from "@/lib/vehicle-label";
import { resolveServiceLocationLabel } from "@/lib/location-label";
import { supabaseUserData } from "@/lib/_core/supabase-user-data";
import { shouldUseMockPayments } from "@/lib/mock-payments";
import { formatEditableMoney, parseEditableMoneyInput, normalizeEditableMoneyInput } from "@/lib/money-input";
import { clampPriceToAdjustmentBounds, getPriceAdjustmentBounds } from "@/lib/price-adjustment-core";
import { useColors } from "@/hooks/use-colors";

export default function ConfirmScreen() {
  const router = useRouter();
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
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
    // Pricing no longer has a per-mile component, so this value is unused
    // for the fare — kept only to satisfy the Mechanic type shape.
    distanceMiles: 0,
    vehicle: "",
    bio: "",
    specialties: [],
    certifications: [],
    reviews: [],
    offsetMeters: { east: 220, north: 180 },
  };
  const { t, locale, formatPrice, region, toChargeableAmount } = useLocaleContext();
  const isSpanish = locale === "es-MX";
  const L = useL();
  const feeRate = QUICK_SERVICE_BOOKING_FEE_RATE; // booking/platform fee
  const paymentSheet = usePaymentSheet();
  const runtime = {
    isDev: __DEV__,
    appOwnership: Constants.appOwnership ?? null,
    platform: Platform.OS,
    mockPaymentsFlag: process.env.EXPO_PUBLIC_ENABLE_MOCK_PAYMENTS ?? "",
  };
  // computeFare returns raw USD amounts; toChargeableAmount() is applied at
  // the boundary points below (Stripe amount + values persisted to the
  // dispatch request) — see lib/i18n.ts for why that has to happen there and
  // not here, so formatPrice()'s existing raw-USD-in contract keeps working
  // for every display line on this screen.
  const fare = serviceType ? computeFare(pricingMechanic, serviceType) : null;
  // Parts (e.g. oil/filter cost beyond labor) aren't priced by the app — the
  // mechanic quotes and confirms any parts cost on-site. There used to be a
  // dead "parts upcharge" placeholder here that always evaluated to 0 and
  // showed a misleading "Parts: $0.00" line; removed in favor of the note
  // below the oil package selector instead.
  const bookingFee = fare?.bookingFee ?? 0;
  const estimatedTotal = fare?.total ?? 0;
  const [editedPrice, setEditedPrice] = useState<string>("");
  const parsedEditedPrice = parseEditableMoneyInput(editedPrice);
  const requestedChargeTotal =
    Number.isFinite(parsedEditedPrice) && parsedEditedPrice > 0 ? parsedEditedPrice : estimatedTotal;
  const priceAdjustmentBounds = getPriceAdjustmentBounds(estimatedTotal);
  const editedChargeTotal = clampPriceToAdjustmentBounds(requestedChargeTotal, estimatedTotal);
  const priceWasClamped = requestedChargeTotal !== editedChargeTotal;
  const priceWasAdjusted = editedChargeTotal !== estimatedTotal;
  // Once the customer adjusts the price, the breakdown must reflect the real
  // feeRate fee on the NEW total, not the stale service/fee split computed from
  // the original estimate — otherwise "service + fee" wouldn't add back up
  // to the adjusted total shown just below it.
  const displayBreakdown = priceWasAdjusted
    ? deriveServiceAndFeeFromTotal(editedChargeTotal, feeRate)
    : { service: fare?.service ?? 0, fee: bookingFee };

  if (!serviceType) {
    return (
      <ScreenContainer showBackButton title={t("confirm.title")}>
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>Booking details unavailable.</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (!fare) {
    return (
      <ScreenContainer showBackButton title={t("confirm.title")}>
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
    try {
      setPaymentError(null);
      if (!state.userCoords || state.locationStatus !== "granted") {
        haptic.error();
        setPaymentError(
          isSpanish
            ? "Permite el acceso a la ubicación para enviar al mecánico a tu ubicación actual real."
            : "Allow location access so we can send the mechanic to your actual current location."
        );
        return;
      }

      // More authentication: biometric step-up before charging/creating paid service request (protects customer)
      try {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        if (hasHardware) {
          const bioRes = await LocalAuthentication.authenticateAsync({
            promptMessage: L("Verify to confirm booking and payment", "Verifica para confirmar la reserva y el pago"),
            fallbackLabel: L("Use passcode", "Usar código"),
          });
          if (!bioRes.success) {
            dispatch({ type: "SET_PAYMENT_STATUS", payload: { status: "idle" } });
            Alert.alert(L("Authentication required", "Autenticación requerida"), L("Biometrics needed to proceed with booking.", "Se necesita biometría para proceder con la reserva."));
            return;
          }
        }
      } catch {}

      if (!user?.id) {
        throw new Error(isSpanish ? "Debes iniciar sesión para solicitar servicio." : "You must be signed in to request service.");
      }
      const resolved = await resolveAuthSession(user, (err) => {
        Alert.alert(
          isSpanish ? "No se pudo crear el viaje" : "Could not create trip",
          err.message
        );
      });
      if (!resolved) {
        throw new Error(isSpanish ? "No hay sesión activa." : "No active session.");
      }
      await supabaseUserData.getOrCreateProfile(
        user.id,
        user.role === "mechanic" ? "mechanic" : "customer",
        resolved.sessionToken,
      );

      const blockingJob = findBlockingCustomerJob(state.jobs, state.activeJobId);
      if (blockingJob) {
        const cancelledRemote = await cancelBlockingCustomerRequest(
          resolved.sessionToken,
          blockingJob,
          user.id,
        );
        if (!cancelledRemote) {
          haptic.error();
          Alert.alert(
            L("Active request still open", "Solicitud activa aún abierta"),
            L(
              "We could not replace your current request. Cancel it first or try again.",
              "No pudimos reemplazar tu solicitud actual. Cancélala primero o inténtalo de nuevo.",
            ),
          );
          return;
        }
        dispatch({
          type: "UPDATE_JOB_STATUS",
          payload: { id: blockingJob.id, status: "cancelled" },
        });
      }

      dispatch({
        type: "SET_PAYMENT_STATUS",
        payload: { status: "processing" },
      });

      const currency = getCurrencyForRegion(region);
      const chargeTotal = editedChargeTotal;
      // Convert from the raw USD fare into what actually gets charged/stored
      // for this region (discount + MXN conversion) — see lib/i18n.ts.
      const chargeableChargeTotal = toChargeableAmount(chargeTotal);
      const chargeableEstimatedTotal = toChargeableAmount(estimatedTotal);
      const result = await paymentSheet.present({
        amount: amountToStripeAmount(chargeableChargeTotal, currency),
        estimatedTotal: amountToStripeAmount(chargeableEstimatedTotal, currency),
        currency,
        sessionToken: resolved.sessionToken,
        customerEmail: user.email,
      });
      if (result.status === "canceled") {
        dispatch({ type: "SET_PAYMENT_STATUS", payload: { status: "idle" } });
        return;
      }
      if (result.status !== "completed") {
        haptic.error();
        const message = result.status === "failed" ? result.message : "Payment authorization is unavailable right now.";
        setPaymentError(message);
        dispatch({
          type: "SET_PAYMENT_STATUS",
          payload: { status: "error", error: message },
        });
        return;
      }
      if (!result.paymentIntentId) {
        throw new Error("Payment authorization did not return a PaymentIntent.");
      }

      const mockPaymentAllowed = shouldUseMockPayments(runtime);
      if (!mockPaymentAllowed) {
        await verifyPaymentBeforeDispatch({
          sessionToken: resolved.sessionToken,
          paymentIntentId: result.paymentIntentId,
          amount: amountToStripeAmount(chargeableChargeTotal, currency),
          currency,
        });
      }

      haptic.success();
      const pickup = state.userCoords;
      const serviceLocationLabel = resolveServiceLocationLabel(state.defaultLocation, pickup);
      const start = mechanicCoords(pricingMechanic, pickup);
      // Store the same real, currency-converted amount that was actually
      // authorized with Stripe above — the capture sweep later reads
      // offered_price back and multiplies by 100 with no further currency
      // conversion (see app/api/payment-capture-sweep+api.ts), so this must
      // already be in the region's real charge currency, not raw USD.
      const finalPrice = chargeableChargeTotal;
      const adjustedFare = { ...fare, total: chargeTotal };
      // Platform fee must always be exactly feeRate of the service price, backed
      // out of whatever total is actually being charged — including a price
      // the customer adjusted here. Using the original estimate's fee would
      // leave the adjustment entirely absorbed by (or taken from) the
      // mechanic's payout instead of splitting it the same way as any
      // other price on the platform.
      const chargedBreakdown = deriveServiceAndFeeFromTotal(chargeTotal, feeRate);
      const platformFeeAmount = toChargeableAmount(chargedBreakdown.fee);
      const mechanicPayout = +(finalPrice - platformFeeAmount).toFixed(2);

      const request = await createDispatchRequest(resolved.sessionToken, {
        customerUserId: user.id,
        customerName: state.userName,
        customerPhotoUrl: state.photoUrl ?? null,
        serviceCode: serviceType.code,
        vehicleLabel: vehicle ? buildVehicleLabel(vehicle) : "Vehicle",
        locationLabel: serviceLocationLabel,
        customerLatitude: pickup.latitude,
        customerLongitude: pickup.longitude,
        offeredPrice: finalPrice,
        oilPackage:
          serviceType.code === "oil_change"
            ? (oilPackage === "conventional" || oilPackage === "full_synthetic" ? oilPackage : null)
            : null,
        platformFeeRate: feeRate,
        platformFeeAmount,
        mechanicPayout,
        currency,
        regionCode: region,
        stripePaymentIntentId: result.paymentIntentId ?? null,
      });
      if (!request?.id) {
        throw new Error(isSpanish ? "No se pudo guardar el viaje en la base de datos." : "Trip was not saved to live database.");
      }
      const remoteRequestId = request.id;

      const job: Job = {
        id: `j_${Date.now()}`,
        mechanicId: mechanicFromParam?.id ?? "unassigned",
        vehicleId: vehicle.id,
        service: serviceType.code,
        location: serviceLocationLabel,
        status: "searching",
        createdAt: Date.now(),
        remoteRequestId,
        fare: adjustedFare,
        pickup,
        mechanicStart: start,
        paymentMethodId: methodId,
        stripePaymentIntentId: result.paymentIntentId ?? null,
      };
      dispatch({ type: "CREATE_JOB", payload: job });
      dispatch({
        type: "SET_PAYMENT_STATUS",
        payload: { status: "success" },
      });
      safeReplace("/request-pending");
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

  const locationDisplay = resolveServiceLocationLabel(state.defaultLocation, state.userCoords);

  return (
    <ScreenContainer showBackButton title={t("confirm.title")}>
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
            <IconSymbol name="chevron.left" size={24} color={colors.foreground} />
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
              <Text style={styles.priceEditNote}>
                {isSpanish
                  ? "El costo de refacciones adicionales, si se requieren, lo confirma tu mecánico en el lugar."
                  : "Any extra parts cost, if needed, is quoted and confirmed by your mechanic on-site."}
              </Text>
            </>
          ) : null}
          <Divider />
          <DetailRow
            icon="car.fill"
            label={t("confirm.vehicle")}
            value={vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : t("home.no_vehicle")}
          />
          <Divider />
          <DetailRow icon="location.fill" label={t("confirm.location")} value={locationDisplay} />
          <Divider />
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
            <Text style={styles.priceEditLabel}>
              {L("Adjust Price (Optional)", "Ajustar precio (opcional)")}
            </Text>
            <IconSymbol
              name={showPriceEdit ? "chevron.up" : "chevron.down"}
              size={20}
              color={colors.primary}
            />
          </Pressable>
          {showPriceEdit && (
            <View style={{ marginTop: 12 }}>
              <Text style={styles.priceEditHint}>
                {L(
                  "Suggest a different price. Mechanic will review and accept or counter.",
                  "Sugiere un precio diferente. El mecánico lo revisará y aceptará o enviará una contraoferta.",
                )}
              </Text>
              <View style={styles.priceInputRow}>
                <Text style={styles.currencySymbol}>$</Text>
                <TextInput
                  style={styles.priceInput}
                  placeholder={formatEditableMoney(0, region)}
                  placeholderTextColor={colors.muted}
                  value={editedPrice}
                  onChangeText={(value) => setEditedPrice(normalizeEditableMoneyInput(value))}
                  keyboardType="decimal-pad"
                />
              </View>
              <Text style={styles.priceEditNote}>
                {L("Original price", "Precio original")}: {formatPrice(estimatedTotal || 0)}
              </Text>
              <Text style={styles.priceEditNote}>
                {L("Allowed range", "Rango permitido")}: {formatPrice(priceAdjustmentBounds.min)} – {formatPrice(priceAdjustmentBounds.max)}
              </Text>
              {priceWasClamped ? (
                <Text style={styles.priceEditWarning}>
                  {L(
                    `That's outside what we can send — we'll use ${formatPrice(editedChargeTotal)} instead.`,
                    `Eso está fuera de lo permitido — usaremos ${formatPrice(editedChargeTotal)} en su lugar.`,
                  )}
                </Text>
              ) : null}
            </View>
          )}
        </View>

        {/* Payment Method Selection */}
        <View style={[styles.card, { borderColor: colors.primary }]}>
          <Text style={{ color: colors.foreground, fontSize: 12, lineHeight: 18 }}>
            {L(
              "By continuing with payment, you agree to the Terms of Service and Privacy Policy.",
              "Al continuar con el pago, aceptas los Términos del Servicio y la Política de Privacidad.",
            )}
          </Text>
          <View style={{ marginTop: 8, flexDirection: "row", gap: 16 }}>
            <Pressable onPress={() => router.push("/legal/terms" as any)}>
              <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>
                {L("Terms of Service", "Términos del Servicio")}
              </Text>
            </Pressable>
            <Pressable onPress={() => router.push("/legal/privacy" as any)}>
              <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>
                {L("Privacy Policy", "Política de Privacidad")}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Payment Method Selection */}
        <StripePaymentSheet
          amount={Math.round(toChargeableAmount(editedChargeTotal) * 100)}
          currency={region === "MX" ? "mxn" : "usd"}
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
          <FareRow label={`${t("confirm.service" as any)} (${localizedServiceName(serviceType.code, locale)})`} value={formatPrice(displayBreakdown.service)} />
          <FareRow label={isSpanish ? `Despacho (${Math.round(feeRate * 100)}%)` : `Dispatch fee (${Math.round(feeRate * 100)}%)`} value={formatPrice(displayBreakdown.fee)} />
          <View style={{ height: 8 }} />
          <Divider />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>
              {priceWasAdjusted
                ? L("Adjusted total", "Total ajustado")
                : t("confirm.estimated_total")}
            </Text>
            <Text style={styles.totalValue}>{formatPrice(editedChargeTotal)}</Text>
          </View>
          {priceWasAdjusted ? (
            <Text style={styles.priceEditNote}>
              {L("Original estimate", "Estimado original")}: {formatPrice(estimatedTotal)}
            </Text>
          ) : null}
          <Text style={[styles.disclaimer, { marginTop: 6 }]}>
            {isSpanish
              ? `Tarifa de despacho ${Math.round(feeRate * 100)}% (${formatPrice(displayBreakdown.fee)}) incluida en el total.`
              : `Dispatch fee ${Math.round(feeRate * 100)}% (${formatPrice(displayBreakdown.fee)}) is included in this total.`}
          </Text>
          <Text style={styles.disclaimer}>{t("confirm.disclaimer")}</Text>
        </View>
      </ScrollView>

      {/* Sticky footer handled by StripePaymentSheet */}
    </ScreenContainer>
  );
}

function DetailRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIcon}>
        <IconSymbol name={icon} size={16} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue} numberOfLines={2}>{value}</Text>
      </View>
    </View>
  );
}

function FareRow({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  return (
    <View style={styles.fareRow}>
      <Text style={styles.fareLabel}>{label}</Text>
      <Text style={styles.fareValue}>{value}</Text>
    </View>
  );
}

function Divider() {
  const colors = useColors();
  const styles = useMemo(() => getStyles(colors), [colors]);
  return <View style={styles.divider} />;
}

function getStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    headerRow: {
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    headerTitle: { fontSize: 18, fontWeight: "800", color: colors.foreground },
    card: {
      marginHorizontal: 20,
      marginTop: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      padding: 14,
    },
    cardTitle: { fontSize: 16, fontWeight: "700", color: colors.foreground },
    cardSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
    detailRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
    detailIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: `${colors.primary}26`,
      alignItems: "center",
      justifyContent: "center",
    },
    detailLabel: { fontSize: 11, color: colors.muted, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
    detailValue: { fontSize: 14, color: colors.foreground, fontWeight: "600", marginTop: 2 },
    divider: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
    fareTitle: { fontSize: 15, fontWeight: "800", color: colors.foreground, marginBottom: 8 },
    fareRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
    fareLabel: { fontSize: 13, color: colors.muted },
    fareValue: { fontSize: 13, color: colors.foreground, fontWeight: "600" },
    totalRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
    totalLabel: { fontSize: 15, fontWeight: "800", color: colors.foreground },
    totalValue: { fontSize: 20, fontWeight: "800", color: colors.primary },
    disclaimer: { fontSize: 11, color: colors.muted, marginTop: 10, lineHeight: 16 },
    priceEditLabel: { fontSize: 14, fontWeight: "600", color: colors.foreground },
    priceEditHint: { fontSize: 12, color: colors.muted, marginBottom: 12, lineHeight: 16 },
    priceInputRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
    currencySymbol: { fontSize: 18, fontWeight: "700", color: colors.foreground },
    priceInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 16,
      color: colors.foreground,
      fontWeight: "600",
    },
    priceEditNote: { fontSize: 11, color: colors.muted, fontStyle: "italic" },
    priceEditWarning: { fontSize: 12, color: colors.error, fontWeight: "600", marginTop: 6 },
    footer: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 24,
    },
    errorWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
    errorText: { fontSize: 16, color: colors.muted },
  });
}
