/**
 * Sign-up Chooser (improved)
 * Role selection page. Each role has its own dedicated sign-up form page
 * (/auth/signup/customer and /auth/signup/mechanic) for tailored UX and future auth features.
 */

import { View, Text, Pressable, ScrollView, StyleSheet, TouchableOpacity } from "react-native";
import { Redirect, router, type Href } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/lib/auth-context";

import { useLocaleContext, useT, useL } from "@/hooks/use-locale";
import { IconSymbol } from "@/components/ui/icon-symbol";
import * as Haptics from "expo-haptics";
import { trackAnalyticsEvent } from "@/lib/analytics";

export default function SignUpChooserScreen() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const t = useT();
  const L = useL();
  const { region } = useLocaleContext();

  if (!authLoading && isAuthenticated) {
    return <Redirect href="/(tabs)" />;
  }

  const goToRoleSignup = (role: "customer" | "mechanic") => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void trackAnalyticsEvent({
      eventName: "signup_started",
      role,
      properties: {
        region_code: region,
        source: "role_select",
      },
    });
    const path = role === "customer" ? "/auth/signup/customer" : "/auth/signup/mechanic";
    router.push(path as Href);
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#0B1220" }}>
      <ScreenContainer containerClassName="bg-background" className="bg-background">
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="px-6 py-8 bg-background">
          <View className="mb-8">
            <Text className="text-4xl font-bold text-foreground mb-2">{t("auth.signup.title")}</Text>
            <Text className="text-base text-muted">{t("auth.signup.subtitle")}</Text>
          </View>

          <Text className="text-lg font-semibold text-foreground mb-4">{t("auth.signup.role_label")}</Text>

          {/* Customer Card */}
          <TouchableOpacity
            onPress={() => goToRoleSignup("customer")}
            activeOpacity={0.85}
            style={styles.roleCard}
          >
            <View className="flex-row items-center gap-4">
              <View className="w-12 h-12 rounded-full bg-primary/15 items-center justify-center">
                <IconSymbol name="person.fill" size={26} color="#F97316" />
              </View>
              <View className="flex-1">
                <Text className="text-xl font-bold text-foreground">{t("auth.signup.role_customer")}</Text>
                <Text className="text-muted mt-1">{t("auth.signup.role_customer_desc")}</Text>
              </View>
              <IconSymbol name="chevron.right" size={20} color="#94A3B8" />
            </View>
            <View className="mt-3 pt-3 border-t border-border">
              <Text className="text-sm text-muted">{t("auth.signup.customer_subtitle")}</Text>
            </View>
          </TouchableOpacity>

          {/* Mechanic Card */}
          <TouchableOpacity
            onPress={() => goToRoleSignup("mechanic")}
            activeOpacity={0.85}
            style={[styles.roleCard, styles.mechanicCard]}
          >
            <View className="flex-row items-center gap-4">
              <View className="w-12 h-12 rounded-full bg-primary/15 items-center justify-center">
                <IconSymbol name="wrench.and.screwdriver.fill" size={26} color="#F97316" />
              </View>
              <View className="flex-1">
                <Text className="text-xl font-bold text-foreground">{t("auth.signup.role_mechanic")}</Text>
                <Text className="text-muted mt-1">{t("auth.signup.role_mechanic_desc")}</Text>
              </View>
              <IconSymbol name="chevron.right" size={20} color="#94A3B8" />
            </View>
            <View className="mt-3 pt-3 border-t border-border">
              <Text className="text-sm text-muted">{t("auth.signup.mechanic_subtitle")}</Text>
            </View>
          </TouchableOpacity>

          <View className="mt-4 flex-row justify-center gap-2">
            <Text className="text-muted">{t("auth.signup.has_account")}</Text>
            <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/auth/signin"); }}>
              <Text className="text-primary font-semibold">{t("auth.signup.sign_in")}</Text>
            </Pressable>
          </View>

          <Text className="mt-8 text-center text-[11px] text-muted">
            {L("Your data is protected. See our Safety Policy for details on how we keep you and your vehicle secure.", "Tus datos están protegidos. Consulta nuestra Política de Seguridad para detalles sobre cómo mantenemos tu vehículo seguro.")}
          </Text>
        </ScrollView>
      </ScreenContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  roleCard: {
    marginBottom: 16,
    padding: 20,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#243044",
    backgroundColor: "#111827",
  },
  mechanicCard: {
    marginBottom: 24,
  },
});
