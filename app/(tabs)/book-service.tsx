import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useStore, useSelectedVehicle } from "@/lib/store";
import { useAuth } from "@/lib/auth-context";
import { useImagePicker } from "@/hooks/use-image-picker";
import { getServiceType, SERVICE_TYPES } from "@/lib/seed";
import { useLocaleContext } from "@/hooks/use-locale";
import { haptic } from "@/lib/haptics";
import { resolveAuthSession } from "@/lib/resolve-auth-session";
import { createDispatchRequest, sendServiceMessage } from "@/lib/live-dispatch";
import type { Job, ServiceCode } from "@/lib/types";
import { DEFAULT_COORDS } from "@/lib/seed";
import { getCurrencyForRegion } from "@/lib/stripe";
import { localizedServiceName } from "@/lib/service-i18n";
import { useAppDrawer } from "@/lib/app-drawer-context";
import { buildVehicleLabel } from "@/lib/vehicle-label";
import { buildBookedCustomerNote } from "@/lib/booked-trip";
import MapView, { Marker, type Region } from "react-native-maps";
import { regionFor } from "@/lib/geo";

const BOOKING_FEE_RATE = 0.18;
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

function dayOptionLabel(date: Date, locale: "en-US" | "es-MX") {
  return date.toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" });
}

export default function BookServiceTabScreen() {
  const router = useRouter();
  const { openDrawer } = useAppDrawer();
  const { service: prefilledService, oilPackage: prefilledOilPackage } = useLocalSearchParams<{
    service?: string;
    oilPackage?: OilPkg;
  }>();
  const { state, dispatch } = useStore();
  const { user } = useAuth();
  const vehicle = useSelectedVehicle();
  const { region, locale, formatPrice } = useLocaleContext();
  const isEs = locale === "es-MX";
  const L = (en: string, es: string) => (isEs ? es : en);
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
  const [oilPackage, setOilPackage] = useState<OilPkg>(prefilledOilPackage ?? "full_synthetic");
  const [hasOwnParts, setHasOwnParts] = useState<boolean>(prefilledOilPackage === "own_oil_filter");
  const [issuePhotoUri, setIssuePhotoUri] = useState<string | null>(null);
  const [issueMessage, setIssueMessage] = useState("");
  const [location, setLocation] = useState(state.defaultLocation);
  const [locationEdit, setLocationEdit] = useState(false);
  const [dayOffset, setDayOffset] = useState(0);
  const [timeSlot, setTimeSlot] = useState("12:00");
  const [useCustomTime, setUseCustomTime] = useState(false);
  const [customHour, setCustomHour] = useState("09");
  const [customMinute, setCustomMinute] = useState("00");
  const [submitting, setSubmitting] = useState(false);
  const [agreementChecked, setAgreementChecked] = useState(false);
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const mapRef = useRef<MapView>(null);

  const selectedService = getServiceType(serviceCode) ?? bookingServices[0];
  const serviceCoords = state.userCoords ?? FALLBACK_COORDS;
  const mapRegion: Region = useMemo(() => regionFor([serviceCoords], 1.4), [serviceCoords.latitude, serviceCoords.longitude]);

  useEffect(() => {
    mapRef.current?.animateToRegion(mapRegion, 350);
  }, [mapRegion]);

  useEffect(() => {
    if (prefilledOilPackage === "own_oil_filter") setHasOwnParts(true);
  }, [prefilledOilPackage]);
  const laborPrice = selectedService.basePrice;
  const bookingFee = +(laborPrice * BOOKING_FEE_RATE).toFixed(2);
  const estimatedTodayTotal = +(laborPrice + bookingFee).toFixed(2);

  const scheduledFor = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + dayOffset);
    const rawTime = useCustomTime ? `${customHour}:${customMinute}` : timeSlot;
    const [h, m] = rawTime.split(":").map((n) => parseInt(n, 10));
    const hh = Number.isFinite(h) ? Math.max(0, Math.min(23, h)) : 9;
    const mm = Number.isFinite(m) ? Math.max(0, Math.min(59, m)) : 0;
    date.setHours(hh, mm, 0, 0);
    return date;
  }, [dayOffset, timeSlot, useCustomTime, customHour, customMinute]);

  const dayOptions = Array.from({ length: 8 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return { value: i, label: dayOptionLabel(d, isEs ? "es-MX" : "en-US") };
  });
  const baseTimeSlots = ["09:00", "12:00", "15:00", "18:00"];
  const availableTimeSlots = useMemo(() => {
    if (dayOffset !== 0) return baseTimeSlots;
    const now = new Date();
    return baseTimeSlots.filter((slot) => {
      const [h, m] = slot.split(":").map((n) => parseInt(n, 10));
      if (!Number.isFinite(h) || !Number.isFinite(m)) return false;
      return h > now.getHours() || (h === now.getHours() && m >= now.getMinutes());
    });
  }, [dayOffset]);

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

  const handleCreateBooking = async () => {
    if (!vehicle || !selectedService) {
      haptic.error();
      return;
    }
    if (!user?.id) {
      Alert.alert(L("Sign in required", "Se requiere iniciar sesión"));
      return;
    }
    setSubmitting(true);
    try {
      const resolved = await resolveAuthSession(user, (err) => {
        Alert.alert(L("Could not book service", "No se pudo agendar"), err.message);
      });
      if (!resolved) return;

      const vehicleLabel = buildVehicleLabel(vehicle);
      const request = await createDispatchRequest(resolved.sessionToken, {
        customerUserId: user.id,
        customerName: state.userName,
        customerPhotoUrl: state.photoUrl ?? null,
        serviceCode: selectedService.code,
        vehicleLabel,
        locationLabel: location.trim(),
        offeredPrice: estimatedTodayTotal,
        oilPackage:
          selectedService.code === "oil_change"
            ? (oilPackage === "conventional" || oilPackage === "full_synthetic" ? oilPackage : null)
            : null,
        platformFeeRate: BOOKING_FEE_RATE,
        platformFeeAmount: bookingFee,
        mechanicPayout: +(estimatedTodayTotal - bookingFee).toFixed(2),
        scheduledFor: scheduledFor.toISOString(),
        customerNote: buildBookedCustomerNote(issueMessage.trim() || null, scheduledFor.toISOString()),
        customerHasParts: hasOwnParts,
        issuePhotoUrl: issuePhotoUri ?? null,
        currency: getCurrencyForRegion(region),
        regionCode: region,
      });

      const noteLines = [
        `${L("Scheduled", "Programado")}: ${scheduledFor.toLocaleString(isEs ? "es-MX" : "en-US")}`,
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
          base: bookingFee,
          service: laborPrice,
          distance: 0,
          total: estimatedTodayTotal,
        },
        pickup: state.userCoords ?? DEFAULT_COORDS,
        paymentMethodId: state.defaultPaymentMethodId ?? undefined,
      };
      dispatch({ type: "CREATE_JOB", payload: job });
      haptic.success();
      router.push("/request-pending" as any);
    } catch (error) {
      console.error("[BookService] create booking failed:", error);
      haptic.error();
      Alert.alert(
        L("Booking failed", "No se pudo crear la reserva"),
        L("Please try again in a moment.", "Inténtalo de nuevo en un momento."),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const estMin = selectedService.estimatedMinutes;
  const estHoursMin = Math.max(1, Math.floor(estMin / 30));
  const estHoursMax = Math.max(estHoursMin + 1, Math.ceil(estMin / 20));
  const lowPrice = Math.round(laborPrice * 0.95);
  const highPrice = Math.round((laborPrice + bookingFee) * 1.3);

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <View style={styles.root}>
        <View style={styles.topBar}>
          <Pressable onPress={openDrawer} style={styles.menuBtn}>
            <IconSymbol name="line.3.horizontal" size={24} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.topTitle}>{L("Book Service", "Agendar servicio")}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.mapHero}>
            <MapView
              ref={mapRef}
              style={StyleSheet.absoluteFill}
              initialRegion={mapRegion}
              customMapStyle={MAP_STYLE_DARK}
              showsUserLocation
              showsMyLocationButton={false}
              showsCompass={false}
              rotateEnabled={false}
              pitchEnabled={false}
              toolbarEnabled={false}
            >
              <Marker coordinate={serviceCoords}>
                <View style={styles.mapPinMarker}>
                  <IconSymbol name="mappin.circle.fill" size={30} color="#FF5F0F" />
                </View>
              </Marker>
            </MapView>
            <View style={styles.pinWrap}>
              <IconSymbol name="mappin.circle.fill" size={58} color="#FF5F0F" />
            </View>
            <View style={styles.locationChip}>
              <Text style={styles.locationChipText} numberOfLines={1}>{location}</Text>
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
                      <IconSymbol name={svc.icon} size={26} color="#FFFFFF" />
                      <Text style={styles.serviceTitle} numberOfLines={2}>
                        {localizedServiceName(svc.code, locale)}
                      </Text>
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
            </View>
          )}

          <View style={styles.detailCard}>
            <Text style={styles.detailTitle}>{L("Booking details", "Detalles de reserva")}</Text>
            {serviceCode === "other" ? (
              <View style={styles.otherSummaryCard}>
                <Text style={styles.otherSummaryTitle}>{L("Custom Service Summary", "Resumen de servicio personalizado")}</Text>
                <Text style={styles.otherSummaryRow}>
                  {L("Full payout", "Pago total")}: {formatPrice(laborPrice)}
                </Text>
                <Text style={styles.otherSummaryRow}>
                  +18% {L("booking fee", "de tarifa de reserva")}: {formatPrice(bookingFee)}
                </Text>
                <Text style={styles.otherSummaryTotal}>
                  {L("Estimated total", "Total estimado")}: {formatPrice(estimatedTodayTotal)}
                </Text>
                <Text style={styles.otherSummaryMeta}>
                  {L("Address", "Dirección")}: {location}
                </Text>
                <Text style={styles.otherSummaryMeta}>
                  {L("Date & time", "Fecha y hora")}: {scheduledFor.toLocaleString(isEs ? "es-MX" : "en-US")}
                </Text>
              </View>
            ) : null}
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
            <Pressable onPress={pickIssuePhoto} style={styles.uploadBox}>
              <IconSymbol name="camera.fill" size={44} color="#FFFFFF" />
              <Text style={styles.uploadText}>{issuePhotoUri ? L("Change photo", "Cambiar foto") : L("Upload photo", "Subir foto")}</Text>
              {!issuePhotoUri ? (
                <Pressable onPress={() => setIssuePhotoUri(null)} style={styles.skipInline}>
                  <Text style={styles.skipInlineText}>{L("Skip", "Omitir")}</Text>
                </Pressable>
              ) : null}
            </Pressable>

            <TextInput
              value={issueMessage}
              onChangeText={setIssueMessage}
              placeholder={L("Describe noises, warning lights, smells, symptoms...", "Describe ruidos, luces, olores, síntomas...")}
              placeholderTextColor="#A8B3C7"
              multiline
              style={styles.issueInput}
            />
          </View>

          <View style={styles.locationCard}>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={styles.locationTitle}>{L("Service location", "Ubicación del servicio")}</Text>
              <View style={styles.locationRow}>
                <IconSymbol name="location.fill" size={18} color="#FFFFFF" />
                <Text style={styles.locationValue} numberOfLines={2}>{location}</Text>
              </View>
              {locationEdit ? (
                <TextInput
                  value={location}
                  onChangeText={setLocation}
                  placeholder={L("Street, city, state", "Calle, ciudad, estado")}
                  placeholderTextColor="#A8B3C7"
                  style={styles.locationInput}
                />
              ) : null}
            </View>
            <Pressable style={styles.editPill} onPress={() => setLocationEdit((v) => !v)}>
              <Text style={styles.editPillText}>{locationEdit ? L("Done", "Listo") : "edit"}</Text>
              <IconSymbol name="pencil" size={14} color="#FFFFFF" />
            </Pressable>
          </View>

          <View style={styles.scheduleCard}>
            <Text style={styles.scheduleTitle}>{L("Schedule", "Horario")}</Text>
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
                  <Text style={[styles.timeChipText, timeSlot === slot && styles.timeChipTextOn]}>{slot}</Text>
                </Pressable>
              ))}
            </View>
            {availableTimeSlots.length === 0 ? (
              <Text style={styles.helperText}>
                {L("No preset slots left for today. Please select another day or custom time.", "No quedan horarios predefinidos para hoy. Selecciona otro día o una hora personalizada.")}
              </Text>
            ) : null}
            <Pressable onPress={() => setUseCustomTime((prev) => !prev)}>
              <Text style={styles.customTimeToggle}>{L("Custom time", "Hora personalizada")}</Text>
            </Pressable>
            {useCustomTime ? (
              <View style={styles.customRow}>
                <TextInput
                  value={customHour}
                  onChangeText={(v) => setCustomHour(v.replace(/[^\d]/g, "").slice(0, 2))}
                  placeholder="09"
                  placeholderTextColor="#A8B3C7"
                  keyboardType="number-pad"
                  style={styles.customInput}
                  maxLength={2}
                />
                <Text style={styles.customColon}>:</Text>
                <TextInput
                  value={customMinute}
                  onChangeText={(v) => setCustomMinute(v.replace(/[^\d]/g, "").slice(0, 2))}
                  placeholder="00"
                  placeholderTextColor="#A8B3C7"
                  keyboardType="number-pad"
                  style={styles.customInput}
                  maxLength={2}
                />
              </View>
            ) : null}
          </View>

          <Text style={styles.estimateLine}>
            {L("Est. service time", "Est. tiempo de servicio")}: {estHoursMin}h - {estHoursMax}h | {formatPrice(lowPrice)} - {formatPrice(highPrice)}
          </Text>

          <View style={styles.legalCard}>
            <Text style={styles.legalTitle}>{L("Service Booking Agreement & Cancellation Policy", "Acuerdo de Reserva de Servicio y Política de Cancelación")}</Text>
            <Text style={styles.legalBody}>
              {L(
                "By clicking “Request a Mechanic” and completing your booking, you agree to the following terms:\n\n1. Cancellation Policy\nWe understand plans can change. However, once a mechanic is assigned and begins traveling to your location, we incur significant time and dispatch costs.\n\nYou may cancel or reschedule free of charge at any time before a mechanic is dispatched to your location.\nIf you cancel after a mechanic has been dispatched or within 30 minutes of the scheduled arrival time, you will be charged a Cancellation Fee of $19.00.\nNo-Show Policy: If you are not present at the service location at the agreed time (or within a reasonable grace period), you will be charged the full estimated service amount or $50, whichever is greater.\n\n2. Payment Authorization\nYou authorize us to charge the payment method on file for any applicable cancellation fees, no-show fees, or completed services.\n\n3. General Terms\nAll service requests are subject to mechanic availability.\nPrices shown are estimates. Final cost may vary based on diagnosis and parts required.\nWe reserve the right to refuse service if the vehicle or situation is unsafe or outside our scope of work.\n\nBy proceeding, you confirm that you have read, understood, and agree to this Cancellation Policy and the full Terms of Service.",
                "Al hacer clic en “Solicitar un mecánico” y completar tu reserva, aceptas los siguientes términos:\n\n1. Política de cancelación\nEntendemos que los planes pueden cambiar. Sin embargo, una vez que se asigna un mecánico y comienza a trasladarse a tu ubicación, incurrimos en costos significativos de tiempo y despacho.\n\nPuedes cancelar o reprogramar sin costo en cualquier momento antes de que se despache un mecánico a tu ubicación.\nSi cancelas después de que un mecánico haya sido despachado o dentro de los 30 minutos previos a la hora programada de llegada, se te cobrará una tarifa de cancelación de $19.00.\nPolítica de no presentación: si no estás presente en la ubicación del servicio a la hora acordada (o dentro de un período de gracia razonable), se te cobrará el monto total estimado del servicio o $50, lo que sea mayor.\n\n2. Autorización de pago\nNos autorizas a cobrar el método de pago registrado por cualquier tarifa de cancelación aplicable, cargo por no presentación o servicios completados.\n\n3. Términos generales\nTodas las solicitudes de servicio están sujetas a disponibilidad de mecánicos.\nLos precios mostrados son estimados. El costo final puede variar según diagnóstico y refacciones requeridas.\nNos reservamos el derecho de rechazar el servicio si el vehículo o la situación es insegura o está fuera de nuestro alcance de trabajo.\n\nAl continuar, confirmas que has leído, entendido y aceptas esta Política de Cancelación y los Términos de Servicio completos."
              )}
            </Text>
            <Pressable onPress={() => setAgreementChecked((v) => !v)} style={styles.agreeCheckRow}>
              <View style={[styles.checkBox, agreementChecked && styles.checkBoxOn]}>
                {agreementChecked ? <IconSymbol name="checkmark" size={12} color="#FFFFFF" /> : null}
              </View>
              <Text style={styles.agreeText}>{L("I have read and I accept these terms.", "He leído y acepto estos términos.")}</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (!agreementChecked) {
                  haptic.warning();
                  return;
                }
                setAgreementAccepted(true);
                haptic.success();
              }}
              style={({ pressed }) => [
                styles.iAgreeBtn,
                (!agreementChecked || agreementAccepted) && { opacity: 0.55 },
                pressed && { opacity: 0.9 },
              ]}
              disabled={!agreementChecked || agreementAccepted}
            >
              <Text style={styles.iAgreeText}>{agreementAccepted ? L("Agreement Accepted", "Acuerdo aceptado") : L("I Agree", "Acepto")}</Text>
            </Pressable>
          </View>

          <Pressable
            onPress={handleCreateBooking}
            disabled={!canSubmit}
            style={({ pressed }) => [
              styles.ctaButton,
              !canSubmit && { opacity: 0.5 },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={styles.ctaText}>
              {submitting ? L("Submitting...", "Enviando...") : (isEs ? "AGENDAR AHORA" : "BOOK NOW")}
            </Text>
          </Pressable>
        </ScrollView>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#05193B" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 6,
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
  content: { paddingHorizontal: 16, paddingBottom: 22, gap: 14 },
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
    minHeight: 132,
    borderRadius: 16,
    padding: 10,
    gap: 8,
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
    fontSize: 16 / 2 + 2,
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
  detailCard: {
    backgroundColor: "rgba(34,48,79,0.96)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    padding: 14,
    gap: 8,
  },
  detailTitle: { color: "#FF6B14", fontSize: 34 / 2, fontWeight: "900" },
  otherSummaryCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(53,224,208,0.45)",
    backgroundColor: "rgba(3,16,36,0.7)",
    padding: 10,
    gap: 3,
  },
  otherSummaryTitle: { color: "#35E0D0", fontSize: 13, fontWeight: "900" },
  otherSummaryRow: { color: "#E2E8F0", fontSize: 12, fontWeight: "700" },
  otherSummaryTotal: { color: "#FF9A57", fontSize: 13, fontWeight: "900", marginTop: 2 },
  otherSummaryMeta: { color: "#CBD5E1", fontSize: 11, fontWeight: "600" },
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
    minHeight: 118,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    gap: 6,
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
  scheduleTitle: { color: "#FF6B14", fontSize: 17, fontWeight: "900" },
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
  customTimeToggle: { color: "#FF9A57", fontSize: 13, fontWeight: "800", textDecorationLine: "underline" },
  customRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  customInput: {
    width: 56,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.08)",
    color: "#FFFFFF",
    textAlign: "center",
    paddingVertical: 8,
    fontSize: 15,
    fontWeight: "700",
  },
  customColon: { color: "#FFFFFF", fontSize: 20, fontWeight: "800" },
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
  iAgreeBtn: {
    marginTop: 6,
    borderRadius: 10,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
  },
  iAgreeText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
});
