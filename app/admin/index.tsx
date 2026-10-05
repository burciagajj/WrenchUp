import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAuth } from "@/lib/auth-context";

type AdminTool = {
  key: string;
  href: string;
  icon: string;
  title: string;
  description: string;
};

const TOOLS: AdminTool[] = [
  {
    key: "photo-review",
    href: "/admin/photo-review",
    icon: "checkmark.circle.fill",
    title: "Photo Review",
    description: "Approve or reject required profile photos for customers and mechanics.",
  },
  {
    key: "mechanic-review",
    href: "/admin/mechanic-review",
    icon: "wrench.and.screwdriver.fill",
    title: "Mechanic Review",
    description: "Verify mechanic license, insurance, and business documents.",
  },
  {
    key: "vehicle-review",
    href: "/admin/vehicle-review",
    icon: "car.fill",
    title: "Vehicle Review",
    description: "Approve or reject customer vehicle registration and insurance docs.",
  },
  {
    key: "capability-review",
    href: "/admin/capability-review",
    icon: "fuelpump.fill",
    title: "Service Capability Review",
    description: "Approve or reject service-specific unlocks, e.g. the fuel container photo required for Fuel Delivery.",
  },
  {
    key: "safety",
    href: "/admin/safety",
    icon: "exclamationmark.triangle.fill",
    title: "Safety & Disputes",
    description: "Review safety reports, flags, and service disputes.",
  },
  {
    key: "analytics",
    href: "/admin/analytics",
    icon: "chart.bar.fill",
    title: "Analytics",
    description: "Launch and usage analytics across regions.",
  },
];

/**
 * Admin home screen — a single in-app entry point into every /admin/* tool.
 * Reachable from the drawer's "Admin Tools" item (see components/app-drawer.tsx)
 * so admins can approve things from their phone, not just by typing a URL in
 * a desktop browser.
 */
export default function AdminHomeScreen() {
  const { user } = useAuth();

  return (
    <ScreenContainer showBackButton title="Admin Tools" containerClassName="bg-background">
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.infoValue}>Signed in as {user?.email || "not signed in"}.</Text>

        {TOOLS.map((tool) => (
          <Pressable
            key={tool.key}
            onPress={() => router.push(tool.href as any)}
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
          >
            <View style={styles.iconWrap}>
              <IconSymbol name={tool.icon} size={24} color="#F97316" />
            </View>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>{tool.title}</Text>
              <Text style={styles.cardDescription}>{tool.description}</Text>
            </View>
            <IconSymbol name="chevron.right" size={18} color="#475569" />
          </Pressable>
        ))}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 12, paddingBottom: 40 },
  infoValue: { color: "#94A3B8", fontSize: 13, marginBottom: 6 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#243044",
    borderRadius: 14,
    padding: 16,
  },
  cardPressed: { opacity: 0.85 },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(249, 115, 22, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  cardText: { flex: 1, gap: 3 },
  cardTitle: { color: "#F8FAFC", fontSize: 16, fontWeight: "800" },
  cardDescription: { color: "#94A3B8", fontSize: 12, lineHeight: 17 },
});
