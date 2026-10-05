import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import Constants from "expo-constants";
import * as LocalAuthentication from "expo-local-authentication";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useStore, useSelectedVehicle } from "@/lib/store";
import { useAuth } from "@/lib/auth-context";
import { useImagePicker } from "@/hooks/use-image-picker";
import { getServiceType, SERVICE_TYPES } from "@/lib/seed";
import { useLocaleContext, useL } from "@/hooks/use-locale";
import { haptic } from "@/lib/haptics";
import { safePush } from "@/lib/safe-router";
import { resolveAuthSession } from "@/lib/resolve-auth-session";
import { cancelBlockingCustomerRequest, findBlockingCustomerJob } from "@/lib/active-customer-job";
import { createDispatchRequest, sendServiceMessage } from "@/lib/live-dispatch";
import type { Job, ServiceCode } from "@/lib/types";
import { amountToStripeAmount, getCurrencyForRegion } from "@/lib/stripe";
import { localizedServiceName } from "@/lib/service-i18n";
import { useAppDrawer } from "@/lib/app-drawer-context";
import { buildVehicleLabel } from "@/lib/vehicle-label";
import { buildBookedCustomerNote } from "@/lib/booked-trip";
import { isLegacyFallbackLocation, resolveServiceLocationLabel } from "@/lib/location-label";
import { isScheduledTimeTooSoon } from "@/lib/schedule-time-core";
import { StripePaymentSheet } from "@/components/stripe-payment-sheet";
import { usePaymentSheet } from "@/hooks/use-payment-sheet";
import { verifyPaymentBeforeDispatch } from "@/lib/payment-verification";
import { shouldUseMockPayments } from "@/lib/mock-payments";

// Type-only imports — erased at compile time, so this never triggers a
// runtime import of react-native-maps (which has no web codegen support and
// breaks `npx expo export --platform web`). The actual <MapView> JSX lives in
// components/service-map-hero.tsx (native) / .web.tsx (fallback) instead of
// here, same split as components/live-map.tsx / live-map.web.tsx.
import type MapView from "react-native-maps";
import type { Region } from "react-native-maps";
import { ServiceMapHero } from "@/components/service-map-hero";
import { LocationAutocompleteInput } from "@/components/location-autocomplete-input";
import { regionFor } from "@/lib/geo";
import { geocodeServiceAddress, getFreshDeviceCoords } from "@/lib/service-location";
import { chooseRequestLocation, isDifferentAddress } from "@/lib/service-location-core";
import { supabaseUserData } from "@/lib/_core/supabase-user-data";
import { QUICK_SERVICE_BOOKING_FEE_RATE } from "@/lib/fare";
import { CANCELLATION_FEE_USD } from "@/lib/cancellation-fee-core";

