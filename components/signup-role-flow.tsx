import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Redirect, router } from "expo-router";
import * as Haptics from "expo-haptics";

import { PrimaryButton } from "@/components/primary-button";
import { ScreenContainer } from "@/components/screen-container";
import { PhoneNumberInput } from "@/components/phone-number-input";
import { getSessionToken, useAuth, useLoadUserData } from "@/lib/auth-context";
import { supabaseAuth } from "@/lib/_core/supabase-auth";
import { normalizeFullName, validateFullName } from "@/lib/identity-validation";
import { useLocaleContext, useL, useT } from "@/hooks/use-locale";
import { trackAnalyticsEvent } from "@/lib/analytics";

type SignupRoleFlowProps = {
  role: "customer" | "mechanic";
  titleKey: "auth.signup.customer_title" | "auth.signup.mechanic_title";
  subtitleKey: "auth.signup.customer_subtitle" | "auth.signup.mechanic_subtitle";
};

type SignupStep = "name" | "email";
type AccountStatus = "idle" | "creating" | "ready";

export function SignupRoleFlow({ role, titleKey, subtitleKey }: SignupRoleFlowProps) {
  const { isAuthenticated, isLoading: authLoading, signUp } = useAuth();
  const loadUserData = useLoadUserData();
  const t = useT();
  const L = useL();
  const { region } = useLocaleContext();

  const [step, setStep] = useState<SignupStep>("name");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [smsOptIn, setSmsOptIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [_accountStatus, setAccountStatus] = useState<AccountStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const fullName = useMemo(
    () => normalizeFullName(`${firstName} ${lastName}`),
    [firstName, lastName]
  );

  const passwordStrength = useMemo(() => {
    if (!password) return { label: "", score: 0 };
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[a-z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    const normalized = Math.min(3, Math.floor(score / 2));
    const labels = [L("Weak", "Débil"), L("Medium", "Media"), L("Strong", "Fuerte")];
    return { label: labels[normalized], score: normalized + 1 };
  }, [password, L]);

  if (!authLoading && isAuthenticated) {
    return <Redirect href="/(tabs)" />;
  }

  const validateNameStep = () => {
    setError(null);
    const nameError = validateFullName(fullName);
    if (nameError) {
      setError(localizeFullNameError(nameError, L));
      return false;
    }
    return true;
  };

  const validateAccountStep = () => {
    if (!validateNameStep()) {
      setStep("name");
      return false;
    }

    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setError(t("auth.signup.error_email_required"));
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError(t("auth.signup.error_email_invalid"));
      return false;
    }
    if (!password) {
      setError(t("auth.signup.error_password_required"));
      return false;
    }
    const normalizedPhone = phoneNumber.trim();
    if (!normalizedPhone) {
      setError(L("Phone number is required.", "Se requiere número de teléfono."));
      return false;
    }
    if (!/^\+?[0-9()\-\s]{7,}$/.test(normalizedPhone)) {
      setError(L("Enter a valid phone number.", "Ingresa un número de teléfono válido."));
      return false;
    }
    if (password.length < 8) {
      setError(t("auth.signup.error_password_short"));
      return false;
    }
    if (password !== confirmPassword) {
      setError(t("auth.signup.error_password_mismatch"));
      return false;
    }
    if (!agreeTerms) {
      setError(t("auth.signup.must_accept_terms"));
      return false;
    }
    setError(null);
    return true;
  };

  const handleNext = () => {
    if (!validateNameStep()) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStep("email");
  };

  const handleSendVerification = async () => {
    if (!validateAccountStep()) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    setLoading(true);
    setAccountStatus("creating");
    setError(null);
    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const authUser = await signUp(
        email.trim().toLowerCase(),
        password,
        role
      );
      const sessionToken = await getSessionToken();
      if (sessionToken) {
        await supabaseAuth.updateUserMetadataWithToken(sessionToken, {
          role,
          profileCompleted: false,
          full_name: fullName,
          display_name: fullName,
          phone_number: phoneNumber.trim(),
          sms_opt_in: smsOptIn,
        });
        await loadUserData(sessionToken, authUser);
      }
      setAccountStatus("ready");
      void trackAnalyticsEvent({
        eventName: "signup_completed",
        userId: authUser.id,
        role,
        properties: {
          region_code: region,
          has_session: !!sessionToken,
          email_confirmed: authUser.emailConfirmed,
        },
        sessionToken: sessionToken || null,
      });
      setError(null);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Both roles now must complete profile-complete (name, required photo,
      // + role-specific fields) right after account creation — it was
      // previously skipped here, which let new accounts (especially
      // customers) reach the app with no photo and no vehicle on file.
      // Pass the name along so it doesn't ask for it a second time — the
      // fresh profile row starts with full_name null until saved there.
      router.replace({
        pathname: "/auth/profile-complete" as any,
        params: { prefillName: fullName },
      });
      return;
    } catch (err: any) {
      console.error(`[${role}SignUp] Error:`, err);
      let message = err?.message || t("auth.signup.error_failed");
      if (
        err?.code === "weak_password" ||
        err?.code === "password_too_weak" ||
        /password should contain/i.test(message) ||
        /password is too weak/i.test(message)
      ) {
        message = t("auth.signup.error_weak_password");
      }
      const looksLikeExistingAccount =
        err?.code === "user_already_exists" || message.toLowerCase().includes("already");
      if (looksLikeExistingAccount) {
        // This might not be a real conflict — if the network dropped between
        // account creation and the profile-metadata sync step just now (or in
        // an earlier attempt), the account already belongs to this person and
        // they're just retrying with the same credentials. Confirm ownership
        // by attempting a real sign-in with what they just typed: if it
        // succeeds, resume straight into the app instead of dead-ending them
        // on an "account already exists" message for their own account.
        try {
          const signInResult = await supabaseAuth.signIn(email.trim().toLowerCase(), password);
          if (signInResult?.session) {
            // Don't stomp a profile that was actually already completed in a
            // prior session — only (re)sync signup fields if it wasn't.
            const alreadyCompleted = signInResult.user.profileCompleted === true;
            if (!alreadyCompleted) {
              await supabaseAuth.updateUserMetadataWithToken(signInResult.session, {
                role,
                profileCompleted: false,
                full_name: fullName,
                display_name: fullName,
                phone_number: phoneNumber.trim(),
              });
            }
            await loadUserData(signInResult.session, signInResult.user);
            void trackAnalyticsEvent({
              eventName: "signup_completed",
              userId: signInResult.user.id,
              role,
              properties: {
                region_code: region,
                has_session: true,
                email_confirmed: signInResult.user.emailConfirmed,
                resumed: true,
                already_completed: alreadyCompleted,
              },
              sessionToken: signInResult.session,
            });
            setAccountStatus("ready");
            setError(null);
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            if (alreadyCompleted) {
              // Genuinely an existing, fully-onboarded account — send them to
              // their normal landing spot rather than back through onboarding.
              router.replace("/(tabs)" as any);
            } else {
              router.replace({
                pathname: "/auth/profile-complete" as any,
                params: { prefillName: fullName },
              });
            }
            return;
          }
        } catch (resumeErr) {
          console.warn(`[${role}SignUp] Resume sign-in attempt failed:`, resumeErr);
          // Fall through to the standard "account already exists" message —
          // either it's a genuinely different account, or the password they
          // typed doesn't match, so we can't safely resume.
        }
      }
      if (looksLikeExistingAccount) {
        message = t("auth.signup.error_exists");
      } else if (err?.code === "over_email_send_rate_limit" || message.toLowerCase().includes("email rate limit")) {
        message = L(
          "Too many signup attempts. Please wait a minute, then try again.",
          "Demasiados intentos de registro. Espera un minuto y vuelve a intentarlo."
        );
      }
      void trackAnalyticsEvent({
        eventName: "signup_failed",
        role,
        properties: {
          region_code: region,
          stage: "account_creation",
          code: err?.code || "signup_failed",
          message: String(message).slice(0, 180),
        },
      });
      setAccountStatus("idle");
      setError(message);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const strengthColor =
    passwordStrength.score === 1 ? "#EF4444" : passwordStrength.score === 2 ? "#F59E0B" : "#10B981";
  const stepNumber = step === "name" ? L("Step 1 of 2", "Paso 1 de 2") : L("Step 2 of 2", "Paso 2 de 2");

  return (
    <View style={styles.root}>
      <ScreenContainer containerClassName="bg-background" className="bg-background" showBackButton title={t(titleKey)}>
        <ScrollView
          contentContainerStyle={styles.content}
          className="px-6 py-8 bg-background"
          keyboardShouldPersistTaps="handled"
        >
          <View>
            <View className="mb-6">
              <Text className="text-3xl font-bold text-foreground mb-2">{t(titleKey)}</Text>
              <Text className="text-base text-muted">{t(subtitleKey)}</Text>
            </View>

            <View style={styles.stepPill}>
              <Text style={styles.stepPillText}>{stepNumber}</Text>
            </View>

            {error ? (
              <View className="mb-6 p-4 bg-error/10 rounded-lg border border-error">
                <Text className="text-error font-medium">{error}</Text>
              </View>
            ) : null}

            {step === "name" ? (
              <View style={styles.formBlock}>
                <Text style={styles.pageTitle}>{L("What is your legal name?", "¿Cuál es tu nombre legal?")}</Text>
                <Text style={styles.helperText}>
                  {L(
                    "Use your real first and last name. Mechanics will need this to match verification documents.",
                    "Usa tu nombre y apellido reales. Los mecánicos lo necesitarán para coincidir con documentos."
                  )}
                </Text>

                <View className="mb-5">
                  <Text className="text-sm font-semibold text-foreground mb-2">{L("First Name", "Nombre")}</Text>
                  <TextInput
                    value={firstName}
                    onChangeText={setFirstName}
                    placeholder={L("First name", "Nombre")}
                    placeholderTextColor="#64748B"
                    autoCapitalize="words"
                    editable={!loading}
                    className="px-4 py-3 bg-surface border border-border rounded-lg text-foreground"
                  />
                </View>

                <View className="mb-5">
                  <Text className="text-sm font-semibold text-foreground mb-2">{L("Last Name", "Apellido")}</Text>
                  <TextInput
                    value={lastName}
                    onChangeText={setLastName}
                    placeholder={L("Last name", "Apellido")}
                    placeholderTextColor="#64748B"
                    autoCapitalize="words"
                    editable={!loading}
                    className="px-4 py-3 bg-surface border border-border rounded-lg text-foreground"
                  />
                </View>
              </View>
            ) : step === "email" ? (
              <View style={styles.formBlock}>
                <Text style={styles.pageTitle}>{L("Create your account", "Crea tu cuenta")}</Text>
                <Text style={styles.helperText}>
                  {L(
                    "Add your email, phone number, and password. We'll create your account right away.",
                    "Agrega tu correo, número de teléfono y contraseña. Crearemos tu cuenta de inmediato."
                  )}
                </Text>

                <View className="mb-5">
                  <Text className="text-sm font-semibold text-foreground mb-2">{t("auth.signup.email")}</Text>
                  <TextInput
                    value={email}
                    onChangeText={(value) => {
                      setEmail(value);
                      setAccountStatus("idle");
                    }}
                    placeholder="your@email.com"
                    placeholderTextColor="#64748B"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    editable={!loading}
                    className="px-4 py-3 bg-surface border border-border rounded-lg text-foreground"
                  />
                </View>

                <View className="mb-5">
                  <Text className="text-sm font-semibold text-foreground mb-2">
                    {L("Phone Number", "Número de teléfono")}
                  </Text>
                  <PhoneNumberInput
                    value={phoneNumber}
                    onChangeValue={(next) => {
                      setPhoneNumber(next);
                      setAccountStatus("idle");
                    }}
                    editable={!loading}
                    defaultCountry={region === "MX" ? "MX" : "US"}
                  />
                  <Pressable onPress={() => setSmsOptIn(!smsOptIn)} style={[styles.termsRow, { marginTop: 8, marginBottom: 0 }]}>
                    <View className={`w-5 h-5 mt-0.5 mr-2 border rounded ${smsOptIn ? "bg-primary border-primary" : "border-border"}`}>
                      {smsOptIn ? <Text className="text-white text-xs text-center">✓</Text> : null}
                    </View>
                    <Text className="text-xs text-muted flex-1 leading-4">
                      {L(
                        "I agree to receive SMS messages from WrenchUp (sign-in verification codes, service updates). Message frequency varies. Message and data rates may apply. Reply STOP to opt out, HELP for help. This is optional.",
                        "Acepto recibir mensajes SMS de WrenchUp (códigos de verificación, actualizaciones de servicio). La frecuencia de mensajes varía. Pueden aplicarse tarifas de mensajes y datos. Responde STOP para cancelar, HELP para ayuda. Esto es opcional."
                      )}
                    </Text>
                  </Pressable>
                </View>

                <View className="mb-4">
                  <Text className="text-sm font-semibold text-foreground mb-2">{t("auth.signup.password")}</Text>
                  <View className="flex-row items-center">
                    <TextInput
                      value={password}
                      onChangeText={setPassword}
                      placeholder={t("auth.signup.password_placeholder")}
                      placeholderTextColor="#64748B"
                      secureTextEntry={!showPassword}
                      editable={!loading}
                      className="flex-1 px-4 py-3 pr-16 bg-surface border border-border rounded-lg text-foreground"
                    />
                    <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.passwordToggle}>
                      <Text className="text-primary text-sm font-semibold">
                        {showPassword ? t("auth.signin.hide") : t("auth.signin.show")}
                      </Text>
                    </Pressable>
                  </View>

                  {password.length > 0 ? (
                    <View className="mt-2">
                      <View className="flex-row items-center justify-between mb-1">
                        <Text className="text-xs text-muted">{t("auth.signup.password_strength")}</Text>
                        <Text className="text-xs font-semibold" style={{ color: strengthColor }}>
                          {passwordStrength.label}
                        </Text>
                      </View>
                      <View className="h-1.5 bg-surface rounded-full overflow-hidden">
                        <View
                          className="h-1.5 rounded-full"
                          style={{
                            width: `${Math.max(20, passwordStrength.score * 33)}%`,
                            backgroundColor: strengthColor,
                          }}
                        />
                      </View>
                    </View>
                  ) : null}
                </View>

                <View className="mb-6">
                  <Text className="text-sm font-semibold text-foreground mb-2">{t("auth.signup.confirm_password")}</Text>
                  <TextInput
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder={t("auth.signup.confirm_placeholder")}
                    placeholderTextColor="#64748B"
                    secureTextEntry={!showPassword}
                    editable={!loading}
                    className="px-4 py-3 bg-surface border border-border rounded-lg text-foreground"
                  />
                </View>

                <Pressable onPress={() => setAgreeTerms(!agreeTerms)} style={styles.termsRow}>
                  <View className={`w-5 h-5 mt-0.5 mr-2 border rounded ${agreeTerms ? "bg-primary border-primary" : "border-border"}`}>
                    {agreeTerms ? <Text className="text-white text-xs text-center">✓</Text> : null}
                  </View>
                  <Text className="text-sm text-foreground flex-1 leading-5">
                    {t("auth.signup.terms_prefix")}
                    <Text onPress={() => router.push("/legal/terms")} className="text-primary underline">{t("auth.signup.terms_of_service")}</Text>
                    {", "}
                    <Text onPress={() => router.push("/legal/privacy")} className="text-primary underline">{t("auth.signup.privacy_policy")}</Text>
                    {" & "}
                    <Text onPress={() => router.push("/legal/terms")} className="text-primary underline">{t("auth.signup.safety_policy")}</Text>
                    {t("auth.signup.terms_suffix")}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.formBlock}>
                <Text style={styles.pageTitle}>{L("Create your account", "Crea tu cuenta")}</Text>
                <Text style={styles.helperText}>
                  {L(
                    "Create your account, then take a quick photo and finish your profile — that's all that's left before you can use the app.",
                    "Crea tu cuenta, luego toma una foto rápida y completa tu perfil — eso es todo lo que falta antes de poder usar la app."
                  )}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.footer}>
            {step === "email" ? (
              <Pressable onPress={() => setStep("name")} disabled={loading} style={styles.backButton}>
                <Text style={styles.backButtonText}>{L("Back", "Atrás")}</Text>
              </Pressable>
            ) : (
              <Pressable onPress={() => router.push("/auth/signup")} style={styles.backButton}>
                <Text style={styles.backButtonText}>{L("Different role", "Otro rol")}</Text>
              </Pressable>
            )}

            {step === "name" ? (
              <Pressable onPress={handleNext} style={styles.nextButton}>
                <Text style={styles.nextButtonText}>{L("Next", "Siguiente")}</Text>
              </Pressable>
            ) : (
              <PrimaryButton
                title={L("Create account", "Crear cuenta")}
                onPress={handleSendVerification}
                loading={loading}
                disabled={loading}
                fullWidth={false}
              />
            )}
          </View>

          <View style={styles.signInRow}>
            <Text className="text-muted">{t("auth.signup.has_account")}</Text>
            <Pressable onPress={() => router.push("/auth/signin")}>
              <Text className="text-primary font-semibold">{t("auth.signup.sign_in")}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </ScreenContainer>
    </View>
  );
}

function localizeFullNameError(message: string, L: (en: string, es: string) => string): string {
  switch (message) {
    case "Full name is required":
      return L("Full name is required", "Se requiere el nombre completo.");
    case "Please enter your full legal name.":
      return L("Please enter your full legal name.", "Ingresa tu nombre legal completo.");
    case "Please enter your real full name, not your email.":
      return L("Please enter your real full name, not your email.", "Ingresa tu nombre real completo, no tu correo.");
    case "Please enter first and last name.":
      return L("Please enter first and last name.", "Ingresa nombre y apellido.");
    case "Please enter a valid first and last name.":
      return L("Please enter a valid first and last name.", "Ingresa un nombre y apellido válidos.");
    default:
      return message;
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0B1220",
  },
  content: {
    flexGrow: 1,
    paddingBottom: 40,
    justifyContent: "space-between",
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
  formBlock: {
    gap: 2,
  },
  centeredBlock: {
    flex: 1,
    justifyContent: "center",
    minHeight: 320,
  },
  pageTitle: {
    color: "#F8FAFC",
    fontSize: 22,
    fontWeight: "900",
    marginBottom: 8,
  },
  helperText: {
    color: "#94A3B8",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 22,
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
  nextButton: {
    backgroundColor: "#F97316",
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  nextButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },
  passwordToggle: {
    position: "absolute",
    right: 16,
  },
  signInRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: 24,
  },
  termsRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    marginBottom: 16,
  },
  statusRow: {
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 12,
    backgroundColor: "#111827",
    padding: 12,
    marginBottom: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  statusLabel: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "800",
  },
  statusValue: {
    color: "#F97316",
    fontSize: 13,
    fontWeight: "900",
    textAlign: "right",
    flex: 1,
  },
  statusCard: {
    borderRadius: 12,
    backgroundColor: "#052E2B",
    borderWidth: 1,
    borderColor: "#C2410C",
    padding: 14,
    marginBottom: 18,
  },
  statusCardLarge: {
    borderRadius: 14,
    backgroundColor: "#052E2B",
    borderWidth: 1,
    borderColor: "#C2410C",
    padding: 18,
  },
  statusTitle: {
    color: "#A7F3D0",
    fontSize: 15,
    fontWeight: "900",
  },
  statusText: {
    color: "#FFEDD5",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 5,
  },
  identityOptions: {
    gap: 12,
    marginBottom: 18,
  },
  identityOption: {
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 12,
    backgroundColor: "#111827",
    padding: 16,
  },
  identityOptionSelected: {
    borderColor: "#F97316",
    backgroundColor: "#1F2937",
  },
  identityOptionTitle: {
    color: "#F8FAFC",
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 5,
  },
  identityOptionText: {
    color: "#94A3B8",
    fontSize: 13,
    lineHeight: 18,
  },
});
