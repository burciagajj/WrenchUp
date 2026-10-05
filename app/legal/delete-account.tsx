import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";

export default function DeleteAccountInfoScreen() {
  const router = useRouter();

  return (
    <ScreenContainer edges={["left", "right", "bottom"]} showBackButton title="Delete Your Account">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <IconSymbol name="chevron.left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Delete Your Account</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Section title="How to delete your account">
          Open the WrenchUp app, sign in, then go to Menu → Profile → Settings and tap "Delete account". Confirm the
          prompt to permanently delete your account.
        </Section>

        <Section title="What gets deleted">
          Your account, profile (including name, email, phone number, and profile photo), saved vehicles, service
          request history you created as a customer, mechanic availability status, and any safety reports or
          disputes you filed are permanently deleted.
        </Section>

        <Section title="What's retained">
          If you were a mechanic assigned to a job, that job's record is kept for the customer (with the mechanic
          identity removed) for their own records and any legal, tax, or dispute-resolution obligations. Payment
          records already processed by Stripe are retained by Stripe under its own retention policy, independent of
          your WrenchUp account.
        </Section>

        <Section title="Can't sign in?">
          If you can't access the app to delete your account yourself, email support@wrenchup.app from the address
          on your account and we'll process the deletion for you.
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
