import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";

export default function TermsScreen() {
  const router = useRouter();

  return (
    <ScreenContainer edges={["left", "right", "bottom"]} showBackButton title="Terms of Service">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <IconSymbol name="chevron.left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Terms of Service</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Section title="Platform Role">
          WrenchUp is a technology platform that connects customers and independent mechanics. WrenchUp does not
          provide repair services directly and is not responsible for the performance of repair work.
        </Section>

        <Section title="Independent Contractor Relationship">
          Mechanics using WrenchUp are independent contractors, not employees, agents, or partners of WrenchUp.
          WrenchUp does not control how, when, or where mechanics perform services.
        </Section>

        <Section title="Service Quality">
          Service outcomes, repair quality, timelines, tools, and parts are determined by the mechanic performing
          the work. Customers should inspect completed work and raise disputes promptly through support.
        </Section>

        <Section title="Limitation of Liability">
          To the fullest extent allowed by law, WrenchUp and its affiliates are not liable for indirect, incidental,
          special, consequential, or punitive damages, including lost profits, data loss, vehicle downtime, or
          replacement costs, arising from use of the platform.
        </Section>

        <Section title="Arbitration and Class Action Waiver (US)">
          For users in the United States, disputes will be resolved by binding individual arbitration instead of
          court, except where prohibited by law. You waive any right to participate in class, collective, or
          representative actions.
        </Section>

        <Section title="Payments and Fees">
          By confirming payment, you authorize charges for services booked through the platform, including applicable
          taxes, fees, and authorized adjustments.
        </Section>

        <Section title="Cancellations">
          When you request a service, a hold is placed on your card. You can cancel for free until your mechanic has
          driven a meaningful distance toward you. If you cancel after the mechanic has driven at least half a mile
          and at least a quarter of their trip to you, a $5 cancellation fee (or the local-currency equivalent for
          requests in Mexico) is charged from that hold and paid to the mechanic, and the rest of the hold is
          released. Distance is measured from the mechanic&apos;s GPS; if it can&apos;t be measured, no fee is charged.
          No fee applies if the mechanic cancels.
        </Section>

        <Section title="Keeping Payments on WrenchUp">
          Jobs found through WrenchUp must be booked and paid through WrenchUp. Phone numbers, emails, and payment-app
          details are hidden in chat. Refunds, disputes, and payout protections only cover jobs paid through the
          app.
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
