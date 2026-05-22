import React, { useState, useRef, useCallback } from "react";
import {
  ScrollView,
  Text,
  View,
  Pressable,
  StyleSheet,
  Dimensions,
  PanResponder,
  Animated,
} from "react-native";
import { useRouter } from "expo-router";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useStore, useSelectedVehicle } from "@/lib/store";
import { MECHANICS, SERVICE_TYPES } from "@/lib/seed";
import { Avatar } from "@/components/avatar";
import { RatingStars } from "@/components/rating-stars";
import { PrimaryButton } from "@/components/primary-button";
import { ActiveJobBanner } from "@/components/active-job-banner";
import { haptic } from "@/lib/haptics";
import { MechanicHome } from "@/components/mechanic-home";
import { HomeMap } from "@/components/home-map";
import { useLocationBootstrap } from "@/hooks/use-location-bootstrap";
import { fetchLocationAndAddress } from "@/lib/location";
import { useLocaleContext } from "@/hooks/use-locale";
import { localizedServiceName } from "@/lib/service-i18n";
import { SymptomChecker } from "@/components/symptom-checker";
import { DrawerMenuButton } from "@/components/drawer-menu-button";

const QUICK_SERVICES = ["battery_jump", "flat_tire", "oil_change", "diagnostic"];
const { height: screenHeight } = Dimensions.get("window");
const MIN_SHEET_HEIGHT = 80;
const MAX_SHEET_HEIGHT = screenHeight * 0.75;
const INITIAL_SHEET_HEIGHT = screenHeight * 0.4;

function clampSheetHeight(h: number) {
  return Math.max(MIN_SHEET_HEIGHT, Math.min(MAX_SHEET_HEIGHT, h));
}

