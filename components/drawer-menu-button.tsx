import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAppDrawer } from "@/lib/app-drawer-context";
import { haptic } from "@/lib/haptics";

type DrawerMenuButtonProps = {
  /** Light icon on map; dark icon on light screens */
  variant?: "map" | "light";
};

export function DrawerMenuButton({ variant = "map" }: DrawerMenuButtonProps) {
  const insets = useSafeAreaInsets();
  const { openDrawer } = useAppDrawer();

  const isMap = variant === "map";
  const iconColor = isMap ? "#FFFFFF" : "#0F172A";

  return (
    <View
      style={[styles.wrap, { top: insets.top + 8 }]}
      pointerEvents="box-none"
    >
      <Pressable
        onPress={() => {
          haptic.light();
          openDrawer();
        }}
        style={({ pressed }) => [
          styles.button,
          isMap ? styles.buttonMap : styles.buttonLight,
          pressed && styles.buttonPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Open menu"
      >
        <IconSymbol name="line.3.horizontal" size={22} color={iconColor} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 16,
    zIndex: 25,
  },
  button: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonMap: {
    backgroundColor: "rgba(15, 23, 42, 0.88)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  buttonLight: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  buttonPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.96 }],
  },
});
