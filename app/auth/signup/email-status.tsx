import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { PrimaryButton } from "@/components/primary-button";
import { ScreenContainer } from "@/components/screen-container";
import { useL } from "@/hooks/use-locale";

type SignupRole = "customer" | "mechanic";

function parseRole(value: unknown): SignupRole {
  return value === "mechanic" ? "mechanic" : "customer";
}

export default function SignupEmailStatusScreen() {
  const L = useL();
  const params = useLocalSearchParams<{ role?: string; email?: string }>();
  const role = parseRole(params.role);
  const email = typeof params.email === "string" ? params.email : "";

  const goNext = () => {
    router.push({
      pathname: "/auth/signup/identity" as any,
      params: { role, email },
    });
  };

  return (
    <View style={styles.root}>
      <ScreenContainer
        containerClassName="bg-background"
        className="bg-background"
        showBackButton
        title={L("Account ready", "Cuenta lista")}
      >
        <ScrollView contentContainerStyle={styles.content} className="px-6 py-8 bg-background">
          <View>
            <View style={styles.stepPill}>
              <Text style={styles.stepPillText}>{L("Step 3 of 4", "Paso 3 de 4")}</Text>
            </View>

            <View style={styles.statusCard}>
              <Text style={styles.title}>
                {L("Your account is ready", "Tu cuenta está lista")}
              </Text>
              <Text style={styles.body}>
                {L(
                  "Continue to identity verification and finish setting up your account.",
                  "Continúa con la verificación de identidad y termina de configurar tu cuenta."
                )}
              </Text>

              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>{L("Account status", "Estado de la cuenta")}</Text>
                <Text style={styles.statusValue}>{L("Ready", "Lista")}</Text>
              </View>

              {email ? <Text style={styles.emailText}>{email}</Text> : null}
            </View>
          </View>

          <View style={styles.footer}>
            <Pressable onPress={() => router.replace("/auth/signup")} style={styles.backButton}>
              <Text style={styles.backButtonText}>{L("Start over", "Empezar de nuevo")}</Text>
            </Pressable>
            <PrimaryButton title={L("Next", "Siguiente")} onPress={goNext} fullWidth={false} />
          </View>
        </ScrollView>
      </ScreenContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0B1220",
  },
  content: {
    flexGrow: 1,
    justifyContent: "space-between",
    paddingBottom: 40,
  },
  stepPill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#1F2937",
    borderWidth: 1,
    borderColor: "#334155",
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 18,
  },
  stepPillText: {
    color: "#F97316",
    fontSize: 12,
    fontWeight: "800",
  },
  statusCard: {
    borderRadius: 14,
    backgroundColor: "#052E2B",
    borderWidth: 1,
    borderColor: "#C2410C",
    padding: 18,
    marginTop: 36,
  },
  title: {
    color: "#F8FAFC",
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 30,
    marginBottom: 10,
  },
  body: {
    color: "#FFEDD5",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  statusRow: {
    borderWidth: 1,
    borderColor: "#C2410C",
    borderRadius: 12,
    backgroundColor: "#064E3B",
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  statusLabel: {
    color: "#A7F3D0",
    fontSize: 13,
    fontWeight: "800",
  },
  statusValue: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
    textAlign: "right",
    flex: 1,
  },
  emailText: {
    color: "#A7F3D0",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 14,
  },
  footer: {
    marginTop: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },
  backButton: {
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  backButtonText: {
    color: "#94A3B8",
    fontSize: 14,
    fontWeight: "800",
  },
});
