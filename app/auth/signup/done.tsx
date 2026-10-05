import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { PrimaryButton } from "@/components/primary-button";
import { ScreenContainer } from "@/components/screen-container";
import { useL } from "@/hooks/use-locale";

type SignupRole = "customer" | "mechanic";

function parseRole(value: unknown): SignupRole {
  return value === "mechanic" ? "mechanic" : "customer";
}

export default function SignupDoneScreen() {
  const L = useL();
  const params = useLocalSearchParams<{ role?: string; email?: string }>();
  const role = parseRole(params.role);
  const email = typeof params.email === "string" ? params.email : "";
  const isMechanic = role === "mechanic";

  return (
    <ScreenContainer
      containerClassName="bg-background"
      className="bg-background"
      title={L("Signup submitted", "Registro enviado")}
    >
      <View style={styles.content}>
        <View>
          <Text style={styles.kicker}>{L("Account created", "Cuenta creada")}</Text>
          <Text style={styles.title}>
            {isMechanic
              ? L("Waiting for approval", "Esperando aprobación")
              : L("Your account is ready", "Tu cuenta está lista")}
          </Text>
          <Text style={styles.body}>
            {isMechanic
              ? L(
                  "We'll let you know when your account is approved to take job requests.",
                  "Te avisaremos cuando tu cuenta sea aprobada para tomar solicitudes."
                )
              : L(
                  "You can sign in now and continue setting up your profile.",
                  "Ya puedes iniciar sesión y continuar configurando tu perfil."
                )}
          </Text>
          {email ? <Text style={styles.email}>{email}</Text> : null}
        </View>

        <View style={styles.footer}>
          <PrimaryButton
            title={L("Go to Sign In", "Ir a iniciar sesión")}
            onPress={() =>
              router.replace({
                pathname: "/auth/signin" as any,
                params: { email },
              })
            }
          />
          <Pressable onPress={() => router.replace("/auth/signup" as any)} style={styles.linkButton}>
            <Text style={styles.linkText}>{L("Create another account", "Crear otra cuenta")}</Text>
          </Pressable>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: "space-between",
    padding: 24,
  },
  kicker: {
    color: "#F97316",
    fontSize: 13,
    fontWeight: "900",
    marginBottom: 12,
    textTransform: "uppercase",
  },
  title: {
    color: "#F8FAFC",
    fontSize: 30,
    fontWeight: "900",
    lineHeight: 36,
    marginBottom: 12,
  },
  body: {
    color: "#CBD5E1",
    fontSize: 16,
    lineHeight: 24,
  },
  email: {
    color: "#94A3B8",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 18,
  },
  footer: {
    gap: 14,
  },
  linkButton: {
    alignItems: "center",
    paddingVertical: 12,
  },
  linkText: {
    color: "#F97316",
    fontSize: 14,
    fontWeight: "800",
  },
});