export default function HomeScreen() {
  const router = useRouter();
  const { state, dispatch } = useStore();
  const vehicle = useSelectedVehicle();
  const { t, locale, formatPrice, isMexico } = useLocaleContext();
  useLocationBootstrap();

  const sheetHeightRef = useRef(INITIAL_SHEET_HEIGHT);
  const sheetAnim = useRef(new Animated.Value(INITIAL_SHEET_HEIGHT)).current;
  const [sheetHeight, setSheetHeight] = useState(INITIAL_SHEET_HEIGHT);
  const scrollRef = useRef<ScrollView>(null);
  const symptomSectionY = useRef(0);

  const applySheetHeight = useCallback(
    (height: number, animate = true) => {
      const clamped = clampSheetHeight(height);
      sheetHeightRef.current = clamped;
      setSheetHeight(clamped);
      if (animate) {
        Animated.spring(sheetAnim, {
          toValue: clamped,
          useNativeDriver: false,
          friction: 9,
          tension: 68,
        }).start();
      } else {
        sheetAnim.setValue(clamped);
      }
    },
    [sheetAnim]
  );

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 4,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        sheetAnim.stopAnimation((value) => {
          sheetHeightRef.current = value;
        });
      },
      onPanResponderMove: (_, gestureState) => {
        const next = clampSheetHeight(sheetHeightRef.current - gestureState.dy);
        sheetAnim.setValue(next);
      },
      onPanResponderRelease: (_, gestureState) => {
        const releaseHeight = clampSheetHeight(sheetHeightRef.current - gestureState.dy);
        const velocity = gestureState.vy;
        const threshold = screenHeight * 0.2;
        let snap = releaseHeight;
        if (velocity > 0.5) {
          snap = MIN_SHEET_HEIGHT;
        } else if (velocity < -0.5) {
          snap = MAX_SHEET_HEIGHT;
        } else {
          snap = releaseHeight < threshold ? MIN_SHEET_HEIGHT : MAX_SHEET_HEIGHT;
        }
        applySheetHeight(snap);
      },
    })
  ).current;

  const handleSymptomExpand = useCallback(() => {
    applySheetHeight(MAX_SHEET_HEIGHT);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        y: Math.max(0, symptomSectionY.current - 12),
        animated: true,
      });
    });
  }, [applySheetHeight]);

  if (state.role === "mechanic") {
    return <MechanicHome />;
  }

  const refreshLocation = async () => {
    haptic.light();
    dispatch({
      type: "SET_USER_COORDS",
      payload: { coords: state.userCoords, status: "requesting" },
    });
    const res = await fetchLocationAndAddress();
    if (res.status === "granted" && res.coords) {
      dispatch({
        type: "SET_USER_COORDS",
        payload: { coords: res.coords, status: "granted", address: res.address },
      });
      if (res.countryCode === "MX" || res.countryCode === "US") {
        dispatch({ type: "SET_DETECTED_COUNTRY", payload: res.countryCode });
      }
      haptic.success();
    } else {
      dispatch({
        type: "SET_USER_COORDS",
        payload: { coords: state.userCoords, status: "denied" },
      });
      haptic.warning();
    }
  };

  const greeting = t(getGreetingKey());
  const topMechanics = [...MECHANICS].sort((a, b) => a.etaMinutes - b.etaMinutes).slice(0, 6);
  const vehicleLabel = vehicle
    ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`
    : t("home.no_vehicle");

  const handleRequest = (serviceCode?: string) => {
    haptic.medium();
    router.push({
      pathname: "/service-select" as any,
      params: serviceCode ? { preselect: serviceCode } : undefined,
    } as any);
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <HomeMap />
        <DrawerMenuButton variant="map" />
      </View>
      
      {/* Collapsible Bottom Sheet — drag only on handle, not whole sheet */}
      <Animated.View
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: sheetAnim,
          backgroundColor: "#1E293B",
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.1,
          shadowRadius: 8,
          elevation: 5,
          overflow: "hidden",
        }}
      >
        <View
          style={styles.sheetHandleZone}
          {...panResponder.panHandlers}
          collapsable={false}
        >
          <View style={styles.sheetHandle} />
        </View>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
          scrollEnabled={sheetHeight >= MAX_SHEET_HEIGHT * 0.9}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
        >
          
          {sheetHeight > MIN_SHEET_HEIGHT + 20 && (
            <>
        {/* Header */}
        <View style={styles.headerPad}>
          <Text style={styles.greeting}>{greeting},</Text>
          <Text style={styles.userName}>{state.userName} 👋</Text>
        </View>
        


        {isMexico ? (
          <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
            <View style={styles.discountBanner}>
              <Text style={styles.discountBannerText}>{t("home.discount_banner")}</Text>
            </View>
          </View>
        ) : null}

        {/* Active job banner */}
        {state.activeJobId ? (
          <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
            <ActiveJobBanner />
          </View>
        ) : null}

        {/* Location & vehicle pill row */}
        <View style={{ paddingHorizontal: 20 }}>
          <View style={styles.locationCard}>
            <View style={styles.locationRow}>
              <View style={[styles.iconBubble, { backgroundColor: "#FEE2E2" }]}>
                <IconSymbol name="location.fill" size={16} color="#EF4444" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.locationLabel}>{t("home.service_location")}</Text>
                <Text style={styles.locationValue} numberOfLines={1}>
                  {state.defaultLocation}
                </Text>
              </View>
              <Pressable
                onPress={refreshLocation}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                hitSlop={8}
              >
                <Text style={styles.changeText}>
                  {state.locationStatus === "requesting" ? "…" : t("common.refresh")}
                </Text>
              </Pressable>
            </View>
            <View style={styles.divider} />
            <View style={styles.locationRow}>
              <View style={[styles.iconBubble, { backgroundColor: "#FFEDD5" }]}>
                <IconSymbol name="car.fill" size={16} color="#F97316" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.locationLabel}>{t("home.vehicle")}</Text>
                <Text style={styles.locationValue} numberOfLines={1}>
                  {vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : t("home.no_vehicle")}
                </Text>
              </View>
              <Pressable
                onPress={() => router.push("/(tabs)/vehicles" as any)}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                hitSlop={8}
              >
                <Text style={styles.changeText}>{t("home.change")}</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Big CTA */}
        <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
          <PrimaryButton
            title={t("home.request_mechanic")}
            size="lg"
            hapticType="medium"
            onPress={() => handleRequest()}
            iconRight={<IconSymbol name="arrow.right" size={18} color="#FFFFFF" />}
          />
        </View>

        {/* Quick services */}
        <View style={{ paddingHorizontal: 20, marginTop: 28 }}>
          <Text style={styles.sectionTitle}>{t("home.quick_services")}</Text>
          <View style={styles.quickGrid}>
            {QUICK_SERVICES.map((code) => {
              const s = SERVICE_TYPES.find((x) => x.code === code)!;
              return (
                <Pressable
                  key={code}
                  onPress={() => handleRequest(code)}
                  style={({ pressed }) => [
                    styles.quickCard,
                    pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
                  ]}
                >
                  <View style={[styles.iconBubble, { backgroundColor: "#FFEDD5", width: 40, height: 40 }]}>
                    <IconSymbol name={s.icon} size={20} color="#F97316" />
                  </View>
                  <Text style={styles.quickTitle}>{localizedServiceName(s.code, locale)}</Text>
                  <Text style={styles.quickPrice}>{t("common.from")} {formatPrice(s.basePrice)}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* AI Symptom Checker */}
        <View
          style={{ paddingHorizontal: 20, marginTop: 24 }}
          onLayout={(e) => {
            symptomSectionY.current = e.nativeEvent.layout.y;
          }}
        >
          <SymptomChecker
            vehicleLabel={vehicleLabel}
            formatPrice={formatPrice}
            onBookService={(code) => handleRequest(code)}
            onExpand={handleSymptomExpand}
          />
        </View>

        {/* Top mechanics */}
        <View style={{ marginTop: 28 }}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>{t("home.top_mechanics")}</Text>
            <Pressable onPress={() => handleRequest()} hitSlop={8}>
              <Text style={styles.linkText}>{t("home.see_all")}</Text>
            </Pressable>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
          >
            {topMechanics.map((m) => (
              <Pressable
                key={m.id}
                onPress={() => {
                  haptic.light();
                  router.push({ pathname: "/mechanic/[id]" as any, params: { id: m.id } } as any);
                }}
                style={({ pressed }) => [
                  styles.mechanicCard,
                  pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
                ]}
              >
                <Avatar name={m.name} url={m.photoUrl} size={56} />
                <Text style={styles.mechanicName} numberOfLines={1}>{m.name}</Text>
                <RatingStars rating={m.rating} size={12} />
                <View style={styles.mechanicMeta}>
                  <IconSymbol name="clock" size={12} color="#64748B" />
                  <Text style={styles.mechanicEta}>{m.etaMinutes} {t("common.minutes_short")}</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <View style={{ height: 24 }} />
            </>
          )}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

function getGreetingKey() {
  const h = new Date().getHours();
  if (h < 5) return "home.greeting_night" as const;
  if (h < 12) return "home.greeting_morning" as const;
  if (h < 18) return "home.greeting_afternoon" as const;
  return "home.greeting_evening" as const;
}

const styles = StyleSheet.create({
  sheetHandleZone: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 10,
    zIndex: 2,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#475569",
  },
  headerPad: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  greeting: {
    color: "#94A3B8",
    fontSize: 14,
    fontWeight: "500",
  },
  userName: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "800",
    marginTop: 2,
  },
  locationCard: {
    backgroundColor: "#0F172A",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  locationLabel: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  locationValue: {
    color: "#F1F5F9",
    fontSize: 15,
    fontWeight: "600",
    marginTop: 1,
  },
  changeText: {
    color: "#F97316",
    fontSize: 13,
    fontWeight: "700",
  },
  divider: {
    height: 1,
    backgroundColor: "#E2E8F0",
    marginVertical: 4,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 12,
  },
  sectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  linkText: {
    color: "#F97316",
    fontWeight: "700",
    fontSize: 13,
  },
  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  quickCard: {
    width: "48%",
    backgroundColor: "#0F172A",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#334155",
    gap: 6,
  },
  quickTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#F1F5F9",
    marginTop: 6,
  },
  quickPrice: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "500",
  },
  mechanicCard: {
    width: 130,
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 14,
    padding: 12,
    alignItems: "center",
    gap: 6,
  },
  mechanicName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#F1F5F9",
    marginTop: 4,
    width: "100%",
    textAlign: "center",
  },
  mechanicMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  mechanicEta: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "500",
  },
  discountBanner: {
    backgroundColor: "#10B981",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  discountBannerText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 12,
    textAlign: "center",
  },
});