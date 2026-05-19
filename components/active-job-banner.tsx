import { Pressable, Text, View, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useActiveJob } from "@/lib/store";
import { getMechanic, getServiceType } from "@/lib/seed";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { haptic } from "@/lib/haptics";

export function ActiveJobBanner() {
  const job = useActiveJob();
  const router = useRouter();

  if (!job) return null;
  const mechanic = getMechanic(job.mechanicId);
  const service = getServiceType(job.service);
  if (!mechanic || !service) return null;

  return (
    <Pressable
      onPress={() => {
        haptic.light();
        router.push("/tracking" as any);
      }}
      style={({ pressed }) => [styles.container, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.iconWrap}>
        <IconSymbol name="wrench.fill" size={20} color="#FFFFFF" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>Active service • {service.name}</Text>
        <Text style={styles.subtitle}>
          {mechanic.name} • {statusLabel(job.status)}
        </Text>
      </View>
      <IconSymbol name="chevron.right" size={20} color="#FFFFFF" />
    </Pressable>
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case "searching": return "Finding mechanic";
    case "accepted": return "Mechanic accepted";
    case "enroute": return "On the way";
    case "arrived": return "At your location";
    case "in_progress": return "Service in progress";
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
    color: "#FFEDD5",
    fontSize: 12,
    marginTop: 2,
  },
});
