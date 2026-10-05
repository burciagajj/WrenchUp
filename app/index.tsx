import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Animated,
  Easing,
  Modal,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  Alert,
} from "react-native";
import { useRouter, useSegments } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { InlineToast } from "@/components/inline-toast";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useStore, useSelectedVehicle } from "@/lib/store";
import { haptic } from "@/lib/haptics";
import { useAuth } from "@/lib/auth-context";
import { getServiceType } from "@/lib/seed";
import { fetchLocationAndAddress } from "@/lib/location";
import { CURRENT_LOCATION_LABEL, resolveServiceLocationLabel } from "@/lib/location-label";
import { geocodeServiceAddress } from "@/lib/service-location";
import { MechanicHome } from "@/components/mechanic-home";
import { useAppDrawer } from "@/lib/app-drawer-context";
import { useLocaleContext, useL } from "@/hooks/use-locale";
import { HomeMap } from "@/components/home-map";
import { LocationAutocompleteInput } from "@/components/location-autocomplete-input";
import { MainBottomNav } from "@/components/main-bottom-nav";
import { SymptomChecker } from "@/components/symptom-checker";
import { getSessionToken } from "@/lib/auth-context";
import { useTapGuard } from "@/hooks/use-tap-guard";
import { supabaseUserData } from "@/lib/_core/supabase-user-data";

import { localizedServiceName } from "@/lib/service-i18n";

const QUICK_SERVICE_CODES = [
  "battery_jump",
  "flat_tire",
  "lockout",
  "car_wash",
  "quick_check_up",
  "fuel_delivery",
] as const;