const BOOKING_FEE_RATE = QUICK_SERVICE_BOOKING_FEE_RATE;
const FALLBACK_COORDS = { latitude: 31.7619, longitude: -106.485 };
const MAP_STYLE_DARK = [
  { elementType: "geometry", stylers: [{ color: "#1a1a1a" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8a8a8a" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a1a" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2a2a2a" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#3a3a3a" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3a4a3a" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#1a3a1a" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0a1a2a" }] },
];

type OilPkg = "conventional" | "full_synthetic" | "own_oil_filter" | "synthetic_blend";

function dayOptionLabel(date: Date, locale: string) {
  const l = locale === "es-MX" ? "es-MX" : "en-US";
  return date.toLocaleDateString(l, { weekday: "short", month: "short", day: "numeric" });
}

export default function BookServiceTabScreen() {
  const { openDrawer } = useAppDrawer();
  const insets = useSafeAreaInsets();
  const { service: prefilledService, oilPackage: prefilledOilPackage } = useLocalSearchParams<{
    service?: string;
    oilPackage?: OilPkg;
  }>();
  const { state, dispatch } = useStore();
  const { user } = useAuth();
  const vehicle = useSelectedVehicle();
  const { region, locale, formatPrice, toChargeableAmount } = useLocaleContext();
  const cancellationFeeLabel = formatPrice(CANCELLATION_FEE_USD);
  const L = useL();
  const { pickImageFromGallery } = useImagePicker();

  const bookingServices = useMemo(
    () =>
      SERVICE_TYPES.filter((s) =>
        ["oil_change", "general_checkup", "ac_service", "engine_repair", "brake_service", "other"].includes(s.code),
      ),
    [],
  );
  const defaultService = typeof prefilledService === "string" ? prefilledService : "oil_change";
  const isPresetFlow = typeof prefilledService === "string";
  const [serviceCode, setServiceCode] = useState<ServiceCode>(defaultService as ServiceCode);
  const [oilPackage] = useState<OilPkg>(prefilledOilPackage ?? "full_synthetic");
  const [hasOwnParts, setHasOwnParts] = useState<boolean>(prefilledOilPackage === "own_oil_filter");
  const [issuePhotoUri, setIssuePhotoUri] = useState<string | null>(null);
  const [issueMessage, setIssueMessage] = useState("");
  const [location, setLocation] = useState(state.defaultLocation);
  const [locationEdit, setLocationEdit] = useState(false);
  const [dayOffset, setDayOffset] = useState(0);
  const [timeSlot, setTimeSlot] = useState("12:00");
  const [customScheduledDate, setCustomScheduledDate] = useState<Date | null>(null);
  const [showCustomTimeModal, setShowCustomTimeModal] = useState(false);

  // Local state for the custom JS time picker modal
  const [pickerHour, setPickerHour] = useState(12);
  const [pickerMinute, setPickerMinute] = useState(0);

  const [submitting, setSubmitting] = useState(false);
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<string | null>(
    state.defaultPaymentMethodId,
  );
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const paymentSheet = usePaymentSheet();
  const paymentRuntime = {
    isDev: __DEV__,
    appOwnership: Constants.appOwnership ?? null,
    platform: Platform.OS,
    mockPaymentsFlag: process.env.EXPO_PUBLIC_ENABLE_MOCK_PAYMENTS ?? "",
  };
  const mapRef = useRef<MapView>(null);

  const selectedService = getServiceType(serviceCode) ?? bookingServices[0];
  const serviceCoords = state.userCoords ?? FALLBACK_COORDS;
  const mapRegion: Region = useMemo(() => regionFor([serviceCoords], 1.4), [serviceCoords]);

  useEffect(() => {
    mapRef.current?.animateToRegion(mapRegion, 350);
  }, [mapRegion]);

  useEffect(() => {
    if (prefilledOilPackage === "own_oil_filter") setHasOwnParts(true);
  }, [prefilledOilPackage]);

  useEffect(() => {
    if (locationEdit) return;
    const nextLocation = resolveServiceLocationLabel(state.defaultLocation, state.userCoords);
    const shouldSync =
      !location.trim() ||
      location === "Current location" ||
      isLegacyFallbackLocation(location);
    if (shouldSync && nextLocation !== location) {
      setLocation(nextLocation);
    }
  }, [location, locationEdit, state.defaultLocation, state.userCoords]);
  const laborPrice = selectedService.basePrice;
  const bookingFee = +(laborPrice * BOOKING_FEE_RATE).toFixed(2);
  const estimatedTodayTotal = +(laborPrice + bookingFee).toFixed(2);

  const scheduledFor = useMemo(() => {
    if (customScheduledDate) {
      return customScheduledDate;
    }
    const date = new Date();
    date.setDate(date.getDate() + dayOffset);
    const [h, m] = timeSlot.split(":").map((n) => parseInt(n, 10));
    const hh = Number.isFinite(h) ? Math.max(0, Math.min(23, h)) : 12;
    const mm = Number.isFinite(m) ? Math.max(0, Math.min(59, m)) : 0;
    date.setHours(hh, mm, 0, 0);
    return date;
  }, [dayOffset, timeSlot, customScheduledDate]);

  // Capped at 5 days out (not the old 8) because payment is now authorized
  // (held, not charged) at booking time via a manual-capture Stripe
  // PaymentIntent. Card issuers typically release uncaptured holds after
  // ~7 days, so scheduling further out risks the hold expiring before the
  // job even happens, let alone before payment-capture-sweep tries to
  // capture it ~24h after completion. Re-authorizing closer to the service
  // date would remove this cap but isn't built yet.
  const dayOptions = Array.from({ length: 5 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    let label = dayOptionLabel(d, locale);
    if (i === 0) label = L("Today", "Hoy");
    if (i === 1) label = L("Tomorrow", "Mañana");
    return { value: i, label };
  });
  const baseTimeSlots = useMemo(() => ["09:00", "12:00", "15:00", "18:00"], []);
  const formatTimeSlotLabel = (slot: string) => {
    const [h, m] = slot.split(":").map((n) => parseInt(n, 10));
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d.toLocaleTimeString(locale === "es-MX" ? "es-MX" : "en-US", { hour: "numeric", minute: "2-digit" });
  };
  const availableTimeSlots = useMemo(() => {
    if (dayOffset !== 0) return baseTimeSlots;
    const now = new Date();
    return baseTimeSlots.filter((slot) => {
      const [h, m] = slot.split(":").map((n) => parseInt(n, 10));
      if (!Number.isFinite(h) || !Number.isFinite(m)) return false;
      return h > now.getHours() || (h === now.getHours() && m >= now.getMinutes());
    });
  }, [dayOffset, baseTimeSlots]);

  useEffect(() => {
    if (!availableTimeSlots.length) return;
    if (!availableTimeSlots.includes(timeSlot)) {
      setTimeSlot(availableTimeSlots[0]);
    }
  }, [availableTimeSlots, timeSlot]);

  const canSubmit =
    !!selectedService &&
    !!vehicle &&
    location.trim().length > 5 &&
    !submitting &&
    agreementAccepted;

  const pickIssuePhoto = async () => {
    const picked = await pickImageFromGallery();
    if (!picked) return;
    setIssuePhotoUri(picked.uri);
    haptic.selection();
  };

  const openCustomTimeModal = () => {
    // Prefill with current scheduled time or a sensible default
    const baseDate = customScheduledDate || scheduledFor;
    setPickerHour(baseDate.getHours());
    setPickerMinute(Math.floor(baseDate.getMinutes() / 5) * 5); // Snap to 5 min
    setShowCustomTimeModal(true);
    haptic.selection();
  };

  // pickerHour stays 24h internally (feeds straight into Date.setHours); these
  // derive/set the 12h + AM/PM values the picker UI actually shows.
  const pickerHour12 = pickerHour % 12 === 0 ? 12 : pickerHour % 12;
  const pickerPeriod: "AM" | "PM" = pickerHour < 12 ? "AM" : "PM";
  const setPickerHour12 = (h12: number) => {
    setPickerHour(pickerPeriod === "AM" ? (h12 === 12 ? 0 : h12) : h12 === 12 ? 12 : h12 + 12);
  };
  const setPickerPeriod = (period: "AM" | "PM") => {
    setPickerHour(period === "AM" ? (pickerHour12 === 12 ? 0 : pickerHour12) : pickerHour12 === 12 ? 12 : pickerHour12 + 12);
  };

  const confirmCustomTime = () => {
    const base = new Date();
    base.setDate(base.getDate() + dayOffset);
    base.setHours(pickerHour, pickerMinute, 0, 0);
    if (isScheduledTimeTooSoon(base.getTime())) {
      haptic.error();
      Alert.alert(
        L("Pick a later time", "Elige una hora más tarde"),
        L(
          "That time has already passed. Please choose a time at least 15 minutes from now.",
          "Esa hora ya pasó. Elige una hora al menos 15 minutos a partir de ahora.",
        ),
      );
      return;
    }
    setCustomScheduledDate(base);
    setShowCustomTimeModal(false);
    haptic.success();
  };

  const handleAddPaymentMethod = () => {
    safePush("/payment-methods");
  };

  // Runs after the customer taps "Confirm Payment" inside <StripePaymentSheet>.
  // Mirrors app/confirm.tsx's handleConfirmPayment: validate → authorize the
  // charge via Stripe's native PaymentSheet (held, manual capture) → verify →
  // only THEN create the dispatch request, now with a real stripePaymentIntentId
  // attached. Previously this screen created the dispatch request with no
  // payment at all.
  const handleConfirmPayment = async (methodId: string) => {
    // Synchronous double-tap guard: checked before any await, same pattern as
    // StripePaymentSheet's own handleConfirm. isBusy only reflects state
    // after a re-render, so a fast double-tap could otherwise fire this
    // twice and authorize two charges for the same booking.
    if (submitting) return;
    if (!vehicle || !selectedService) {
      haptic.error();
      return;
    }
    if (!user?.id) {
      Alert.alert(L("Sign in required", "Se requiere iniciar sesión"));
      return;
    }
    if (!agreementAccepted) {
      haptic.warning();
      Alert.alert(
        L("Accept the booking agreement", "Acepta el acuerdo de reserva"),
        L(
          "Please read and accept the Booking Agreement & Cancellation Policy before continuing.",
          "Lee y acepta el Acuerdo de Reserva y Política de Cancelación antes de continuar.",
        ),
      );
      return;
    }
    if (!state.photoUrl) {
      haptic.warning();
      Alert.alert(
        L("Profile photo required", "Se requiere foto de perfil"),
        L(
          "Add a profile photo in your profile before booking so mechanics can identify you.",
          "Agrega una foto de perfil en tu perfil antes de reservar para que los mecánicos puedan identificarte."
        )
      );
      return;
    }
    if (isScheduledTimeTooSoon(scheduledFor.getTime())) {
      haptic.error();
      Alert.alert(
        L("Invalid time", "Hora inválida"),
        L(
          "Please choose a time at least 15 minutes from now.",
          "Elige una hora al menos 15 minutos a partir de ahora.",
        ),
      );
      return;
    }

    setPaymentError(null);
    setSubmitting(true);
    dispatch({ type: "SET_PAYMENT_STATUS", payload: { status: "processing" } });
    try {
      // Where the mechanic goes, resolved before anything is charged. A
      // typed address is geocoded (it used to be saved only as a label while
      // the coordinates stayed at the phone's old GPS position); otherwise
      // a chosen address or a GPS fix taken now.
      const typedAddress = location.trim();
      let requestLocation: { coords: { latitude: number; longitude: number } } | null = null;
      if (typedAddress && isDifferentAddress(typedAddress, state.defaultLocation)) {
        const coords = await geocodeServiceAddress(typedAddress);
        if (!coords) {
          haptic.error();
          dispatch({ type: "SET_PAYMENT_STATUS", payload: { status: "idle" } });
          Alert.alert(
            L("Address not found", "Dirección no encontrada"),
            L(
              "We couldn't find that address. Check it, or pick one from the suggestions.",
              "No pudimos encontrar esa dirección. Revísala o elige una de las sugerencias.",
            ),
          );
          return;
        }
        requestLocation = { coords };
      } else {
        const freshGps = state.serviceLocationCoords ? null : await getFreshDeviceCoords();
        const chosen = chooseRequestLocation({
          chosenAddressCoords: state.serviceLocationCoords,
          freshGps,
          cachedGps: state.userCoords,
          cachedGpsAt: state.userCoordsAt,
          now: Date.now(),
        });
        if (chosen?.source === "gps") {
          dispatch({ type: "SET_USER_COORDS", payload: { coords: chosen.coords, status: "granted" } });
        }
        requestLocation = chosen;
      }
      if (!requestLocation) {
        haptic.error();
        dispatch({ type: "SET_PAYMENT_STATUS", payload: { status: "idle" } });
        Alert.alert(
          L("Location required", "Se requiere ubicación"),
          L(
            "We couldn't get your current location. Turn on location, or type the service address.",
            "No pudimos obtener tu ubicación actual. Activa la ubicación o escribe la dirección del servicio.",
          ),
        );
        return;
      }
      const serviceCoords = requestLocation.coords;

      // Biometric step-up before authorizing a charge, matching confirm.tsx's
      // protection for the quick-service flow.
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

      const resolved = await resolveAuthSession(user, (err) => {
        Alert.alert(L("Could not book service", "No se pudo agendar"), err.message);
      });
      if (!resolved) return;
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

      const currency = getCurrencyForRegion(region);
      // Convert from the raw USD fare into what actually gets charged/stored
      // for this region (discount + MXN conversion) — see lib/i18n.ts. Using
      // the raw USD number directly would charge/store a MX customer at
      // roughly 1/17.5th of the intended amount.
      const chargeableEstimatedTodayTotal = toChargeableAmount(estimatedTodayTotal);
      const result = await paymentSheet.present({
        amount: amountToStripeAmount(chargeableEstimatedTodayTotal, currency),
        estimatedTotal: amountToStripeAmount(chargeableEstimatedTodayTotal, currency),
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
        const message = result.status === "failed" ? result.message : L("Payment authorization is unavailable right now.", "La autorización de pago no está disponible en este momento.");
        setPaymentError(message);
        dispatch({ type: "SET_PAYMENT_STATUS", payload: { status: "error", error: message } });
        return;
      }
      if (!result.paymentIntentId) {
        throw new Error("Payment authorization did not return a PaymentIntent.");
      }

      const mockPaymentAllowed = shouldUseMockPayments(paymentRuntime);
      if (!mockPaymentAllowed) {
        await verifyPaymentBeforeDispatch({
          sessionToken: resolved.sessionToken,
          paymentIntentId: result.paymentIntentId,
          amount: amountToStripeAmount(chargeableEstimatedTodayTotal, currency),
          currency,
        });
      }

      haptic.success();
      const vehicleLabel = buildVehicleLabel(vehicle);
      // Same real, currency-converted amounts as what was just authorized
      // with Stripe above — the capture sweep reads offered_price back and
      // multiplies by 100 with no further currency conversion (see
      // app/api/payment-capture-sweep+api.ts), so these must already be in
      // the region's real charge currency, not raw USD.
      const chargeableBookingFee = toChargeableAmount(bookingFee);
      const request = await createDispatchRequest(resolved.sessionToken, {
        customerUserId: user.id,
        customerName: state.userName,
        customerPhotoUrl: state.photoUrl ?? null,
        serviceCode: selectedService.code,
        vehicleLabel,
        locationLabel: location.trim(),
        customerLatitude: serviceCoords.latitude,
        customerLongitude: serviceCoords.longitude,
        offeredPrice: chargeableEstimatedTodayTotal,
        oilPackage:
          selectedService.code === "oil_change"
            ? (oilPackage === "conventional" || oilPackage === "full_synthetic" ? oilPackage : null)
            : null,
        platformFeeRate: BOOKING_FEE_RATE,
        platformFeeAmount: chargeableBookingFee,
        mechanicPayout: +(chargeableEstimatedTodayTotal - chargeableBookingFee).toFixed(2),
        scheduledFor: scheduledFor.toISOString(),
        customerNote: buildBookedCustomerNote(issueMessage.trim() || null, scheduledFor.toISOString()),
        customerHasParts: hasOwnParts,
        issuePhotoUrl: issuePhotoUri ?? null,
        currency,
        regionCode: region,
        stripePaymentIntentId: result.paymentIntentId,
      });
      if (!request?.id) {
        throw new Error(L("Trip was not saved to live database.", "El viaje no se guardó en la base de datos en vivo."));
      }

      const noteLines = [
        `${L("Scheduled", "Programado")}: ${scheduledFor.toLocaleString(locale === "es-MX" ? "es-MX" : "en-US")}`,
        `${L("Service", "Servicio")}: ${localizedServiceName(selectedService.code, locale)}`,
        `${L("Customer has own parts", "Cliente tiene sus propias refacciones")}: ${hasOwnParts ? L("Yes", "Sí") : L("No", "No")}`,
        issueMessage.trim() ? `${L("Issue details", "Detalles de falla")}: ${issueMessage.trim()}` : "",
      ].filter(Boolean);
      try {
        await sendServiceMessage(resolved.sessionToken, {
          requestId: request.id,
          senderUserId: user.id,
          senderRole: "customer",
          message: noteLines.join("\n"),
        });
      } catch (messageErr) {
        console.warn("[BookService] Could not save initial message:", messageErr);
      }

      const job: Job = {
        id: `j_${Date.now()}`,
        mechanicId: "unassigned",
        isBooked: true,
        scheduledFor: scheduledFor.getTime(),
        vehicleId: vehicle.id,
        service: selectedService.code,
        location: location.trim(),
        status: "searching",
        createdAt: Date.now(),
        remoteRequestId: request.id,
        fare: {
          service: laborPrice,
          bookingFee,
          total: estimatedTodayTotal,
        },
        stripePaymentIntentId: result.paymentIntentId,
        pickup: serviceCoords,
        paymentMethodId: methodId,
      };
      dispatch({ type: "CREATE_JOB", payload: job });
      dispatch({ type: "SET_PAYMENT_STATUS", payload: { status: "success" } });
      safePush("/request-pending");
    } catch (error) {
      console.error("[BookService] create booking failed:", error);
      haptic.error();
      const message = error instanceof Error ? error.message : L("Please try again in a moment.", "Inténtalo de nuevo en un momento.");
      setPaymentError(message);
      dispatch({ type: "SET_PAYMENT_STATUS", payload: { status: "error", error: message } });
      Alert.alert(
        L("Booking failed", "No se pudo crear la reserva"),
        message,
      );
    } finally {
      setSubmitting(false);
    }
  };

  const estMin = selectedService.estimatedMinutes;
  const estHoursMin = Math.max(1, Math.floor(estMin / 30));
  const estHoursMax = Math.max(estHoursMin + 1, Math.ceil(estMin / 20));

  return (
    <ScreenContainer edges={["left", "right"]}>
      <View style={styles.root}>
        <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
          <Pressable onPress={openDrawer} style={styles.menuBtn}>
            <IconSymbol name="line.3.horizontal" size={24} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.topTitle}>{L("Book Service", "Agendar servicio")}</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.pageShell}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView style={styles.scrollArea} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.mapHero}>
            <ServiceMapHero
              mapRef={mapRef}
              region={mapRegion}
              customMapStyle={MAP_STYLE_DARK}
              markerCoordinate={serviceCoords}
              markerStyle={styles.mapPinMarker}
            />
            <View style={styles.pinWrap}>
              <IconSymbol name="mappin.circle.fill" size={58} color="#FF5F0F" />
            </View>
            <View style={styles.locationChip}>
              <Text style={styles.locationChipText} numberOfLines={1}>{location}</Text>
            </View>
          </View>

          {/* Vehicle summary - critical context for booking */}
          <View style={styles.vehicleCard}>
            <View style={styles.vehicleRow}>
              <View style={styles.vehicleIcon}>
                <IconSymbol name="car.fill" size={20} color="#F97316" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.vehicleLabel}>{L("Vehicle", "Vehículo")}</Text>
                {vehicle ? (
                  <Text style={styles.vehicleValue} numberOfLines={1}>{buildVehicleLabel(vehicle)}</Text>
                ) : (
                  <Text style={styles.vehicleMissing}>{L("No vehicle selected. Add one in Vehicles.", "Ningún vehículo seleccionado. Agrega uno en Vehículos.")}</Text>
                )}
              </View>
            </View>
          </View>

          {!isPresetFlow ? (
            <>
              <Text style={styles.sectionHeading}>{L("Service", "Servicio")}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.serviceRow}>
                {bookingServices.map((svc) => {
                  const active = svc.code === serviceCode;
                  return (
                    <Pressable
                      key={svc.code}
                      onPress={() => setServiceCode(svc.code)}
                      style={[styles.serviceCard, active && styles.serviceCardActive]}
                    >
                      <IconSymbol name={svc.icon} size={24} color="#FFFFFF" />
                      <Text style={styles.serviceTitle} numberOfLines={2}>
                        {localizedServiceName(svc.code, locale)}
                      </Text>
                      <Text style={styles.servicePrice}>{formatPrice(svc.basePrice)}</Text>
                      {active ? (
                        <View style={styles.todayBadge}>
                          <Text style={styles.todayBadgeText}>{L("Available today", "Disponible hoy")}</Text>
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </>
          ) : (
            <View style={styles.presetServiceBadge}>
              <Text style={styles.presetServiceLabel}>{L("Selected service", "Servicio seleccionado")}</Text>
              <Text style={styles.presetServiceValue}>{localizedServiceName(serviceCode, locale)}</Text>
              <Text style={styles.presetServiceMeta}>
                {formatPrice(selectedService.basePrice)} • ~{selectedService.estimatedMinutes} {L("min", "min")}
              </Text>
            </View>
          )}

          <View style={styles.detailCard}>
            <Text style={styles.detailTitle}>{L("Booking details", "Detalles de reserva")}</Text>
            <Text style={styles.serviceDesc}>{selectedService.description}</Text>
            {!isPresetFlow ? (
              <>
                <Text style={styles.question}>{L("Do you have your own oil, filter or parts?", "¿Tienes tu propio aceite, filtro o refacciones?")}</Text>
                <View style={styles.segmentRow}>
                  <Pressable style={[styles.segmentBtn, hasOwnParts && styles.segmentBtnOn]} onPress={() => setHasOwnParts(true)}>
                    <Text style={styles.segmentText}>{L("Yes", "Sí")}</Text>
                  </Pressable>
                  <Pressable style={[styles.segmentBtn, !hasOwnParts && styles.segmentBtnOn]} onPress={() => setHasOwnParts(false)}>
                    <Text style={styles.segmentText}>{L("No", "No")}</Text>
                  </Pressable>
                </View>
                {!hasOwnParts ? (
                  <Text style={styles.helperText}>
                    {L(
                      "First ask a local parts store, then we finalize your parts recommendation in WrenchUp.",
                      "Primero consulta una refaccionaria local y luego finalizamos tu recomendación de partes en WrenchUp.",
                    )}
                  </Text>
                ) : null}
              </>
            ) : null}

            <Text style={styles.photoLabel}>{L("Issue photo (recommended)", "Foto de la falla (recomendado)")}</Text>
            {issuePhotoUri ? (
              <View style={[styles.uploadBox, styles.uploadBoxWithPreview]}>
                <View style={styles.photoPreviewRow}>
                  <Pressable onPress={pickIssuePhoto} style={styles.photoThumbWrap} hitSlop={4}>
                    <Image
                      source={{ uri: issuePhotoUri }}
                      style={styles.photoThumb}
                      contentFit="cover"
                    />
                  </Pressable>
                  <Pressable onPress={pickIssuePhoto} style={{ flex: 1 }} hitSlop={4}>
                    <Text style={styles.uploadText}>{L("Photo attached", "Foto adjunta")}</Text>
                    <Text style={styles.uploadSub}>{L("Tap photo to change", "Toca la foto para cambiar")}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setIssuePhotoUri(null)}
                    style={styles.removePhotoBtn}
                    hitSlop={10}
                  >
                    <IconSymbol name="xmark" size={14} color="#FFFFFF" />
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable onPress={pickIssuePhoto} style={styles.uploadBox}>
                <IconSymbol name="camera.fill" size={36} color="#FFFFFF" />
                <Text style={styles.uploadText}>{L("Upload photo", "Subir foto")}</Text>
                <Text style={styles.uploadSub}>{L("Help the mechanic understand the issue", "Ayuda al mecánico a entender el problema")}</Text>
                <Pressable onPress={() => setIssuePhotoUri(null)} style={styles.skipInline} hitSlop={6}>
                  <Text style={styles.skipInlineText}>{L("Skip", "Omitir")}</Text>
                </Pressable>
              </Pressable>
            )}

            <TextInput
              value={issueMessage}
              onChangeText={setIssueMessage}
              placeholder={L("Describe noises, warning lights, smells, symptoms...", "Describe ruidos, luces, olores, síntomas...")}
              placeholderTextColor="#A8B3C7"
              multiline
              style={styles.issueInput}
            />
          </View>

          {/* Clear price summary - professional & transparent */}
          <View style={styles.priceCard}>
            <Text style={styles.priceTitle}>{L("Price summary", "Resumen de precio")}</Text>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>{localizedServiceName(selectedService.code, locale)}</Text>
              <Text style={styles.priceValue}>{formatPrice(laborPrice)}</Text>
            </View>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>{L(`Dispatch fee (${Math.round(BOOKING_FEE_RATE * 100)}%)`, `Tarifa de despacho (${Math.round(BOOKING_FEE_RATE * 100)}%)`)}</Text>
              <Text style={styles.priceValue}>{formatPrice(bookingFee)}</Text>
            </View>
            <View style={styles.priceDivider} />
            <View style={styles.priceRow}>
              <Text style={styles.priceTotalLabel}>{L("Estimated total", "Total estimado")}</Text>
              <Text style={styles.priceTotalValue}>{formatPrice(estimatedTodayTotal)}</Text>
            </View>
            <Text style={styles.priceNote}>
              {L("Final price may vary after on-site diagnosis. You pay only for work performed.", "El precio final puede variar tras el diagnóstico en sitio. Pagas solo por el trabajo realizado.")}
            </Text>
          </View>

          <View style={styles.locationCard}>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={styles.locationTitle}>{L("Service location", "Ubicación del servicio")}</Text>
              <View style={styles.locationRow}>
                <IconSymbol name="location.fill" size={18} color="#FFFFFF" />
                <Text style={styles.locationValue} numberOfLines={2}>{location}</Text>
              </View>
              {locationEdit ? (
                <LocationAutocompleteInput
                  value={location}
                  onChangeText={setLocation}
                  placeholder={L("Street, city, state", "Calle, ciudad, estado")}
                  placeholderTextColor="#A8B3C7"
                  style={styles.locationInput}
                />
              ) : (
                <Text style={styles.locationHint}>{L("Using GPS location", "Usando ubicación GPS")}</Text>
              )}
            </View>
            <Pressable style={styles.editPill} onPress={() => setLocationEdit((v) => !v)}>
              <Text style={styles.editPillText}>{locationEdit ? L("Done", "Listo") : L("Edit", "Editar")}</Text>
              <IconSymbol name="pencil" size={14} color="#FFFFFF" />
            </Pressable>
          </View>

          <View style={styles.scheduleCard}>
            <View style={styles.scheduleHeader}>
              <Text style={styles.scheduleTitle}>{L("Schedule", "Horario")}</Text>
              <Text style={styles.scheduleSub}>{L("Choose when you'd like the mechanic to arrive", "Elige cuándo quieres que llegue el mecánico")}</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {dayOptions.map((option) => (
                <Pressable
                  key={option.value}
                  onPress={() => setDayOffset(option.value)}
                  style={[styles.dayChip, dayOffset === option.value && styles.dayChipOn]}
                >
                  <Text style={[styles.dayChipText, dayOffset === option.value && styles.dayChipTextOn]}>{option.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={styles.timeRow}>
              {availableTimeSlots.map((slot) => (
                <Pressable key={slot} onPress={() => setTimeSlot(slot)} style={[styles.timeChip, timeSlot === slot && styles.timeChipOn]}>
                  <Text style={[styles.timeChipText, timeSlot === slot && styles.timeChipTextOn]}>{formatTimeSlotLabel(slot)}</Text>
                </Pressable>
              ))}
            </View>
            {availableTimeSlots.length === 0 ? (
              <Text style={styles.helperText}>
                {L("No preset slots left for today. Please select another day or pick a custom time.", "No quedan horarios predefinidos para hoy. Selecciona otro día o una hora personalizada.")}
              </Text>
            ) : null}

            {/* Custom time button - opens a reliable JS-based time picker */}
            <Pressable
              onPress={openCustomTimeModal}
              style={styles.customTimeButton}
            >
              <IconSymbol name="clock" size={16} color="#F97316" />
              <Text style={styles.customTimeButtonText}>
                {customScheduledDate 
                  ? L("Change exact time", "Cambiar hora exacta") 
                  : L("Choose exact time", "Elegir hora exacta")}
              </Text>
            </Pressable>

            {/* Clear selected custom time */}
            {customScheduledDate && (
              <Pressable onPress={() => setCustomScheduledDate(null)} style={{ alignSelf: "flex-start", marginTop: -4 }}>
                <Text style={{ color: "#F87171", fontSize: 12, fontWeight: "600" }}>
                  {L("Clear custom time", "Borrar hora personalizada")}
                </Text>
              </Pressable>
            )}

            {/* Professional selected schedule summary */}
            <View style={styles.selectedSchedule}>
              <Text style={styles.selectedLabel}>{L("Selected appointment", "Cita seleccionada")}</Text>
              <Text style={styles.selectedValue}>
                {scheduledFor.toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric" })}
                {" • "}
                {scheduledFor.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })}
              </Text>
            </View>
          </View>



          {/* Reliable pure-JS Time Picker Modal - no native modules, works everywhere including builds */}
          <Modal
            visible={showCustomTimeModal}
            transparent
            animationType="fade"
            onRequestClose={() => setShowCustomTimeModal(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.timePickerModal}>
                <Text style={styles.modalTitle}>{L("Select exact time", "Seleccionar hora exacta")}</Text>

                {/* Live preview of selected time */}
                <View style={{ alignItems: "center", marginBottom: 12, padding: 8, backgroundColor: "rgba(20,184,166,0.1)", borderRadius: 8 }}>
                  <Text style={{ color: "#F97316", fontSize: 24, fontWeight: "800" }}>
                    {pickerHour12}:{pickerMinute.toString().padStart(2, '0')} {pickerPeriod}
                  </Text>
                </View>

                <View style={styles.timePickerRow}>
                  {/* Hours 1-12 */}
                  <View style={styles.timeColumn}>
                    <Text style={styles.columnLabel}>{L("Hour", "Hora")}</Text>
                    <ScrollView
                      style={styles.timeScroll}
                      snapToInterval={48}
                      decelerationRate="fast"
                      showsVerticalScrollIndicator={false}
                      contentOffset={{ x: 0, y: (pickerHour12 - 1) * 48 }}
                    >
                      {Array.from({ length: 12 }).map((_, i) => {
                        const h = i + 1;
                        return (
                          <Pressable
                            key={h}
                            onPress={() => setPickerHour12(h)}
                            style={[styles.timeOption, pickerHour12 === h && styles.timeOptionSelected]}
                          >
                            <Text style={[styles.timeOptionText, pickerHour12 === h && styles.timeOptionTextSelected]}>
                              {h.toString().padStart(2, '0')}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                    <View style={styles.timeCenterLine} pointerEvents="none" />
                  </View>

                  {/* Minutes 00-55 step 5 */}
                  <View style={styles.timeColumn}>
                    <Text style={styles.columnLabel}>{L("Minute", "Minuto")}</Text>
                    <ScrollView
                      style={styles.timeScroll}
                      snapToInterval={48}
                      decelerationRate="fast"
                      showsVerticalScrollIndicator={false}
                      contentOffset={{ x: 0, y: (pickerMinute / 5) * 48 }}
                    >
                      {Array.from({ length: 12 }).map((_, i) => {
                        const m = i * 5;
                        return (
                          <Pressable
                            key={m}
                            onPress={() => setPickerMinute(m)}
                            style={[styles.timeOption, pickerMinute === m && styles.timeOptionSelected]}
                          >
                            <Text style={[styles.timeOptionText, pickerMinute === m && styles.timeOptionTextSelected]}>
                              {m.toString().padStart(2, '0')}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                    <View style={styles.timeCenterLine} pointerEvents="none" />
                  </View>

                  {/* AM / PM */}
                  <View style={[styles.timeColumn, { width: 60 }]}>
                    <Text style={styles.columnLabel}> </Text>
                    <View style={{ width: 60, gap: 8 }}>
                      {(["AM", "PM"] as const).map((period) => (
                        <Pressable
                          key={period}
                          onPress={() => setPickerPeriod(period)}
                          style={[styles.timeOption, pickerPeriod === period && styles.timeOptionSelected]}
                        >
                          <Text style={[styles.timeOptionText, pickerPeriod === period && styles.timeOptionTextSelected]}>
                            {period}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                </View>

                <View style={styles.modalButtons}>
                  <Pressable onPress={() => setShowCustomTimeModal(false)} style={styles.modalCancel}>
                    <Text style={styles.modalCancelText}>{L("Cancel", "Cancelar")}</Text>
                  </Pressable>
                  <Pressable onPress={confirmCustomTime} style={styles.modalConfirm}>
                    <Text style={styles.modalConfirmText}>{L("Confirm", "Confirmar")}</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>

          <Text style={styles.estimateLine}>
            {L("Est. service time", "Est. tiempo de servicio")}: {estHoursMin}h - {estHoursMax}h | {L("Prices vary by mechanic", "Los precios varían según el mecánico")}
          </Text>

          <View style={styles.legalCard}>
            <Text style={styles.legalTitle}>{L("Service Booking Agreement & Cancellation Policy", "Acuerdo de Reserva de Servicio y Política de Cancelación")}</Text>
            <Text style={styles.legalBody}>
              {L(
                `By tapping “Request a Mechanic” you agree:\n\n• You can cancel for free until your mechanic has driven a meaningful distance toward you.\n• If you cancel after they have driven at least half a mile and a quarter of their trip, a ${cancellationFeeLabel} cancellation fee is charged and paid to the mechanic. The rest of your card hold is released.\n• You authorize charges for completed work or applicable fees.\n• Prices are estimates; final cost based on diagnosis.\n\nFull terms apply. See our Terms of Service.`,
                `Al tocar “Solicitar un mecánico” aceptas:\n\n• Puedes cancelar gratis hasta que tu mecánico haya recorrido una distancia importante hacia ti.\n• Si cancelas después de que haya recorrido al menos media milla y una cuarta parte de su trayecto, se cobra una tarifa de cancelación de ${cancellationFeeLabel} que se paga al mecánico. El resto de la retención en tu tarjeta se libera.\n• Autorizas cargos por trabajo completado o tarifas aplicables.\n• Los precios son estimados; el costo final se basa en diagnóstico.\n\nAplican términos completos. Consulta nuestros Términos de Servicio.`
              )}
            </Text>
            <Pressable
              onPress={() => {
                const next = !agreementAccepted;
                setAgreementAccepted(next);
                if (next) haptic.success();
              }}
              style={styles.agreeCheckRow}
            >
              <View style={[styles.checkBox, agreementAccepted && styles.checkBoxOn]}>
                {agreementAccepted ? <IconSymbol name="checkmark" size={12} color="#FFFFFF" /> : null}
              </View>
              <Text style={styles.agreeText}>{L("I have read and accept the Booking Agreement & Cancellation Policy.", "He leído y acepto el Acuerdo de Reserva y Política de Cancelación.")}</Text>
            </Pressable>
          </View>

          {!state.photoUrl && (
            <View style={{ backgroundColor: "#3B0D0D", borderRadius: 8, padding: 10, marginBottom: 6 }}>
              <Text style={{ color: "#FCA5A5", textAlign: "center", fontSize: 12, fontWeight: "600" }}>
                {L("Add a profile photo in your profile for safety and identification before booking.", "Agrega una foto de perfil en tu perfil para seguridad e identificación antes de reservar.")}
              </Text>
            </View>
          )}

          {!canSubmit && !submitting ? (
            <View style={{ backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 8, padding: 10 }}>
              <Text style={{ color: "#CBD5E1", textAlign: "center", fontSize: 12, fontWeight: "600" }}>
                {L(
                  "Complete the vehicle, location, and agreement above to continue to payment.",
                  "Completa el vehículo, la ubicación y el acuerdo anteriores para continuar al pago.",
                )}
              </Text>
            </View>
          ) : null}

          <View style={{ backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 14, padding: 12 }}>
            <Text style={{ color: "#CBD5E1", fontSize: 12, lineHeight: 18 }}>
              {L(
                "Your card is authorized now for the estimated total and only charged after the job is completed and confirmed.",
                "Tu tarjeta se autoriza ahora por el total estimado y solo se cobra después de que el trabajo se complete y confirme.",
              )}
            </Text>
          </View>

          <StripePaymentSheet
            amount={Math.round(toChargeableAmount(estimatedTodayTotal) * 100)}
            currency={region === "MX" ? "mxn" : "usd"}
            savedMethods={state.paymentMethods}
            defaultMethodId={state.defaultPaymentMethodId}
            selectedMethodId={selectedPaymentMethodId}
            onSelectMethod={setSelectedPaymentMethodId}
            onAddNewCard={handleAddPaymentMethod}
            onConfirmPayment={handleConfirmPayment}
            loading={state.paymentStatus === "processing" || submitting}
            error={paymentError}
          />
        </ScrollView>
        </KeyboardAvoidingView>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#05193B" },
  pageShell: { flex: 1 },
  scrollArea: { flex: 1 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: "#F97316", // Orange to match unified headers
  },
  menuBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  topTitle: { color: "#F8FAFC", fontSize: 42 / 2, fontWeight: "900" },
  content: { paddingHorizontal: 16, paddingBottom: 20, gap: 14 },
  mapHero: {
    height: 210,
    borderRadius: 18,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  mapPinMarker: {
    alignItems: "center",
    justifyContent: "center",
  },
  pinWrap: {
    backgroundColor: "rgba(5,25,59,0.35)",
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  locationChip: {
    position: "absolute",
    bottom: 12,
    backgroundColor: "rgba(4,17,43,0.9)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    maxWidth: "82%",
  },
  locationChipText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  sectionHeading: {
    color: "#FF6B14",
    fontSize: 40 / 2,
    fontWeight: "900",
    marginTop: 2,
  },
  serviceRow: { gap: 10, paddingRight: 24 },
  serviceCard: {
    width: 116,
    minHeight: 138,
    borderRadius: 16,
    padding: 10,
    gap: 6,
    justifyContent: "flex-start",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  serviceCardActive: {
    backgroundColor: "#FF5F0F",
    borderColor: "#FF7A24",
  },
  serviceTitle: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
    textAlign: "center",
    lineHeight: 16,
  },
  todayBadge: {
    backgroundColor: "#D9F6CF",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: "auto",
  },
  todayBadgeText: { color: "#143D0E", fontSize: 10, fontWeight: "800" },
  servicePrice: {
    color: "#F97316",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 2,
  },
  presetServiceBadge: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(53,224,208,0.35)",
    backgroundColor: "rgba(10,25,52,0.85)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  presetServiceLabel: { color: "#35E0D0", fontSize: 12, fontWeight: "800" },
  presetServiceValue: { color: "#F8FAFC", fontSize: 15, fontWeight: "900" },
  presetServiceMeta: { color: "#94A3B8", fontSize: 12, fontWeight: "700", marginTop: 2 },
  detailCard: {
    backgroundColor: "rgba(34,48,79,0.96)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    padding: 14,
    gap: 8,
  },
  detailTitle: { color: "#FF6B14", fontSize: 34 / 2, fontWeight: "900" },
  serviceDesc: {
    color: "#CBD5E1",
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 4,
  },
  question: { color: "#F8FAFC", fontSize: 16 / 2 + 5, fontWeight: "700" },
  segmentRow: { flexDirection: "row", gap: 10, marginTop: 2 },
  segmentBtn: {
    flex: 1,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  segmentBtnOn: {
    backgroundColor: "#FF5F0F",
    borderColor: "#FF7A24",
  },
  segmentText: { color: "#FFFFFF", fontSize: 17, fontWeight: "900" },
  helperText: { color: "#D3D9E5", fontSize: 14 / 2 + 5, lineHeight: 18 },
  photoLabel: { color: "#F8FAFC", fontSize: 16 / 2 + 5, fontWeight: "800", marginTop: 2 },
  uploadBox: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "rgba(255,126,40,0.8)",
    borderRadius: 14,
    minHeight: 104,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 14,
    gap: 4,
    position: "relative",
  },
  uploadText: { color: "#FFFFFF", fontSize: 17 / 2 + 6, fontWeight: "900" },
  skipInline: { position: "absolute", right: 12, bottom: 10, padding: 4 },
  skipInlineText: { color: "#FF8D4A", fontSize: 16 / 2 + 4, fontWeight: "800", textDecorationLine: "underline" },
  issueInput: {
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    color: "#F8FAFC",
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 52,
    fontSize: 16 / 2 + 6,
  },
  locationCard: {
    backgroundColor: "rgba(34,48,79,0.96)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    padding: 14,
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  locationTitle: { color: "#F8FAFC", fontSize: 16 / 2 + 5, fontWeight: "800" },
  locationRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  locationValue: { color: "#FFFFFF", flex: 1, fontSize: 17 / 2 + 6, fontWeight: "700", lineHeight: 21 },
  locationHint: { color: "#64748B", fontSize: 11, fontWeight: "600", marginTop: 2 },
  locationInput: {
    marginTop: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.08)",
    color: "#F8FAFC",
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  editPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.35)",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  editPillText: { color: "#FFFFFF", fontSize: 20 / 2 + 4, fontWeight: "800" },
  scheduleCard: {
    backgroundColor: "rgba(34,48,79,0.96)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    padding: 14,
    gap: 9,
  },
  scheduleHeader: {
    gap: 2,
    marginBottom: 2,
  },
  scheduleTitle: { color: "#FF6B14", fontSize: 17, fontWeight: "900" },
  scheduleSub: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "600",
  },
  dayChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  dayChipOn: { borderColor: "#FF7A24", backgroundColor: "rgba(255,95,15,0.28)" },
  dayChipText: { color: "#D8E0EE", fontSize: 12, fontWeight: "700" },
  dayChipTextOn: { color: "#FFFFFF" },
  timeRow: { flexDirection: "row", gap: 8 },
  timeChip: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    paddingVertical: 8,
  },
  timeChipOn: { borderColor: "#FF7A24", backgroundColor: "rgba(255,95,15,0.28)" },
  timeChipText: { color: "#D8E0EE", fontSize: 12, fontWeight: "700" },
  timeChipTextOn: { color: "#FFFFFF" },

  // New professional scheduling styles
  customTimeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(20, 184, 166, 0.12)",
    borderWidth: 1,
    borderColor: "#F97316",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 4,
  },
  customTimeButtonText: {
    color: "#F97316",
    fontSize: 14,
    fontWeight: "700",
  },
  selectedSchedule: {
    marginTop: 8,
    backgroundColor: "rgba(20, 184, 166, 0.1)",
    borderRadius: 10,
    padding: 10,
    borderLeftWidth: 3,
    borderLeftColor: "#F97316",
  },
  selectedLabel: {
    color: "#99F6E4",
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  selectedValue: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
    marginTop: 2,
  },

  // Pure JS Time Picker Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  timePickerModal: {
    backgroundColor: "#1F2937",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
  },
  modalTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 16,
  },
  timePickerRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 24,
    marginBottom: 20,
  },
  timeColumn: {
    alignItems: "center",
    width: 90,
    position: "relative",
  },
  columnLabel: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
  },
  timeScroll: {
    height: 200,
    width: 80,
  },
  timeOption: {
    height: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  timeOptionSelected: {
    backgroundColor: "rgba(20, 184, 166, 0.2)",
    borderRadius: 8,
  },
  timeOptionText: {
    color: "#CBD5E1",
    fontSize: 20,
    fontWeight: "600",
  },
  timeOptionTextSelected: {
    color: "#F97316",
    fontWeight: "800",
  },
  // Center indicator for wheel feel
  timeCenterLine: {
    position: "absolute",
    top: "50%",
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: "#F97316",
    opacity: 0.3,
    marginTop: -1,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
  },
  modalCancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
  },
  modalCancelText: {
    color: "#CBD5E1",
    fontSize: 16,
    fontWeight: "700",
  },
  modalConfirm: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#F97316",
    alignItems: "center",
  },
  modalConfirmText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },

  customTimeToggle: { color: "#FF9A57", fontSize: 13, fontWeight: "800", textDecorationLine: "underline" },
  estimateLine: {
    color: "#E3E8F2",
    fontSize: 14 / 2 + 6,
    textAlign: "center",
    fontWeight: "600",
    marginTop: 2,
  },
  ctaButton: {
    marginTop: 2,
    backgroundColor: "#FF5F0F",
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "#FF7A24",
  },
  ctaText: { color: "#FFFFFF", fontSize: 36 / 2, fontWeight: "900" },
  legalCard: {
    backgroundColor: "rgba(20,30,50,0.92)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    padding: 12,
    gap: 8,
  },
  legalTitle: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "800",
  },
  legalBody: {
    color: "#CBD5E1",
    fontSize: 12,
    lineHeight: 18,
  },
  agreeCheckRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 4,
  },
  checkBox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  checkBoxOn: {
    backgroundColor: "#F97316",
    borderColor: "#F97316",
  },
  agreeText: {
    color: "#E2E8F0",
    fontSize: 12,
    fontWeight: "700",
    flex: 1,
  },


  /* Vehicle summary card */
  vehicleCard: {
    backgroundColor: "rgba(34,48,79,0.96)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(20,184,166,0.25)",
    padding: 12,
  },
  vehicleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  vehicleIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(20,184,166,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  vehicleLabel: {
    color: "#99F6E4",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  vehicleValue: {
    color: "#F8FAFC",
    fontSize: 15,
    fontWeight: "800",
    marginTop: 1,
  },
  vehicleMissing: {
    color: "#FCA5A5",
    fontSize: 14,
    fontWeight: "700",
  },

  /* Professional price summary */
  priceCard: {
    backgroundColor: "rgba(34,48,79,0.96)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    padding: 14,
    gap: 6,
  },
  priceTitle: {
    color: "#FF6B14",
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 4,
  },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 3,
  },
  priceLabel: {
    color: "#E2E8F0",
    fontSize: 14,
    fontWeight: "600",
  },
  priceValue: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "700",
  },
  priceDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.12)",
    marginVertical: 4,
  },
  priceTotalLabel: {
    color: "#F8FAFC",
    fontSize: 15,
    fontWeight: "800",
  },
  priceTotalValue: {
    color: "#F97316",
    fontSize: 17,
    fontWeight: "900",
  },
  priceNote: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 4,
    lineHeight: 15,
  },

  /* Enhanced photo upload with preview */
  uploadBoxWithPreview: {
    minHeight: 72,
    padding: 10,
    borderStyle: "solid",
    borderColor: "rgba(20,184,166,0.4)",
    backgroundColor: "rgba(20,184,166,0.06)",
  },
  photoPreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  photoThumbWrap: {
    width: 56,
    height: 56,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  photoThumb: {
    width: "100%",
    height: "100%",
  },
  uploadSub: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  removePhotoBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(239,68,68,0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
});
