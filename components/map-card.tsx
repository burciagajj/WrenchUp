import { View, Text, StyleSheet } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from "react-native-reanimated";
import { useEffect } from "react";
import Svg, { Path, Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import { IconSymbol } from "@/components/ui/icon-symbol";

interface MapCardProps {
  etaMinutes?: number;
  status: "idle" | "searching" | "enroute" | "arrived" | "in_progress" | "completed";
  height?: number;
}

/**
 * A stylized "map" header for the tracking and home screens. Animates a wrench truck along a route.
 * Does NOT use real maps — purely SVG art so it works offline and without API keys.
 */
export function MapCard({ etaMinutes, status, height = 220 }: MapCardProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    if (status === "enroute") {
      progress.value = withRepeat(
        withTiming(1, { duration: 4000, easing: Easing.inOut(Easing.ease) }),
        -1,
        false,
      );
    } else if (status === "in_progress" || status === "arrived") {
      progress.value = withTiming(1, { duration: 600 });
    } else if (status === "searching") {
      progress.value = withRepeat(
        withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
    } else {
      progress.value = withTiming(0, { duration: 400 });
    }
  }, [status, progress]);

  // Truck moves along a horizontal-ish curve
  const truckStyle = useAnimatedStyle(() => {
    const startX = 30;
    const endX = 250;
    const x = startX + (endX - startX) * progress.value;
    const y = 130 - Math.sin(progress.value * Math.PI) * 40;
    return {
      transform: [{ translateX: x }, { translateY: y }],
    };
  });

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: 0.2 + (1 - progress.value) * 0.5,
    transform: [{ scale: 0.8 + progress.value * 0.6 }],
  }));

  return (
    <View style={[styles.container, { height }]}>
      <Svg width="100%" height="100%" viewBox="0 0 320 220" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#0F172A" />
            <Stop offset="1" stopColor="#1E293B" />
          </LinearGradient>
          <LinearGradient id="route" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#F97316" stopOpacity="0.2" />
            <Stop offset="1" stopColor="#F97316" stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Path d="M0 0 L320 0 L320 220 L0 220 Z" fill="url(#bg)" />
        {/* Grid lines (street feel) */}
        <Path d="M0 60 L320 60" stroke="#1E293B" strokeWidth="1" />
        <Path d="M0 100 L320 100" stroke="#1E293B" strokeWidth="1" />
        <Path d="M0 160 L320 160" stroke="#1E293B" strokeWidth="1" />
        <Path d="M80 0 L80 220" stroke="#1E293B" strokeWidth="1" />
        <Path d="M180 0 L180 220" stroke="#1E293B" strokeWidth="1" />
        <Path d="M260 0 L260 220" stroke="#1E293B" strokeWidth="1" />
        {/* Route */}
        <Path
          d="M40 150 C 100 50, 200 50, 280 130"
          stroke="url(#route)"
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
          strokeDasharray="6 8"
        />
        {/* Destination pin */}
        <Circle cx="280" cy="130" r="10" fill="#F97316" />
        <Circle cx="280" cy="130" r="4" fill="#FFFFFF" />
      </Svg>

      {/* Animated truck puck */}
      <Animated.View style={[styles.truckPuck, truckStyle]}>
        <View style={styles.truckRing}>
          <IconSymbol name="wrench.fill" size={18} color="#FFFFFF" />
        </View>
      </Animated.View>

      {/* Destination pulse */}
      <Animated.View pointerEvents="none" style={[styles.pulse, pulseStyle]} />

      {/* Status chip */}
      <View style={styles.statusChipWrap} pointerEvents="none">
        <View style={styles.statusChip}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>{statusLabel(status, etaMinutes)}</Text>
        </View>
      </View>
    </View>
  );
}

function statusLabel(status: MapCardProps["status"], eta?: number): string {
  switch (status) {
    case "searching":
      return "Finding nearby mechanic…";
    case "enroute":
      return `Mechanic ${typeof eta === "number" ? `${eta} min away` : "en route"}`;
    case "arrived":
      return "Mechanic has arrived";
    case "in_progress":
      return "Service in progress";
    case "completed":
      return "Service complete";
    default:
      return "Ready when you are";
  }
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    width: "100%",
    overflow: "hidden",
    borderRadius: 20,
    backgroundColor: "#0F172A",
  },
  truckPuck: {
    position: "absolute",
    left: 0,
    top: 0,
  },
  truckRing: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  pulse: {
    position: "absolute",
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F97316",
    right: 26,
    top: 110,
  },
  statusChipWrap: {
    position: "absolute",
    top: 12,
    left: 12,
  },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.85)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#10B981",
  },
  statusText: {
    color: "#F1F5F9",
    fontSize: 12,
    fontWeight: "600",
  },
});
