import { useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter, useSegments } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAppDrawer } from "@/lib/app-drawer-context";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/hooks/use-locale";
import { haptic } from "@/lib/haptics";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const DRAWER_WIDTH = Math.min(SCREEN_WIDTH * 0.82, 320);

type NavItem = {
  segment: string;
  href: "/(tabs)" | "/(tabs)/activity" | "/(tabs)/vehicles" | "/(tabs)/profile";
  icon: string;
  labelKey: "tabs.home" | "tabs.activity" | "tabs.vehicles" | "tabs.profile";
};

const NAV_ITEMS: NavItem[] = [
  { segment: "index", href: "/(tabs)", icon: "house.fill", labelKey: "tabs.home" },
  { segment: "activity", href: "/(tabs)/activity", icon: "list.bullet", labelKey: "tabs.activity" },
  { segment: "vehicles", href: "/(tabs)/vehicles", icon: "car.fill", labelKey: "tabs.vehicles" },
  { segment: "profile", href: "/(tabs)/profile", icon: "person.fill", labelKey: "tabs.profile" },
];

export function AppDrawer() {
  const { isOpen, closeDrawer } = useAppDrawer();
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { user } = useAuth();

  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: isOpen ? 0 : -DRAWER_WIDTH,
        useNativeDriver: true,
        friction: 9,
        tension: 72,
      }),
      Animated.timing(overlayAnim, {
        toValue: isOpen ? 1 : 0,
        duration: isOpen ? 220 : 180,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isOpen, slideAnim, overlayAnim]);

  const activeSegment = segments[segments.length - 1] ?? "index";

  const navigate = (item: NavItem) => {
    haptic.light();
    closeDrawer();
    const isActive =
      item.segment === activeSegment ||
      (item.segment === "index" && (activeSegment === "index" || activeSegment === "(tabs)"));
    if (!isActive) {
      router.push(item.href as never);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <View style={[StyleSheet.absoluteFill, styles.portal]} pointerEvents="box-none">
      <Animated.View
        style={[
          styles.overlay,
          {
            opacity: overlayAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 0.55],
            }),
          },
        ]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={closeDrawer} accessibilityLabel="Close menu" />
      </Animated.View>

      <Animated.View
        style={[
          styles.drawer,
          {
            width: DRAWER_WIDTH,
            paddingTop: insets.top + 12,
            paddingBottom: Math.max(insets.bottom, 16),
            transform: [{ translateX: slideAnim }],
          },
        ]}
      >
        <View style={styles.drawerHeader}>
          <View style={styles.logoMark}>
            <IconSymbol name="wrench.fill" size={22} color="#FFFFFF" />
          </View>
          <View style={styles.drawerHeaderText}>
            <Text style={styles.brand}>WrenchUp</Text>
            {user?.email ? (
              <Text style={styles.email} numberOfLines={1}>
                {user.email}
              </Text>
            ) : null}
          </View>
          <Pressable onPress={closeDrawer} hitSlop={12} style={styles.closeBtn}>
            <IconSymbol name="xmark" size={20} color="#94A3B8" />
          </Pressable>
        </View>

        <View style={styles.navList}>
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.segment === activeSegment ||
              (item.segment === "index" &&
                (!activeSegment || activeSegment === "index" || activeSegment === "(tabs)"));
            return (
              <Pressable
                key={item.href}
                onPress={() => navigate(item)}
                style={({ pressed }) => [
                  styles.navItem,
                  isActive && styles.navItemActive,
                  pressed && styles.navItemPressed,
                ]}
              >
                <View style={[styles.navIconWrap, isActive && styles.navIconWrapActive]}>
                  <IconSymbol
                    name={item.icon}
                    size={22}
                    color={isActive ? "#F97316" : "#CBD5E1"}
                  />
                </View>
                <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>
                  {t(item.labelKey)}
                </Text>
                {isActive ? (
                  <View style={styles.activeBar} />
                ) : (
                  <IconSymbol name="chevron.right" size={16} color="#475569" />
                )}
              </Pressable>
            );
          })}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  portal: {
    zIndex: 200,
    elevation: 200,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000000",
  },
  drawer: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    backgroundColor: "#0F172A",
    shadowColor: "#000",
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 24,
  },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#334155",
    gap: 12,
  },
  logoMark: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
  },
  drawerHeaderText: {
    flex: 1,
    gap: 2,
  },
  brand: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "800",
  },
  email: {
    color: "#94A3B8",
    fontSize: 13,
  },
  closeBtn: {
    padding: 4,
  },
  navList: {
    paddingTop: 12,
    paddingHorizontal: 12,
    gap: 4,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    gap: 14,
  },
  navItemActive: {
    backgroundColor: "rgba(249, 115, 22, 0.12)",
  },
  navItemPressed: {
    opacity: 0.85,
  },
  navIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#1E293B",
    alignItems: "center",
    justifyContent: "center",
  },
  navIconWrapActive: {
    backgroundColor: "rgba(249, 115, 22, 0.2)",
  },
  navLabel: {
    flex: 1,
    color: "#E2E8F0",
    fontSize: 17,
    fontWeight: "600",
  },
  navLabelActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  activeBar: {
    width: 4,
    height: 24,
    borderRadius: 2,
    backgroundColor: "#F97316",
  },
});
