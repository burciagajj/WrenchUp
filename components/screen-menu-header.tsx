import { Pressable, View, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { haptic } from "@/lib/haptics";

type ScreenMenuHeaderProps = {
  title: string;
};

/** Top bar with back button + title for stack screens (activity, vehicles, profile) */
export function ScreenMenuHeader({ title }: ScreenMenuHeaderProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
      <Pressable
        onPress={() => {
          haptic.light();
          router.back();
        }}
        style={({ pressed }) => [styles.menuBtn, pressed && styles.menuBtnPressed]}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <IconSymbol name="chevron.left" size={22} color="#FFFFFF" />
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
    backgroundColor: "#F97316", // Orange to match unified headers
  },
  menuBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  menuBtnPressed: {
    opacity: 0.85,
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});
