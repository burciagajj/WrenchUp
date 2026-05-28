import { Pressable, View, Text, StyleSheet, Animated, Alert } from "react-native";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useStore } from "@/lib/store";
import { haptic } from "@/lib/haptics";
import { useRef, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { resolveAuthSession } from "@/lib/resolve-auth-session";
import { supabaseUserData } from "@/lib/_core/supabase-user-data";
import { setMechanicPresence } from "@/lib/live-dispatch";

/**
 * Sleek, unique online/offline toggle for mechanic dashboard
 * Features:
 * - Animated sliding toggle with smooth transitions
 * - Orange accent when online, gray when offline
 * - Glowing effect when online
 * - Pulsing indicator dot
 * - Smooth haptic feedback
 */
export function MechanicSleekToggle() {
  const { state, dispatch } = useStore();
  const { user } = useAuth();
  const isOnline = state.mechanicOnline;
  const slideAnim = useRef(new Animated.Value(isOnline ? 1 : 0)).current;

  // Animate the toggle slide
  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: isOnline ? 1 : 0,
      useNativeDriver: false,
      tension: 90,
      friction: 14,
    }).start();
  }, [isOnline, slideAnim]);

  const handleToggle = async () => {
    const nextOnline = !isOnline;
    if (!isOnline) {
      const rated = state.jobs.filter((j) => j.mechanicId === user?.id && typeof j.rating === "number");
      if (rated.length >= 5) {
        const avg = rated.reduce((sum, j) => sum + (j.rating ?? 0), 0) / rated.length;
        if (avg < 4.2) {
          haptic.warning();
          Alert.alert(
            "Account suspended",
            "Your average rating is below 4.2. Your mechanic account is temporarily suspended pending review."
          );
          dispatch({ type: "SET_MECHANIC_ONLINE", payload: false });
          return;
        }
      }

      const hasApprovedVehicle = state.vehicles.some((v) => v.approvalStatus === "approved");
      if (!hasApprovedVehicle) {
        haptic.warning();
        Alert.alert(
          "Vehicle approval required",
          "Upload insurance and registration sticker for a vehicle and wait for approval before going online."
        );
        dispatch({ type: "SET_MECHANIC_ONLINE", payload: false });
        return;
      }

      const resolved = await resolveAuthSession(user, (err) => {
        Alert.alert("Verification required", err.message);
      });
      if (!resolved || !user?.id) return;

      try {
        const profile = await supabaseUserData.getOrCreateProfile(
          user.id,
          "mechanic",
          resolved.sessionToken
        );
        if (profile.verification_status !== "approved") {
          haptic.warning();
          Alert.alert(
            "Verification pending",
            "Your account is pending manual review. Upload your documents and wait for approval before going online."
          );
          dispatch({ type: "SET_MECHANIC_ONLINE", payload: false });
          return;
        }
      } catch (error) {
        console.error("[MechanicToggle] Verification check failed:", error);
        Alert.alert("Could not verify account", "Please try again in a moment.");
        return;
      }
    }

    if (user?.id) {
      try {
        const resolved = await resolveAuthSession(user);
        if (resolved) {
          await setMechanicPresence(
            resolved.sessionToken,
            user.id,
            state.userName || "Mechanic",
            nextOnline,
          );
        }
      } catch (error) {
        console.error("[MechanicToggle] Presence update failed:", error);
      }
    }

    await haptic.medium();
    dispatch({ type: "SET_MECHANIC_ONLINE", payload: nextOnline });
  };

  const slideInterpolation = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [2, 28],
  });

  return (
    <Pressable
      onPress={handleToggle}
      style={({ pressed }) => [
        styles.container,
        isOnline ? styles.containerOnline : styles.containerOffline,
        pressed && { opacity: 0.9 },
      ]}
    >
      <View style={styles.content}>
        <View style={styles.leftSection}>
          <View
            style={[
              styles.statusDot,
              isOnline ? styles.statusDotOnline : styles.statusDotOffline,
            ]}
          >
            <IconSymbol
              name={isOnline ? "bolt.fill" : "pause.fill"}
              size={11}
              color={isOnline ? "#FFFFFF" : "#94A3B8"}
            />
          </View>
          <View>
            <Text style={[styles.label, isOnline ? styles.labelOnline : styles.labelOffline]}>
              {isOnline ? "Online" : "Offline"}
            </Text>
            <Text style={[styles.sublabel, isOnline ? styles.sublabelOnline : styles.sublabelOffline]}>
              {isOnline ? "Receiving requests" : "Paused"}
            </Text>
          </View>
        </View>

        <View style={[styles.toggleSwitch, isOnline ? styles.toggleSwitchOnline : styles.toggleSwitchOffline]}>
          <Animated.View
            style={[
              styles.toggleThumb,
              isOnline ? styles.toggleThumbOnline : styles.toggleThumbOffline,
              {
                transform: [{ translateX: slideInterpolation }],
              },
            ]}
          />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  containerOnline: {
    backgroundColor: "#171E2C",
    borderColor: "#253149",
  },
  containerOffline: {
    backgroundColor: "#141A24",
    borderColor: "#273246",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  leftSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  statusDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  statusDotOnline: {
    backgroundColor: "#F97316",
  },
  statusDotOffline: {
    backgroundColor: "#1F2937",
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
  },
  labelOnline: {
    color: "#F8FAFC",
  },
  labelOffline: {
    color: "#D1D5DB",
  },
  sublabel: {
    fontSize: 11,
    fontWeight: "500",
    marginTop: 1,
  },
  sublabelOnline: {
    color: "#94A3B8",
  },
  sublabelOffline: {
    color: "#6B7280",
  },
  toggleSwitch: {
    width: 56,
    height: 28,
    borderRadius: 14,
    padding: 2,
    justifyContent: "center",
    borderWidth: 1,
  },
  toggleSwitchOnline: {
    backgroundColor: "rgba(249, 115, 22, 0.18)",
    borderColor: "rgba(249, 115, 22, 0.35)",
  },
  toggleSwitchOffline: {
    backgroundColor: "#1F2937",
    borderColor: "#374151",
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  toggleThumbOnline: {
    backgroundColor: "#FB923C",
  },
  toggleThumbOffline: {
    backgroundColor: "#9CA3AF",
  },
});
