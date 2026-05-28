/**
 * Sign-up Screen (v1.5)
 * Email/password registration with Customer/Mechanic role selection
 * Complements existing OAuth flow
 */

import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "../../lib/auth-context";
import { useStore } from "@/lib/store";
import { resolveAuthSession } from "@/lib/resolve-auth-session";
import { supabaseUserData } from "@/lib/_core/supabase-user-data";
import { useT } from "@/hooks/use-locale";
import * as Haptics from "expo-haptics";

export default function SignUpScreen() {
  const AUTH_COOLDOWN_SECONDS = 4;
  const { dispatch } = useStore();
  const { signUp: authSignUp } = useAuth();
  const t = useT();

  // Form state
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [selectedRole, setSelectedRole] = useState<"customer" | "mechanic">("customer");
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [attestedMechanic, setAttestedMechanic] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldownLeft, setCooldownLeft] = useState(0);

  useEffect(() => {
    if (cooldownLeft <= 0) return;
    const timer = setInterval(() => {
      setCooldownLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownLeft]);

  const validateForm = (): boolean => {
    setError(null);

    // Email validation
    if (!fullName.trim()) {
      setError("Nombre completo obligatorio");
      return false;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth.trim())) {
      setError("Fecha de nacimiento requerida (AAAA-MM-DD)");
      return false;
    }
    const dob = new Date(`${dateOfBirth.trim()}T00:00:00`);
    if (Number.isNaN(dob.getTime())) {
      setError("Ingresa una fecha de nacimiento válida");
      return false;
    }
    if (!email.trim()) {
      setError(t("auth.signup.error_email_required"));
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError(t("auth.signup.error_email_invalid"));
      return false;
    }

    // Password validation
    if (!password) {
      setError(t("auth.signup.error_password_required"));
      return false;
    }
    if (password.length < 8) {
      setError(t("auth.signup.error_password_short"));
      return false;
    }

    // Confirm password
    if (password !== confirmPassword) {
      setError(t("auth.signup.error_password_mismatch"));
      return false;
    }
    if (!acceptedLegal) {
      setError("Debes aceptar los Términos y la Política de Privacidad");
      return false;
    }
    if (selectedRole === "mechanic" && !attestedMechanic) {
      setError("Los mecánicos deben certificar elegibilidad antes de crear cuenta");
      return false;
    }

    return true;
  };

  const handleSignUp = async () => {
    if (cooldownLeft > 0 || loading) return;
    if (!validateForm()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    setLoading(true);
    setCooldownLeft(AUTH_COOLDOWN_SECONDS);
    setError(null);

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      // Use auth context to sign up (this handles session persistence)
      const authUser = await authSignUp(email.trim().toLowerCase(), password, selectedRole);
      const resolved = await resolveAuthSession(authUser);
      if (resolved) {
        await supabaseUserData.updateProfile(
          authUser.id,
          { full_name: fullName.trim(), date_of_birth: dateOfBirth.trim() },
          resolved.sessionToken,
          authUser.email
        );
      }

      // Store user info in app state
      dispatch({
        type: "SET_ROLE",
        payload: authUser.role,
      });
      dispatch({ type: "SET_USER_NAME", payload: fullName.trim() });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Navigate to profile completion screen
      // Auth context will have user set, so profile-complete can access it
      router.replace({
        pathname: "/auth/profile-complete",
        params: { prefillName: fullName.trim() },
      } as any);
    } catch (err: any) {
      console.error("[SignUp] Full Error:", err);

      // User-friendly error messages
      let message = t("auth.signup.error_failed");
      const errorCode = err?.code || "";
      const errorMsg = err?.message || "";

      if (errorCode === "user_already_exists" || errorMsg.includes("already exists")) {
        message = t("auth.signup.error_exists");
      } else if (errorCode === "weak_password" || errorMsg.includes("weak")) {
        message = t("auth.signup.error_weak_password");
      } else if (errorMsg.includes("invalid") || errorMsg.includes("Invalid")) {
        message = `Invalid input: ${errorMsg}`;
      } else if (errorMsg.includes("email") || errorMsg.includes("Email")) {
        message = `Email error: ${errorMsg}`;
      } else if (errorMsg) {
        message = errorMsg;
      }

      setError(message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer className="bg-background">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="px-6 py-8">
        {/* Header */}
        <View className="mb-8">
          <Text className="text-4xl font-bold text-foreground mb-2">{t("auth.signup.title")}</Text>
          <Text className="text-base text-muted">{t("auth.signup.subtitle")}</Text>
        </View>

        {/* Role Selection */}
        <View className="mb-8">
          <Text className="text-lg font-semibold text-foreground mb-4">{t("auth.signup.role_label")}</Text>
          <View className="flex-row gap-4">
            {/* Customer Role */}
            <Pressable
              onPress={() => {
                setSelectedRole("customer");
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              className={`flex-1 p-4 rounded-lg border-2 ${
                selectedRole === "customer"
                  ? "border-primary bg-primary/10"
                  : "border-border bg-surface"
              }`}
            >
              <Text
                className={`text-center font-semibold ${
                  selectedRole === "customer" ? "text-primary" : "text-foreground"
                }`}
              >
                {t("auth.signup.role_customer")}
              </Text>
              <Text
                className={`text-center text-xs mt-1 ${
                  selectedRole === "customer" ? "text-primary" : "text-muted"
                }`}
              >
                {t("auth.signup.role_customer_desc")}
              </Text>
            </Pressable>

            {/* Mechanic Role */}
            <Pressable
              onPress={() => {
                setSelectedRole("mechanic");
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              className={`flex-1 p-4 rounded-lg border-2 ${
                selectedRole === "mechanic"
                  ? "border-primary bg-primary/10"
                  : "border-border bg-surface"
              }`}
            >
              <Text
                className={`text-center font-semibold ${
                  selectedRole === "mechanic" ? "text-primary" : "text-foreground"
                }`}
              >
                {t("auth.signup.role_mechanic")}
              </Text>
              <Text
                className={`text-center text-xs mt-1 ${
                  selectedRole === "mechanic" ? "text-primary" : "text-muted"
                }`}
              >
                {t("auth.signup.role_mechanic_desc")}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Error Message */}
        {error && (
          <View className="mb-6 p-4 bg-error/10 rounded-lg border border-error">
            <Text className="text-error font-medium">{error}</Text>
          </View>
        )}

        {/* Full Name Input */}
        <View className="mb-5">
          <Text className="text-sm font-semibold text-foreground mb-2">Nombre completo</Text>
          <TextInput
            value={fullName}
            onChangeText={setFullName}
            placeholder="Tu nombre completo"
            placeholderTextColor="#999"
            editable={!loading}
            className="px-4 py-3 bg-surface border border-border rounded-lg text-foreground"
          />
        </View>

        {/* Date of Birth Input */}
        <View className="mb-5">
          <Text className="text-sm font-semibold text-foreground mb-2">Fecha de nacimiento</Text>
          <TextInput
            value={dateOfBirth}
            onChangeText={setDateOfBirth}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#999"
            autoCapitalize="none"
            editable={!loading}
            className="px-4 py-3 bg-surface border border-border rounded-lg text-foreground"
          />
        </View>

        {/* Email Input */}
        <View className="mb-5">
          <Text className="text-sm font-semibold text-foreground mb-2">{t("auth.signup.email")}</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="your@email.com"
            placeholderTextColor="#999"
            keyboardType="email-address"
            autoCapitalize="none"
            editable={!loading}
            className="px-4 py-3 bg-surface border border-border rounded-lg text-foreground"
          />
        </View>

        {/* Password Input */}
        <View className="mb-5">
          <Text className="text-sm font-semibold text-foreground mb-2">{t("auth.signup.password")}</Text>
          <View className="flex-row items-center">
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder={t("auth.signup.password_placeholder")}
              placeholderTextColor="#999"
              secureTextEntry={!showPassword}
              editable={!loading}
              className="flex-1 px-4 py-3 bg-surface border border-border rounded-lg text-foreground"
            />
            <Pressable
              onPress={() => setShowPassword(!showPassword)}
              className="absolute right-4"
            >
              <Text className="text-primary text-sm font-semibold">
                {showPassword ? t("auth.signin.hide") : t("auth.signin.show")}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Confirm Password Input */}
        <View className="mb-8">
          <Text className="text-sm font-semibold text-foreground mb-2">{t("auth.signup.confirm_password")}</Text>
          <TextInput
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder={t("auth.signup.confirm_placeholder")}
            placeholderTextColor="#999"
            secureTextEntry={!showPassword}
            editable={!loading}
            className="px-4 py-3 bg-surface border border-border rounded-lg text-foreground"
          />
        </View>

        <View className="mb-3">
          <Pressable
            onPress={() => setAcceptedLegal((prev) => !prev)}
            className="flex-row items-start gap-3"
            disabled={loading}
          >
            <View
              className={`mt-0.5 h-5 w-5 rounded border items-center justify-center ${
                acceptedLegal ? "bg-primary border-primary" : "border-border"
              }`}
            >
              {acceptedLegal ? <Text className="text-white text-xs font-bold">✓</Text> : null}
            </View>
            <Text className="text-sm text-muted flex-1 leading-5">
              Acepto los Términos de Servicio y la Política de Privacidad.
            </Text>
          </Pressable>
        </View>

        <View className="mb-6 flex-row gap-3">
          <Pressable
            onPress={() => router.push("/legal/terms")}
            disabled={loading}
            className="flex-1 py-3 rounded-lg border border-border bg-surface"
          >
            <Text className="text-center text-primary font-semibold">Ver Términos</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push("/legal/privacy")}
            disabled={loading}
            className="flex-1 py-3 rounded-lg border border-border bg-surface"
          >
            <Text className="text-center text-primary font-semibold">Ver Privacidad</Text>
          </Pressable>
        </View>

        {selectedRole === "mechanic" ? (
          <View className="mb-6">
            <Pressable
              onPress={() => setAttestedMechanic((prev) => !prev)}
              className="flex-row items-start gap-3"
              disabled={loading}
            >
              <View
                className={`mt-0.5 h-5 w-5 rounded border items-center justify-center ${
                  attestedMechanic ? "bg-primary border-primary" : "border-border"
                }`}
              >
                {attestedMechanic ? <Text className="text-white text-xs font-bold">✓</Text> : null}
              </View>
              <Text className="text-sm text-muted flex-1 leading-5">
                Certifico que no tengo antecedentes descalificantes y que mis documentos son válidos.
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* Sign Up Button */}
        <Pressable
          onPress={handleSignUp}
          disabled={loading || cooldownLeft > 0 || !acceptedLegal || (selectedRole === "mechanic" && !attestedMechanic)}
          style={({ pressed }) => ({
            paddingVertical: 16,
            borderRadius: 8,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor:
              loading || !acceptedLegal || (selectedRole === "mechanic" && !attestedMechanic)
                || cooldownLeft > 0
                ? "rgba(59, 130, 246, 0.5)"
                : "#3B82F6",
            opacity: pressed ? 0.8 : 1,
          })}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 18 }}>
              {cooldownLeft > 0 ? `Try again in ${cooldownLeft}s` : t("auth.signup.cta")}
            </Text>
          )}
        </Pressable>

        {/* Sign In Link */}
        <View className="mt-6 flex-row justify-center gap-2">
          <Text className="text-muted">{t("auth.signup.has_account")}</Text>
          <Pressable onPress={() => router.push("/auth/signin")}>
            <Text className="text-primary font-semibold">{t("auth.signup.sign_in")}</Text>
          </Pressable>
        </View>

        <View className="mt-5 mb-2">
          <Text className="text-center text-xs text-muted">
            Al usar WrenchUp también aceptas nuestros{" "}
            <Text className="text-primary" onPress={() => router.push("/legal/terms")}>
              Términos
            </Text>{" "}
            y{" "}
            <Text className="text-primary" onPress={() => router.push("/legal/privacy")}>
              Política de Privacidad
            </Text>
            .
          </Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
