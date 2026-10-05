import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";

const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL || "support@wrenchup.app";

export default function AboutScreen() {
  const router = useRouter();

  return (
    <ScreenContainer edges={["left", "right", "bottom"]} showBackButton title="About WrenchUp">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <IconSymbol name="chevron.left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>About WrenchUp</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Section title="What We Do">
          WrenchUp is a technology platform that connects vehicle owners with vetted, independent mobile mechanics
          for on-demand and scheduled repair and maintenance services. Customers request service through the
          WrenchUp app, a nearby mechanic accepts the job, and work is completed at the customer&apos;s location.
        </Section>

        <Section title="SMS Messaging Program">
          WrenchUp sends account and transactional text messages, including sign-in verification codes, service
          request and dispatch status updates, mechanic arrival and job-completion notifications, and payment
          confirmations. Phone numbers are collected when a customer or mechanic creates a WrenchUp account and
          consents to receive these messages.
        </Section>

        <Section title="Message Frequency & Rates">
          Message frequency varies based on your account activity and active service requests. Message and data
          rates may apply.
        </Section>

        <Section title="Opt-Out & Help">
          Reply STOP at any time to a WrenchUp text message to stop receiving SMS. Reply HELP for assistance, or
          contact us at {SUPPORT_EMAIL}.
        </Section>

        <Section title="Contact">
          Support: {SUPPORT_EMAIL}
        </Section>

        <View style={styles.linksRow}>
          <Pressable onPress={() => router.push("/legal/privacy")}>
            <Text style={styles.link}>Privacy Policy</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/legal/terms")}>
            <Text style={styles.link}>Terms of Service</Text>
          </Pressable>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionBody}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 28,
    gap: 16,
  },
  section: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
  },
  sectionBody: {
    fontSize: 13,
    lineHeight: 20,
    color: "#334155",
  },
  linksRow: {
    flexDirection: "row",
    gap: 20,
    paddingTop: 4,
  },
  link: {
    fontSize: 13,
    fontWeight: "700",
    color: "#2563EB",
  },
});
