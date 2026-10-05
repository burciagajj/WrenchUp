import { ComponentProps } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { haptic } from "@/lib/haptics";
import { safeReplace } from "@/lib/safe-router";

export type MainNavKey = "home" | "book" | "booked" | "activity" | "menu";

export type MainBottomNavLabels = Record<MainNavKey, string>;

type MainBottomNavProps = {
  activeKey: MainNavKey;
  labels: MainBottomNavLabels;
};

const NAV_ITEMS: {
  key: MainNavKey;
  icon: ComponentProps<typeof IconSymbol>["name"];
  href: Href;
}[] = [
  { key: "home", icon: "house.fill", href: "/" },
  { key: "book", icon: "plus.circle.fill", href: "/book-service" },
  { key: "booked", icon: "clock.fill", href: "/booked-requests" },
  { key: "activity", icon: "message.fill", href: "/activity" },
  { key: "menu", icon: "list.bullet", href: "/profile" },
];

export function MainBottomNav({ activeKey, labels }: MainBottomNavProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom + 10 }]}>
      {NAV_ITEMS.map((item) => {
        const active = item.key === activeKey;
        return (
          <Pressable
            key={item.key}
            onPress={() => {
              haptic.light();
              safeReplace(item.href);
            }}
            style={styles.item}
          >
            <IconSymbol name={item.icon} size={20} color={active ? "#FFFFFF" : "#94A3B8"} />
            <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
              {labels[item.key]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#121212",
    borderTopWidth: 1,
    borderTopColor: "#2A2A40",
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 10,
  },
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 4,
  },
  label: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "700",
  },
  labelActive: {
    color: "#FFFFFF",
  },
});
