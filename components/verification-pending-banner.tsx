import { Pressable, Text, View, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { haptic } from "@/lib/haptics";
import { useL } from "@/hooks/use-locale";

type VerificationPendingBannerProps = {
  rejected: boolean;
};

/** Persistent top strip reminding an unapproved user to finish verification, without blocking the dashboard. */
export function VerificationPendingBanner({ rejected }: VerificationPendingBannerProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const L = useL();

  return (
    <Pressable
      onPress={() => {
        haptic.light();
        router.push("/approval-pending" as any);
      }}
      style={({ pressed }) => [styles.bar, { paddingTop: insets.top + 8 }, pressed && { opacity: 0.9 }]}
    >
      <IconSymbol name="shield.fill" size={16} color="#FFFFFF" />
      <Text style={styles.text} numberOfLines={1}>
        {rejected
          ? L("Verification needs attention — tap to fix", "La verificación requiere atención — toca para corregir")
          : L("Verification pending — tap to check status", "Verificación pendiente — toca para ver el estado")}
      </Text>
      <IconSymbol name="chevron.right" size={16} color="#FFFFFF" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: "#F97316",
  },
  text: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
});
