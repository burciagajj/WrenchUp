import { Pressable, Text, View, StyleSheet, Animated, Easing } from "react-native";
import { useRouter } from "expo-router";
import { useActiveJob } from "@/lib/store";
import { getMechanic, getServiceType } from "@/lib/seed";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { haptic } from "@/lib/haptics";
import { useEffect, useRef } from "react";
import { useL } from "@/hooks/use-locale";

export function ActiveJobBanner() {
  const job = useActiveJob();
  const router = useRouter();
  const spin = useRef(new Animated.Value(0)).current;
  const L = useL();

  useEffect(() => {
    if (!job || job.status !== "in_progress") {
      spin.stopAnimation();
      spin.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [job, spin]);

  if (!job) return null;
  const mechanic = getMechanic(job.mechanicId);
  const service = getServiceType(job.service);
  if (!mechanic || !service) return null;

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <Pressable
      onPress={() => {
        haptic.light();
        router.push("/tracking" as any);
      }}
      style={({ pressed }) => [styles.container, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.iconWrap}>
        {job.status === "in_progress" ? (
          <Animated.View style={{ transform: [{ rotate }] }}>
            <IconSymbol name="gearshape.fill" size={20} color="#FFFFFF" />
          </Animated.View>
        ) : (
          <IconSymbol name="wrench.fill" size={20} color="#FFFFFF" />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{L("Active service", "Servicio activo")} • {service.name}</Text>
        <Text style={styles.subtitle}>
          {mechanic.name} • {statusLabel(job.status, L)}
        </Text>
      </View>
      <IconSymbol name="chevron.right" size={20} color="#FFFFFF" />
    </Pressable>
  );
}

function statusLabel(status: string, L: (en: string, es: string) => string): string {
  switch (status) {
    case "searching": return L("Finding mechanic", "Buscando mecánico");
    case "accepted": return L("Mechanic accepted", "Mecánico aceptado");
    case "enroute": return L("On the way", "En camino");
    case "arrived": return L("At your location", "En tu ubicación");
    case "in_progress": return L("Service in progress", "Servicio en curso");
    default: return status;
  }
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#F97316",
    borderRadius: 16,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },
  subtitle: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
});
