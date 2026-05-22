import { Pressable, View, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAppDrawer } from "@/lib/app-drawer-context";
import { haptic } from "@/lib/haptics";

type ScreenMenuHeaderProps = {
  title: string;
};

/** Top bar with hamburger + title for stack screens (activity, vehicles, profile) */
export function ScreenMenuHeader({ title }: ScreenMenuHeaderProps) {
  const insets = useSafeAreaInsets();
  const { openDrawer } = useAppDrawer();

  return (
    <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
      <Pressable
        onPress={() => {
          haptic.light();
          openDrawer();
        }}
        style={({ pressed }) => [styles.menuBtn, pressed && styles.menuBtnPressed]}
        accessibilityRole="button"
        accessibilityLabel="Open menu"
      >
        <IconSymbol name="line.3.horizontal" size={22} color="#0F172A" />
      </Pressable>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
  },
  menuBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  menuBtnPressed: {
    opacity: 0.85,
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: "800",
    color: "#0F172A",
  },
});
