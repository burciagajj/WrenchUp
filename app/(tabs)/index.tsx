import { ScrollView, Text, View, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useStore, useSelectedVehicle } from "@/lib/store";
import { MECHANICS, SERVICE_TYPES } from "@/lib/seed";
import { Avatar } from "@/components/avatar";
import { RatingStars } from "@/components/rating-stars";
import { PrimaryButton } from "@/components/primary-button";
import { ActiveJobBanner } from "@/components/active-job-banner";
import { haptic } from "@/lib/haptics";
import { MechanicHome } from "@/components/mechanic-home";
import { useLocationBootstrap } from "@/hooks/use-location-bootstrap";
import { fetchLocationAndAddress } from "@/lib/location";
import { useLocaleContext } from "@/hooks/use-locale";
import { localizedServiceName } from "@/lib/service-i18n";

const QUICK_SERVICES = ["battery_jump", "flat_tire", "oil_change", "diagnostic"];

export default function HomeScreen() {
  const router = useRouter();
  const { state, dispatch } = useStore();
  const vehicle = useSelectedVehicle();
  const { t, locale, formatPrice, isMexico } = useLocaleContext();
  useLocationBootstrap();

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

  const handleRequest = (serviceCode?: string) => {
    haptic.medium();
    router.push({
      pathname: "/service-select" as any,
      params: serviceCode ? { preselect: serviceCode } : undefined,
    } as any);
  };

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
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

        {/* Promo card */}
        <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
          <View style={styles.promo}>
            <View style={{ flex: 1 }}>
              <Text style={styles.promoTag}>{t("home.promo_tag")}</Text>
              <Text style={styles.promoTitle}>{t("home.promo_title")}</Text>
              <Text style={styles.promoSubtitle}>{t("home.promo_subtitle")}</Text>
            </View>
            <View style={styles.promoIcon}>
              <IconSymbol name="tag.fill" size={28} color="#FFFFFF" />
            </View>
          </View>
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
      </ScrollView>
    </ScreenContainer>
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
  headerPad: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  greeting: {
    color: "#64748B",
    fontSize: 14,
    fontWeight: "500",
  },
  userName: {
    color: "#0F172A",
    fontSize: 28,
    fontWeight: "800",
    marginTop: 2,
  },
  locationCard: {
    backgroundColor: "#F5F7FA",
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
    color: "#0F172A",
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
    color: "#0F172A",
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
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 6,
  },
  quickTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
    marginTop: 6,
  },
  quickPrice: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "500",
  },
  promo: {
    backgroundColor: "#0F172A",
    borderRadius: 18,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  promoTag: {
    color: "#FB923C",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
  },
  promoTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
    marginTop: 4,
  },
  promoSubtitle: {
    color: "#94A3B8",
    fontSize: 12,
    marginTop: 4,
  },
  promoIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
  },
  mechanicCard: {
    width: 130,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    padding: 12,
    alignItems: "center",
    gap: 6,
  },
  mechanicName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
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
