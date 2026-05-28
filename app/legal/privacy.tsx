import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";

export default function PrivacyScreen() {
  const router = useRouter();

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <IconSymbol name="chevron.left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Privacy Policy</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Section title="What We Collect">
          We collect account info (email, profile details), vehicle details, service request data, and payment
          method metadata needed to provide platform features.
        </Section>

        <Section title="Location Data Usage">
          We use precise and approximate location data to show nearby mechanics, calculate ETA and distance, improve
          dispatch quality, and support tracking during active jobs. Location may be processed while the app is in
          use and retained with job records for dispute resolution and safety.
        </Section>

        <Section title="Third-Party Services">
          We use third-party providers such as Stripe (payments), map/location services, cloud storage, and analytics
          tools. These services process data under their own privacy terms and security controls.
        </Section>

        <Section title="Data Retention">
          Account profile data is retained while your account is active. Job and transaction records are retained
          for operational, legal, tax, fraud-prevention, and support obligations. Some data may be retained longer
          where required by law or legitimate business needs.
        </Section>

        <Section title="Your Choices">
          You can update profile and vehicle information in-app. You may request account deletion subject to legal
          retention requirements.
        </Section>
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
});
