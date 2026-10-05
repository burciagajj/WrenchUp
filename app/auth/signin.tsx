/**
 * Sign-in Screen (v1.6)
 * Email/password login with forgot password flow — localized (en / es-MX)
 * Fix: Moved all useState hooks above early return to comply with React rules of hooks
 */

import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Redirect } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import {
  useAuth,
  useLoadUserData,
  useClearUserData,
} from "@/lib/auth-context";
import { getSessionToken } from "@/lib/session-tokens";
import { safeReplace, safePush } from "@/lib/safe-router";
import { supabaseAuth } from "@/lib/_core/supabase-auth";
import { useT, useL } from "@/hooks/use-locale";
import { useRegionBootstrap } from "@/hooks/use-region-bootstrap";
import * as Haptics from "expo-haptics";
import * as LocalAuthentication from "expo-local-authentication";

export default function SignInScreen() {
  // ─── All hooks must come first — no early returns before this block ───
  const {
    signIn: authSignIn,
    isAuthenticated,
    isLoading: authLoading,
  } = useAuth();
  const loadUserData = useLoadUserData();
  const clearUserData = useClearUserData();
  const t = useT();
  const L = useL();
  useRegionBootstrap({ eager: true });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [useBiometric, setUseBiometric] = useState(false);

  // Check for biometrics on mount (additional authentication layer)
  useEffect(() => {
    (async () => {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      setBiometricAvailable(hasHardware && isEnrolled);
    })();
  }, []);
  // ─────────────────────────────────────────────────────────────────────

  // Safe to early return after all hooks have been called
  if (!authLoading && isAuthenticated) {
    return <Redirect href="/(tabs)" />;
  }

  const validateForm = (): boolean => {
    setError(null);
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setError(t("auth.signin.error_email_required"));
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      setError(t("auth.signin.error_email_invalid"));
      return false;
    }
    if (!password) {
      setError(t("auth.signin.error_password_required"));
      return false;
    }
    return true;
  };

  const handleSignIn = async () => {
    if (!validateForm()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      // Extra auth layer: biometric verification if enabled and available
      if (biometricAvailable && useBiometric) {
        const bioResult = await LocalAuthentication.authenticateAsync({
          promptMessage: L("Verify your identity for login", "Verifica tu identidad para iniciar sesión"),
          fallbackLabel: L("Use passcode", "Usar código"),
        });
        if (!bioResult.success) {
          setError(L("Biometric verification required", "Se requiere verificación biométrica"));
          setLoading(false);
          return;
        }
      }

      const authUser = await authSignIn(email.trim().toLowerCase(), password);
      // Must fully finish before loading the new user's data — clearUserData()
      // and loadUserData() both dispatch async, and if load's dispatch lands
      // first, the subsequent clear would wipe the profile we just loaded.
      await clearUserData();
      const sessionToken = await getSessionToken();
      if (sessionToken) {
        await loadUserData(sessionToken, authUser);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      if (authUser.profileCompleted) {
        safeReplace("/(tabs)");
      } else {
        safeReplace("/auth/profile-complete");
      }
    } catch (err: any) {
      const errorCode = err?.code || "";
      let message = t("auth.signin.error_failed");
      if (
        errorCode === "signin_failed" ||
        errorCode === "invalid_credentials"
      ) {
        message = t("auth.signin.error_invalid_credentials");
      } else if (errorCode === "user_not_found") {
        message = t("auth.signin.error_user_not_found");
      } else if (errorCode === "email_not_confirmed") {
        message = L(
          "Email confirmation is still enabled in your Supabase project. Turn off Confirm email in the dashboard to test sign-in without verification.",
          "La confirmación de email sigue activada en tu proyecto de Supabase. Desactiva Confirm email en el panel para probar el inicio de sesión sin verificación."
        );
      } else if (err?.message) {
        message = err.message;
      }

      setError(message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const normalizedEmail = forgotEmail.trim();
    if (!normalizedEmail) {
      setError(t("auth.forgot.error_email_required"));
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      setError(t("auth.forgot.error_email_invalid"));
      return;
    }

    setForgotLoading(true);
    setError(null);

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await supabaseAuth.resetPassword(normalizedEmail.toLowerCase());
      setForgotSuccess(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      console.error("[ForgotPassword] Error:", err);
      setError(t("auth.forgot.error_failed"));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setForgotLoading(false);
    }
  };

  if (showForgotPassword) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0B1220" }}>
        <ScreenContainer containerClassName="bg-background" className="bg-background">
          <ScrollView
            contentContainerStyle={{ flexGrow: 1 }}
            className="px-6 py-8 bg-background"
            keyboardShouldPersistTaps="handled"
          >
          <View className="mb-8">
            <Text className="text-3xl font-bold text-foreground mb-2">
              {t("auth.forgot.title")}
            </Text>
            <Text className="text-base text-muted">
              {t("auth.forgot.subtitle")}
            </Text>
          </View>

          {forgotSuccess && (
            <View className="mb-6 p-4 bg-success/10 rounded-lg border border-success">
              <Text className="text-success font-medium">
                {t("auth.forgot.success")}
              </Text>
            </View>
          )}

          {error && !forgotSuccess && (
            <View className="mb-6 p-4 bg-error/10 rounded-lg border border-error">
              <Text className="text-error font-medium">{error}</Text>
            </View>
          )}

          {!forgotSuccess && (
            <>
              <View className="mb-8">
                <Text className="text-sm font-semibold text-foreground mb-2">
                  {t("auth.forgot.email")}
                </Text>
                <TextInput
                  value={forgotEmail}
                  onChangeText={setForgotEmail}
                  placeholder="your@email.com"
                  placeholderTextColor="#64748B"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  editable={!forgotLoading}
                  className="px-4 py-3 bg-surface border border-border rounded-lg text-foreground"
                />
              </View>

              <Pressable
                onPress={handleForgotPassword}
                disabled={forgotLoading}
                style={[styles.primaryButton, forgotLoading && styles.primaryButtonDisabled]}
              >
                {forgotLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text className="text-white font-bold text-lg">
                    {t("auth.forgot.cta")}
                  </Text>
                )}
              </Pressable>
            </>
          )}

          <Pressable
            onPress={() => {
              setShowForgotPassword(false);
              setForgotSuccess(false);
              setError(null);
            }}
            style={styles.secondaryLinkButton}
          >
            <Text className="text-center text-primary font-semibold">
              {t("auth.forgot.back")}
            </Text>
          </Pressable>
        </ScrollView>
      </ScreenContainer>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#0B1220" }}>
      <ScreenContainer containerClassName="bg-background" className="bg-background">
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          className="px-6 py-8 bg-background"
          keyboardShouldPersistTaps="handled"
        >
        <View className="mb-8">
          <Text className="text-4xl font-bold text-foreground mb-2">
            {t("auth.signin.title")}
          </Text>
          <Text className="text-base text-muted">
            {t("auth.signin.subtitle")}
          </Text>
        </View>

        {error && (
          <View className="mb-6 p-4 bg-error/10 rounded-lg border border-error">
            <Text className="text-error font-medium">{error}</Text>
          </View>
        )}

        <View className="mb-5">
          <Text className="text-sm font-semibold text-foreground mb-2">
            {t("auth.signin.email")}
          </Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="your@email.com"
            placeholderTextColor="#64748B"
            keyboardType="email-address"
            autoCapitalize="none"
            editable={!loading}
            className="px-4 py-3 bg-surface border border-border rounded-lg text-foreground"
          />
        </View>

        <View className="mb-3">
          <Text className="text-sm font-semibold text-foreground mb-2">
            {t("auth.signin.password")}
          </Text>
          <View className="flex-row items-center">
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder={t("auth.signin.password_placeholder")}
              placeholderTextColor="#64748B"
              secureTextEntry={!showPassword}
              editable={!loading}
              className="flex-1 px-4 py-3 pr-16 bg-surface border border-border rounded-lg text-foreground"
            />
            <Pressable
              onPress={() => setShowPassword(!showPassword)}
              style={styles.passwordToggle}
            >
              <Text className="text-primary text-sm font-semibold">
                {showPassword ? t("auth.signin.hide") : t("auth.signin.show")}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Additional authentication: Biometric login option */}
        {biometricAvailable && (
          <Pressable
            onPress={() => setUseBiometric(!useBiometric)}
            style={styles.biometricRow}
          >
            <View className={`w-5 h-5 mr-2 border rounded ${useBiometric ? "bg-primary border-primary" : "border-border"}`}>
              {useBiometric && <Text className="text-white text-xs text-center">✓</Text>}
            </View>
            <Text className="text-foreground text-sm">
              {L("Use biometrics for this login", "Usar biometría para este inicio de sesión")}
            </Text>
          </Pressable>
        )}

        <Pressable
          onPress={() => {
            setShowForgotPassword(true);
            setError(null);
            setForgotEmail(email);
          }}
          style={styles.forgotButton}
        >
          <Text className="text-right text-primary font-semibold text-sm">
            {t("auth.signin.forgot")}
          </Text>
        </Pressable>

        <Pressable
          onPress={handleSignIn}
          disabled={loading}
          style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text className="text-white font-bold text-lg">
              {t("auth.signin.cta")}
            </Text>
          )}
        </Pressable>

        <View className="mt-6 flex-row justify-center gap-2">
          <Text className="text-muted">{t("auth.signin.no_account")}</Text>
          <Pressable onPress={() => safePush("/auth/signup")}>
            <Text className="text-primary font-semibold">
              {t("auth.signin.sign_up")}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
      </ScreenContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  biometricRow: {
    alignItems: "center",
    flexDirection: "row",
    marginBottom: 16,
  },
  forgotButton: {
    marginBottom: 32,
  },
  passwordToggle: {
    position: "absolute",
    right: 16,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#F97316",
    borderRadius: 8,
    flexDirection: "row",
    justifyContent: "center",
    minHeight: 56,
    paddingVertical: 16,
  },
  primaryButtonDisabled: {
    opacity: 0.55,
  },
  secondaryLinkButton: {
    marginTop: 24,
  },
});