export default function HomeScreen() {
  const router = useRouter();
  const segments = useSegments() as string[];
  const { state, dispatch } = useStore();
  const { openDrawer } = useAppDrawer();
  const vehicle = useSelectedVehicle();
  const { locale, formatPrice } = useLocaleContext();
  const L = useL();
  const { user } = useAuth();
  const [profileWarning, setProfileWarning] = useState<string | null>(null);
  const guardOpenServiceSelect = useTapGuard();
  const greeting = useMemo(() => getTimeGreeting(locale), [locale]);
  const quickServices = useMemo(
    () =>
      QUICK_SERVICE_CODES.map((code) => {
        const service = getServiceType(code);
        if (!service) return null;
        return {
          code,
          name: localizedServiceName(service.code, locale),
          price: formatPrice(service.basePrice),
          icon: service.icon,
          minutes: service.estimatedMinutes,
        };
      }).filter((item): item is NonNullable<typeof item> => !!item),
    [formatPrice, locale],
  );
  const unreadNotifications = state.notificationsInbox.some((n) => !n.readAt);

  // Ref to always get latest state in event handlers (avoids stale closures on click)
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // For location edit modal
  const [showLocationEdit, setShowLocationEdit] = useState(false);
  const [editLocationText, setEditLocationText] = useState(state.defaultLocation || "");
  const [locationRefreshing, setLocationRefreshing] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);
  const activeRole = state.dashboardRoleOverride ?? state.role;
  const isInTabsShell = segments.includes("(tabs)");
  const bottomNavLabels = useMemo(
    () => ({
      home: L("Home", "Inicio"),
      book: L("Book", "Reservar"),
      booked: L("Booked", "Agendado"),
      activity: L("Activity", "Actividad"),
      menu: L("Menu", "Menú"),
    }),
    [L],
  );

  if (activeRole === "mechanic") return <MechanicHome />;

  // Defensive: never treat a cancelled or completed job as the "active" one for banners/CTAs
  const activeJob = state.activeJobId
    ? state.jobs.find((j) => j.id === state.activeJobId && j.status !== "cancelled" && j.status !== "completed") ?? null
    : null;

  // Clean unified status for the main CTA and banner
  const requestMode = getHomeRequestMode(activeJob);
  const waitingForMechanicConfirmation = !!activeJob?.customerQuoteAcceptedAt && activeJob.status === "searching";
  const showStatusButton = requestMode !== "none";
  const isLookingForMechanic = requestMode === "searching";
  const isBookedUpcoming = requestMode === "booked";
  const bookedReadyLabel = locale === "es-MX" ? "Listo para salir" : "Ready to start";
  const bookedScheduleLabel =
    isBookedUpcoming && typeof activeJob?.scheduledFor === "number"
      ? formatBookedScheduleLabel(activeJob.scheduledFor, locale)
      : null;
  const hasActiveRequest = showStatusButton;

  const vehicleLabel = vehicle
    ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`
    : L("No vehicle selected", "Sin vehículo seleccionado");

  const openServiceSelect = guardOpenServiceSelect(async (serviceCode?: string) => {
    // More auth/safety: require profile photo for booking
    if (!user || !state.photoUrl) {
      haptic.warning();
      setProfileWarning(
        !user
          ? L("Sign in before requesting a mechanic.", "Inicia sesión antes de solicitar un mecánico.")
          : L(
              "Add a profile photo for safety and identification before requesting a mechanic.",
              "Agrega una foto de perfil para seguridad e identificación antes de solicitar un mecánico."
            )
      );
      return;
    }
    // Real-money safety gate: the server (payment-intent+api.ts) enforces
    // this too and is the real boundary — this check is just so a customer
    // waiting on approval sees a clear message here instead of getting all
    // the way to the payment screen and hitting a server error there.
    try {
      const token = await getSessionToken();
      if (token) {
        const profile = await supabaseUserData.getOrCreateProfile(user.id, "customer", token);
        if (profile.avatar_status !== "approved") {
          haptic.warning();
          setProfileWarning(
            L(
              "Your account is still pending approval. You'll be able to request a mechanic once it's approved.",
              "Tu cuenta aún está pendiente de aprobación. Podrás solicitar un mecánico una vez aprobada.",
            )
          );
          return;
        }
      }
    } catch (err) {
      console.error("[Home] Approval check failed:", err);
      // Fail closed — if we can't confirm approval, don't let the customer
      // proceed to a real charge. The server enforces this regardless.
      haptic.warning();
      setProfileWarning(
        L("Could not verify your account right now. Please try again.", "No se pudo verificar tu cuenta. Inténtalo de nuevo.")
      );
      return;
    }
    haptic.medium();
    if (serviceCode) {
      router.push({ pathname: "/confirm" as any, params: { service: serviceCode } } as any);
      return;
    }
    router.push("/service-select" as any);
  });

  const navigateFromActiveRequest = () => {
    haptic.light();
    const currentState = stateRef.current;
    const currentActiveJob = currentState.activeJobId
      ? currentState.jobs.find(
          (j) => j.id === currentState.activeJobId && j.status !== "cancelled" && j.status !== "completed",
        ) ?? null
      : null;
    const currentRequestMode = getHomeRequestMode(currentActiveJob);
    const target =
      currentRequestMode === "searching"
        ? "/request-pending"
        : currentRequestMode === "booked"
          ? "/(tabs)/booked-requests"
          : "/tracking";
    router.push(target as any);
  };

  const handlePrimaryCta = () => {
    const currentState = stateRef.current;
    const currentActiveJob = currentState.activeJobId
      ? currentState.jobs.find(
          (j) => j.id === currentState.activeJobId && j.status !== "cancelled" && j.status !== "completed",
        ) ?? null
      : null;
    const currentRequestMode = getHomeRequestMode(currentActiveJob);
    if (currentRequestMode !== "none") {
      navigateFromActiveRequest();
      return;
    }
    openServiceSelect();
  };

  const refreshLocation = async () => {
    if (locationRefreshing) return;
    setLocationRefreshing(true);
    haptic.light();
    try {
      const result = await fetchLocationAndAddress();
      if (result.status === "granted" && result.coords) {
        // Refresh = "use where I am now": drop any address chosen with Change.
        dispatch({
          type: "SET_SERVICE_LOCATION",
          payload: { label: result.address?.trim() || CURRENT_LOCATION_LABEL, coords: null },
        });
        dispatch({
          type: "SET_USER_COORDS",
          payload: {
            coords: result.coords,
            status: "granted",
            address: resolveServiceLocationLabel(state.defaultLocation, result.coords, result.address),
          },
        });
        return;
      }
      dispatch({
        type: "SET_USER_COORDS",
        payload: { coords: state.userCoords, status: "denied" },
      });
    } finally {
      setLocationRefreshing(false);
    }
  };

  return (
    <ScreenContainer edges={["top", "left", "right"]} style={styles.root}>
      <InlineToast
        visible={!!profileWarning}
        title={L("Complete your profile for safety", "Completa tu perfil por seguridad")}
        message={profileWarning ?? ""}
        onDismiss={() => setProfileWarning(null)}
      />
      <View style={styles.bgOrbA} />
      <View style={styles.bgOrbB} />
      <View style={styles.screenShell}>
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={[styles.content, !isInTabsShell && styles.contentWithBottomNav]}
          showsVerticalScrollIndicator={false}
        >
        <View style={styles.headerRow}>
          <Pressable
            style={styles.menuBtn}
            onPress={() => {
              haptic.light();
              openDrawer();
            }}
          >
            <IconSymbol name="line.3.horizontal" size={22} color="#F97316" />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.greetingEyebrow}>{greeting}</Text>
            <Text style={styles.greeting}>{state.userName || L("there", "hola")}</Text>
            <Text style={styles.greetingSub}>
              {L("Roadside help, on demand", "Asistencia vial, bajo demanda")}
            </Text>
          </View>
          <Pressable style={styles.bellBtn} onPress={() => router.push("/notifications" as any)}>
            <IconSymbol name="bell.fill" size={18} color="#F8FAFC" />
            {unreadNotifications ? <View style={styles.bellDot} /> : null}
          </Pressable>
        </View>

        {hasActiveRequest ? (
          <Pressable style={styles.activeRequestBanner} onPress={navigateFromActiveRequest}>
            <View style={styles.bannerIconWrap}>
              <IconSymbol
                name={isLookingForMechanic ? "magnifyingglass" : isBookedUpcoming ? "clock.fill" : "bolt.fill"}
                size={18}
                color="#FDBA74"
              />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <View style={styles.livePill}>
                <View style={styles.liveDot} />
                <Text style={styles.livePillText}>{L("ACTIVE REQUEST", "SOLICITUD ACTIVA")}</Text>
              </View>
              <Text style={styles.bannerTitle}>
                {isBookedUpcoming
                  ? L("Upcoming booked service", "Servicio agendado próximo")
                  : waitingForMechanicConfirmation
                    ? L("Offer accepted, waiting for mechanic", "Oferta aceptada, esperando al mecánico")
                    : isLookingForMechanic
                      ? L("Looking for a mechanic...", "Buscando un mecánico...")
                      : L("Service request active", "Solicitud de servicio activa")}
              </Text>
              <Text style={styles.bannerSubtitle}>
                {isBookedUpcoming
                  ? bookedScheduleLabel
                    ? bookedScheduleLabel === bookedReadyLabel
                      ? L("Waiting to go live. Tap to view booking.", "Esperando para salir. Toca para ver la reserva.")
                      : L(
                          `Scheduled for ${bookedScheduleLabel}. Tap to view booking.`,
                          `Programado para ${bookedScheduleLabel}. Toca para ver la reserva.`,
                        )
                    : L("Tap to view booking.", "Toca para ver la reserva.")
                  : waitingForMechanicConfirmation
                    ? L("Tap to view the quote and confirmation status", "Toca para ver la oferta y su confirmación")
                    : L("Tap to view live status", "Toca para ver el estado en vivo")}
              </Text>
            </View>
            <IconSymbol name="chevron.right" size={16} color="#94A3B8" />
          </Pressable>
        ) : null}

        {/* Persistent, dismissible cancellation notices (stay on home until user dismisses) */}
        {state.recentCancellations.length > 0 && (
          <View style={styles.cancelNoticeList}>
            {state.recentCancellations.map((c) => {
              const svc = c.service ? getServiceType(c.service) : undefined;
              return (
                <View key={c.jobId} style={styles.cancelNotice}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cancelNoticeTitle}>
                      {c.isBooked ? L("Booked service cancelled", "Servicio agendado cancelado") : L("Service request cancelled", "Solicitud de servicio cancelada")}
                    </Text>
                    <Text style={styles.cancelNoticeSub}>
                      {svc?.name || L("Service", "Servicio")} • {c.location || L("your location", "tu ubicación")}
                    </Text>
                    <Text style={styles.cancelNoticeHint}>
                      {L("Cancellation confirmed. Tap × to dismiss.", "Cancelación confirmada. Toca × para descartar.")}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => {
                      haptic.light();
                      dispatch({ type: "DISMISS_CANCELLATION_NOTICE", payload: { jobId: c.jobId } });
                    }}
                    hitSlop={12}
                    style={{ padding: 4 }}
                  >
                    <IconSymbol name="xmark.circle.fill" size={20} color="#64748B" />
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}

        <View style={styles.mapShell}>
          <HomeMap locateBottomOffset={8} />
          <View style={styles.mapOverlay}>
            <View style={styles.mapPill}>
              <IconSymbol name="location.fill" size={12} color="#FDBA74" />
              <Text style={styles.mapPillText} numberOfLines={1}>
                {state.defaultLocation || L("Set your service location", "Establece tu ubicación de servicio")}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.tripCard}>
          <Text style={styles.tripCardTitle}>{L("Your trip details", "Detalles de tu viaje")}</Text>

          <View style={styles.detailRow}>
            <View style={styles.detailIcon}>
              <IconSymbol name="location.fill" size={16} color="#F97316" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.detailLabel}>{L("Service location", "Ubicación del servicio")}</Text>
              <Text style={styles.detailValue} numberOfLines={2}>
                {state.defaultLocation || L("No location set", "Sin ubicación establecida")}
              </Text>
            </View>
            <View style={styles.detailActions}>
              <Pressable onPress={refreshLocation} style={styles.chipBtn}>
                <Text style={styles.chipBtnText}>
                  {locationRefreshing ? L("Refreshing", "Actualizando") : L("Refresh", "Actualizar")}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  haptic.light();
                  setEditLocationText(state.defaultLocation || "");
                  setShowLocationEdit(true);
                }}
                style={styles.chipBtn}
              >
                <Text style={styles.chipBtnText}>{L("Change", "Cambiar")}</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.detailDivider} />

          <View style={styles.detailRow}>
            <View style={styles.detailIcon}>
              <IconSymbol name="car.fill" size={16} color="#F97316" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.detailLabel}>{L("Vehicle", "Vehículo")}</Text>
              <Text style={styles.detailValue}>{vehicleLabel}</Text>
            </View>
            <Pressable onPress={() => router.push("/(tabs)/vehicles" as any)} style={styles.chipBtn}>
              <Text style={styles.chipBtnText}>{L("Change", "Cambiar")}</Text>
            </Pressable>
          </View>

          <Pressable
            onPress={handlePrimaryCta}
            style={[styles.requestBtn, hasActiveRequest && styles.requestBtnStatus]}
          >
            <View style={styles.requestCopy}>
              <Text style={styles.requestText}>
                {hasActiveRequest
                  ? isLookingForMechanic
                    ? L("Looking for mechanic...", "Buscando mecánico...")
                    : isBookedUpcoming
                      ? L("View booking", "Ver reserva")
                      : L("View status", "Ver estado")
                  : L("Request a mechanic", "Solicitar un mecánico")}
              </Text>
              {!hasActiveRequest ? (
                <Text style={styles.requestSub}>
                  {L("Fast roadside help at your current location", "Asistencia rápida en tu ubicación actual")}
                </Text>
              ) : null}
            </View>
            {showStatusButton ? (
              isLookingForMechanic ? (
                <IconSymbol name="magnifyingglass" size={22} color="#FFFFFF" />
              ) : isBookedUpcoming ? (
                <IconSymbol name="clock.fill" size={22} color="#FFFFFF" />
              ) : (
                <SpinningGearIcon color="#FFFFFF" size={22} />
              )
            ) : (
              <IconSymbol name="arrow.right" size={22} color="#FFFFFF" />
            )}
          </Pressable>
        </View>

        {/* Simple location edit modal - polish for "Change" functionality */}
        <Modal
          visible={showLocationEdit}
          transparent
          animationType="slide"
          onRequestClose={() => setShowLocationEdit(false)}
        >
          <KeyboardAvoidingView
            behavior="padding"
            style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}
          >
            <View style={{ backgroundColor: "#1F2937", borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20 }}>
              <Text style={{ color: "#FFFFFF", fontSize: 18, fontWeight: "800", marginBottom: 12 }}>{L("Edit Service Location", "Editar ubicación del servicio")}</Text>
              <LocationAutocompleteInput
                value={editLocationText}
                onChangeText={setEditLocationText}
                placeholder={L("Enter address or landmark", "Ingresa dirección o punto de referencia")}
                placeholderTextColor="#64748B"
                style={{ backgroundColor: "#374151", color: "#FFFFFF", borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 16 }}
              />
              <View style={{ flexDirection: "row", gap: 12 }}>
                <Pressable
                  onPress={() => setShowLocationEdit(false)}
                  style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: "#374151", alignItems: "center" }}
                >
                  <Text style={{ color: "#CBD5E1", fontWeight: "700" }}>{L("Cancel", "Cancelar")}</Text>
                </Pressable>
                <Pressable
                  disabled={savingLocation}
                  onPress={async () => {
                    const address = editLocationText.trim();
                    if (!address) {
                      setShowLocationEdit(false);
                      return;
                    }
                    // Look up real coordinates: the mechanic is routed by
                    // coordinates, so saving only the text sent them to the
                    // phone's old GPS spot instead of this address.
                    setSavingLocation(true);
                    const coords = await geocodeServiceAddress(address);
                    setSavingLocation(false);
                    if (!coords) {
                      haptic.error();
                      Alert.alert(
                        L("Address not found", "Dirección no encontrada"),
                        L(
                          "We couldn't find that address. Check it, or pick one from the suggestions.",
                          "No pudimos encontrar esa dirección. Revísala o elige una de las sugerencias.",
                        ),
                      );
                      return;
                    }
                    dispatch({ type: "SET_SERVICE_LOCATION", payload: { label: address, coords } });
                    haptic.success();
                    setShowLocationEdit(false);
                  }}
                  style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: "#F97316", alignItems: "center" }}
                >
                  <Text style={{ color: "#FFFFFF", fontWeight: "800" }}>
                    {savingLocation ? L("Finding address…", "Buscando dirección…") : L("Save", "Guardar")}
                  </Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        <View style={styles.symptomCheckerWrap}>
          <SymptomChecker
            vehicleLabel={vehicleLabel}
            formatPrice={formatPrice}
            onBookService={(serviceCode) => openServiceSelect(serviceCode)}
          />
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{L("Quick services", "Servicios rápidos")}</Text>
          <Pressable onPress={() => openServiceSelect()} style={styles.sectionLink}>
            <Text style={styles.sectionLinkText}>{L("See all", "Ver todos")}</Text>
            <IconSymbol name="chevron.right" size={12} color="#F97316" />
          </Pressable>
        </View>
        <View style={styles.grid}>
          {quickServices.map((item) => (
            <Pressable
              key={item.code}
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]}
              onPress={() => openServiceSelect(item.code)}
            >
              <View style={styles.cardTop}>
                <View style={styles.iconBubble}>
                  <IconSymbol name={item.icon} size={20} color="#F97316" />
                </View>
                <IconSymbol name="chevron.right" size={12} color="#64748B" />
              </View>
              <Text style={styles.cardTitle}>{item.name}</Text>
              <Text style={styles.cardMeta}>~{item.minutes} min</Text>
              <Text style={styles.cardPrice}>{item.price}</Text>
            </Pressable>
          ))}
        </View>
        </ScrollView>
        {!isInTabsShell ? (
          <View style={styles.bottomNavWrap}>
            <MainBottomNav activeKey="home" labels={bottomNavLabels} />
          </View>
        ) : null}
      </View>
    </ScreenContainer>
  );
}

// Spinning gear icon for "View Status" button (customer sees this after mechanic accepts)
function SpinningGearIcon({ color, size = 22 }: { color: string; size?: number }) {
  const spinValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(spinValue, {
        toValue: 1,
        duration: 1400,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    animation.start();

    return () => animation.stop();
  }, [spinValue]);

  const rotate = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <IconSymbol name="gearshape.fill" size={size} color={color} />
    </Animated.View>
  );
}

type HomeRequestMode = "none" | "searching" | "booked" | "live";

function getHomeRequestMode(
  job: { status: string; isBooked?: boolean | null; scheduledFor?: number | null } | null,
): HomeRequestMode {
  if (!job) return "none";
  if (job.status === "searching") return "searching";
  const isBookedUpcoming = (!!job.isBooked || typeof job.scheduledFor === "number") && job.status === "accepted";
  if (isBookedUpcoming) return "booked";
  if (job.status === "accepted" || job.status === "enroute" || job.status === "arrived" || job.status === "in_progress") {
    return "live";
  }
  return "none";
}

function getTimeGreeting(locale: string): string {
  const hour = new Date().getHours();
  if (locale === "es-MX") {
    if (hour < 12) return "Buenos días";
    if (hour < 18) return "Buenas tardes";
    return "Buenas noches";
  }
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function formatBookedScheduleLabel(scheduledFor: number, locale: string): string {
  const now = new Date();
  const dateLocale = locale === "es-MX" ? "es-MX" : "en-US";
  const startAt = new Date(scheduledFor);
  const diffMinutes = Math.floor((startAt.getTime() - now.getTime()) / 60000);
  if (diffMinutes <= 0) {
    return locale === "es-MX" ? "Listo para salir" : "Ready to start";
  }
  if (diffMinutes < 90) {
    return locale === "es-MX" ? `Inicia en ${diffMinutes} min` : `Starts in ${diffMinutes} min`;
  }

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTarget = new Date(startAt.getFullYear(), startAt.getMonth(), startAt.getDate());
  const dayDiff = Math.round((startOfTarget.getTime() - startOfToday.getTime()) / 86400000);
  const timeLabel = new Intl.DateTimeFormat(dateLocale, { hour: "numeric", minute: "2-digit" }).format(startAt);

  if (dayDiff === 0) {
    return locale === "es-MX" ? `Hoy a las ${timeLabel}` : `Today at ${timeLabel}`;
  }
  if (dayDiff === 1) {
    return locale === "es-MX" ? `Mañana a las ${timeLabel}` : `Tomorrow at ${timeLabel}`;
  }
  return locale === "es-MX" ? `En ${dayDiff} días a las ${timeLabel}` : `In ${dayDiff} days at ${timeLabel}`;
}

const cardShadow = Platform.select({
  ios: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
  },
  android: { elevation: 6 },
  default: {},
});

const styles = StyleSheet.create({
  root: { backgroundColor: "#0B0F16", flex: 1 },
  screenShell: { flex: 1 },
  scrollArea: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 20, gap: 14 },
  contentWithBottomNav: { paddingBottom: 120 },
  bottomNavWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
  },
  bgOrbA: {
    position: "absolute",
    right: -80,
    top: -20,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: "rgba(249,115,22,0.10)",
  },
  bgOrbB: {
    position: "absolute",
    left: -120,
    top: 280,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(249,115,22,0.06)",
  },
  headerRow: { marginTop: 10, flexDirection: "row", alignItems: "center", gap: 12 },
  menuBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(249,115,22,0.35)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0B1220",
  },
  headerCopy: { flex: 1, gap: 2 },
  greetingEyebrow: {
    color: "#FDBA74",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  greeting: { color: "#F8FAFC", fontSize: 24, fontWeight: "800", lineHeight: 30 },
  greetingSub: { color: "#94A3B8", fontSize: 13, marginTop: 2 },
  bellBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "#0B1220",
    alignItems: "center",
    justifyContent: "center",
  },
  bellDot: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#EF4444",
  },
  activeRequestBanner: {
    borderRadius: 20,
    backgroundColor: "#0B1220",
    borderWidth: 1,
    borderColor: "rgba(249,115,22,0.28)",
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    ...cardShadow,
  },
  bannerIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "rgba(249,115,22,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  livePill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(249,115,22,0.14)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#F97316",
  },
  livePillText: {
    color: "#FDBA74",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  bannerTitle: { color: "#F8FAFC", fontSize: 16, fontWeight: "800" },
  bannerSubtitle: { color: "#94A3B8", fontSize: 13, lineHeight: 18 },
  cancelNoticeList: { gap: 8 },
  cancelNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: "rgba(127,29,29,0.35)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.35)",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  cancelNoticeTitle: { color: "#FCA5A5", fontSize: 14, fontWeight: "800" },
  cancelNoticeSub: { color: "#FECACA", fontSize: 13, marginTop: 2 },
  cancelNoticeHint: { color: "#9CA3AF", fontSize: 11, marginTop: 4 },
  mapShell: {
    height: 188,
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "#0B1220",
    ...cardShadow,
  },
  mapOverlay: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
  },
  mapPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(11,18,32,0.88)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  mapPillText: { flex: 1, color: "#F8FAFC", fontSize: 12, fontWeight: "700" },
  tripCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "#111827",
    padding: 16,
    gap: 12,
    ...cardShadow,
  },
  tripCardTitle: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  detailRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  detailIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(249,115,22,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  detailLabel: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  detailValue: { color: "#F8FAFC", fontSize: 15, fontWeight: "700", marginTop: 3, lineHeight: 21 },
  detailActions: { gap: 6, alignItems: "flex-end" },
  chipBtn: {
    backgroundColor: "rgba(249,115,22,0.12)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(249,115,22,0.22)",
  },
  chipBtnText: { color: "#FDBA74", fontSize: 11, fontWeight: "800" },
  detailDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.08)" },
  requestBtn: {
    marginTop: 4,
    borderRadius: 16,
    backgroundColor: "#F97316",
    minHeight: 64,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    ...Platform.select({
      ios: {
        shadowColor: "#F97316",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.28,
        shadowRadius: 14,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  requestBtnStatus: { backgroundColor: "#C2410C" },
  requestCopy: { flex: 1, gap: 2 },
  requestText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  requestSub: { color: "rgba(255,255,255,0.82)", fontSize: 12, lineHeight: 16 },
  symptomCheckerWrap: {},
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  sectionTitle: { color: "#F8FAFC", fontSize: 18, fontWeight: "800" },
  sectionLink: { flexDirection: "row", alignItems: "center", gap: 4 },
  sectionLinkText: { color: "#F97316", fontSize: 13, fontWeight: "700" },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12 },
  card: {
    width: "48.5%",
    minHeight: 156,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "#111827",
    padding: 14,
    justifyContent: "space-between",
    ...cardShadow,
  },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  iconBubble: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(249,115,22,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { color: "#F8FAFC", fontSize: 15, fontWeight: "800", marginTop: 10 },
  cardMeta: { color: "#94A3B8", fontSize: 12, marginTop: 4 },
  cardPrice: { color: "#FDBA74", fontSize: 15, fontWeight: "800", marginTop: 6 },
});
