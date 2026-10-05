import { useEffect } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming } from "react-native-reanimated";
import { IconSymbol } from "@/components/ui/icon-symbol";

/**
 * A small in-app warning toast that slides in from the top, instead of
 * reaching for the native Alert.alert() box for lightweight "you can't do
 * that yet" messages (e.g. missing profile photo). Auto-dismisses, and can
 * also be dismissed with a tap. Render it once near the top of a screen's
 * JSX (absolutely positioned, so it overlays whatever's already there) and
 * drive it from local `useState` — see app/index.tsx for the pattern.
 */
export function InlineToast({
  visible,
  title,
  message,
  onDismiss,
  durationMs = 4000,
}: {
  visible: boolean;
  title: string;
  message: string;
  onDismiss: () => void;
  durationMs?: number;
}) {
  const insets = useSafeAreaInsets();
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!visible) return;
    progress.value = withSpring(1, { damping: 16, stiffness: 220 });
    const timer = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * -16 }],
  }));

  if (!visible) return null;

  return (
    <Animated.View
      style={[styles.container, { top: Math.max(insets.top, 12) + 8 }, animatedStyle]}
      pointerEvents="box-none"
    >
      <Pressable
        onPress={() => {
          progress.value = withTiming(0, { duration: 150 });
          onDismiss();
        }}
        style={styles.card}
      >
        <View style={styles.iconWrap}>
          <IconSymbol name="exclamationmark.triangle.fill" size={17} color="#F97316" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 999,
    elevation: 999,
  },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#171B26",
    borderWidth: 1,
    borderColor: "#F97316",
    borderRadius: 14,
    padding: 14,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.35,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
      },
      android: { elevation: 8 },
    }),
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(249, 115, 22, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  title: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 2,
  },
  message: {
    color: "#94A3B8",
    fontSize: 13,
    lineHeight: 18,
  },
});
