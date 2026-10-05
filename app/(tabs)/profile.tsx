import { Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useCallback, useEffect, useMemo, useState, type ComponentProps, type ReactNode } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenContainer } from "@/components/screen-container";
import { Avatar } from "@/components/avatar";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAppDrawer } from "@/lib/app-drawer-context";
import { useAuth, useLoadUserData, useClearUserData } from "@/lib/auth-context";
import { useStore } from "@/lib/store";
import { useImagePicker } from "@/hooks/use-image-picker";
import { safePush, safeReplace } from "@/lib/safe-router";
import { resolveAuthSession } from "@/lib/resolve-auth-session";
import { saveProfileAvatar } from "@/lib/profile-avatar";
import { useLocaleContext, useT } from "@/hooks/use-locale";
import { haptic } from "@/lib/haptics";
import { supabaseUserData } from "@/lib/_core/supabase-user-data";
import { supabaseAuth } from "@/lib/_core/supabase-auth";
import { computeMechanicMetrics } from "@/lib/mechanic-metrics";
import { getApiUrl } from "@/lib/api-base-url";

import { RingGauge } from "@/components/RingGauge";

type ProfileTabKey = "profile" | "cards" | "settings";

const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL || "support@wrenchup.app";

export default function ProfileScreen() {
  const t = useT();
  const { locale, region } = useLocaleContext();
  const { user, resetPassword, signOut } = useAuth();
  const loadUserData = useLoadUserData();
  const { state, dispatch } = useStore();
  const { pickFacePhoto } = useImagePicker();
  const { openDrawer } = useAppDrawer();
  const clearUserData = useClearUserData();
  const insets = useSafeAreaInsets();
  const [signingOut, setSigningOut] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  const [activeTab, setActiveTab] = useState<ProfileTabKey>("profile");
  const [editingName, setEditingName] = useState(state.userName);
  const [editingBio, setEditingBio] = useState("");
  const [editingPhone, setEditingPhone] = useState(state.phoneNumber ?? "");
  const [phoneCode, setPhoneCode] = useState("");
  const [phoneCodeSent, setPhoneCodeSent] = useState(false);
  const [phoneVerifiedAt, setPhoneVerifiedAt] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [chatNotificationsEnabled, setChatNotificationsEnabled] = useState(true);
  const [marketingNotificationsEnabled, setMarketingNotificationsEnabled] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingNotificationPrefs, setSavingNotificationPrefs] = useState(false);
  const [phoneBusy, setPhoneBusy] = useState(false);
  const role = user?.role ?? state.role;
  const isEs = locale === "es-MX";
  const L = useCallback((en: string, es: string) => (isEs ? es : en), [isEs]);
  const memberMonths = useMemo(() => {
    const first = [...state.jobs, ...state.mechanicJobs]
      .map((j) => ("createdAt" in j ? j.createdAt : j.receivedAt))
      .filter(Boolean)
      .sort((a, b) => a - b)[0];
    if (!first) return 0;
    const diffMs = Date.now() - first;
    return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30.4)));
  }, [state.jobs, state.mechanicJobs]);

  // The rating shown here is what THIS user received from the other side —
  // a mechanic's average comes from customers' ratings of them
  // (mechanicJobs[].rating), a customer's average comes from mechanics'
  // ratings of them (jobs[].customerRating). Not the ratings this user gave
  // out, which is a different (and previously — for mechanics — hardcoded)
  // number.
  const averageRating = useMemo(() => {
    const ratedValues =
      role === "mechanic"
        ? state.mechanicJobs.map((j) => j.rating).filter((r): r is number => typeof r === "number")
        : state.jobs.map((j) => j.customerRating).filter((r): r is number => typeof r === "number");
    if (ratedValues.length === 0) return null;
    return ratedValues.reduce((sum, r) => sum + r, 0) / ratedValues.length;
  }, [role, state.jobs, state.mechanicJobs]);
  const ratingValue = averageRating != null ? `${averageRating.toFixed(1)} ★` : "—";
  const ratingNumber = averageRating ?? 0;
  const ratingPercentage = useMemo(() => Math.max(0, Math.min(100, (ratingNumber / 5) * 100)), [ratingNumber]);
  const mechanicMetrics = useMemo(() => computeMechanicMetrics(state.mechanicJobs), [state.mechanicJobs]);
  // computeMechanicMetrics defaults an empty history to 100%/0%/100% (a
  // "clean slate" reading) for its own internal math, but that's misleading
  // as a headline number for a mechanic with zero job history — show "—"
  // instead of a fabricated "perfect" score until there's real data.
  const hasMechanicHistory = state.mechanicJobs.length > 0;

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const resolved = await resolveAuthSession(user);
      if (!resolved) return;
      try {
        const profile = await supabaseUserData.getOrCreateProfile(user.id, user.role, resolved.sessionToken);
        if (cancelled) return;
        setEditingName(profile.display_name || profile.full_name || state.userName);
        setEditingBio(profile.bio || "");
        setEditingPhone(formatPhoneNumberDisplay(profile.phone_number || ""));
        setPhoneVerifiedAt(profile.phone_verified_at);
        setChatNotificationsEnabled(profile.chat_notifications_enabled ?? true);
        setMarketingNotificationsEnabled(profile.marketing_notifications_enabled ?? true);
      } catch (err) {
        console.error("[Profile] Could not load editable profile fields:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.role, user, state.userName]);

  const handleToggleNotificationPreference = async (
    field: "chat_notifications_enabled" | "marketing_notifications_enabled",
    nextValue: boolean,
  ) => {
    if (!user?.id) return;
    const previousValue = field === "chat_notifications_enabled" ? chatNotificationsEnabled : marketingNotificationsEnabled;
    if (field === "chat_notifications_enabled") {
      setChatNotificationsEnabled(nextValue);
    } else {
      setMarketingNotificationsEnabled(nextValue);
    }
    setSavingNotificationPrefs(true);
    try {
      const resolved = await resolveAuthSession(user, (err) => {
        Alert.alert(L("Could not save preferences", "No se pudieron guardar las preferencias"), err.message);
      });
      if (!resolved) throw new Error("No active session");
      await supabaseUserData.updateProfile(
        user.id,
        { [field]: nextValue } as Record<string, boolean>,
        resolved.sessionToken,
        user.email
      );
      haptic.success();
    } catch (error) {
      if (field === "chat_notifications_enabled") {
        setChatNotificationsEnabled(previousValue);
      } else {
        setMarketingNotificationsEnabled(previousValue);
      }
      console.error("[Profile] Notification preference save failed:", error);
      haptic.error();
      Alert.alert(
        L("Could not save preferences", "No se pudieron guardar las preferencias"),
        L("Please try again.", "Inténtalo de nuevo."),
      );
    } finally {
      setSavingNotificationPrefs(false);
    }
  };

  const handleAvatarEdit = async () => {
    if (!user?.id) return;
    try {
      // Camera-only — this is the account's required, admin-reviewed profile
      // photo (migration 034). Re-uploading resets it to pending review, so
      // warn the user before they lose their approved status.
      Alert.alert(
        L("Retake profile photo", "Volver a tomar foto de perfil"),
        L(
          "Your new photo will need to be re-approved by an admin before it (and your account) is fully active again.",
          "Tu nueva foto deberá ser aprobada nuevamente por un administrador antes de que tu cuenta esté completamente activa otra vez.",
        ),
        [
          { text: L("Cancel", "Cancelar"), style: "cancel" },
          {
            text: L("Take photo", "Tomar foto"),
            onPress: async () => {
              try {
                const image = await pickFacePhoto();
                if (!image) return;
                const resolved = await resolveAuthSession(user, (err) => {
                  Alert.alert(L("Could not update avatar", "No se pudo actualizar la foto"), err.message);
                });
                if (!resolved) return;

                const publicUrl = await saveProfileAvatar(user.id, image, resolved.sessionToken);
                dispatch({ type: "SET_PHOTO_URL", payload: publicUrl });
                await loadUserData(resolved.sessionToken, user);
                haptic.success();
              } catch (err) {
                console.error("[Profile] Avatar update failed:", err);
                haptic.error();
                const msg = err instanceof Error ? err.message : L("Please try again.", "Inténtalo de nuevo.");
                Alert.alert(L("Could not update avatar", "No se pudo actualizar la foto"), msg);
              }
            },
          },
        ],
      );
    } catch (err) {
      console.error("[Profile] Avatar edit prompt failed:", err);
    }
  };

  const handleSaveProfile = async () => {
    if (!user?.id) return;
    const name = editingName.trim();
    if (!name) {
      haptic.error();
      Alert.alert(L("Name required", "Nombre requerido"), L("Please add a name.", "Agrega un nombre."));
      return;
    }

    setSavingProfile(true);
    try {
      const resolved = await resolveAuthSession(user, (err) => {
        Alert.alert(L("Could not save profile", "No se pudo guardar el perfil"), err.message);
      });
      if (!resolved) return;

      await supabaseUserData.updateProfile(
        user.id,
        {
          display_name: name,
          bio: editingBio.trim() || null,
          phone_number: normalizePhoneNumber(editingPhone) || null,
          phone_verified_at: phoneVerifiedAt,
        },
        resolved.sessionToken,
        user.email
      );
      await loadUserData(resolved.sessionToken, user);
      dispatch({ type: "SET_USER_NAME", payload: name });
      haptic.success();
      Alert.alert(L("Saved", "Guardado"), L("Your profile was updated.", "Tu perfil se actualizó."));
    } catch (err) {
      console.error("[Profile] Save failed:", err);
      haptic.error();
      Alert.alert(L("Could not save profile", "No se pudo guardar el perfil"), L("Please try again.", "Inténtalo de nuevo."));
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSendPhoneCode = async () => {
    const normalizedPhone = normalizePhoneNumber(editingPhone);
    if (!isValidE164Phone(normalizedPhone)) {
      haptic.warning();
      Alert.alert(L("Invalid phone", "Teléfono inválido"), L("Use international format, like +15551234567.", "Usa formato internacional, como +15551234567."));
      return;
    }
    setPhoneBusy(true);
    try {
      await supabaseAuth.requestPhoneOtp(normalizedPhone);
      setPhoneCodeSent(true);
      haptic.success();
      Alert.alert(L("Code sent", "Código enviado"), L("Enter the SMS code to verify your phone.", "Ingresa el código SMS para verificar tu teléfono."));
    } catch (err: any) {
      haptic.error();
      Alert.alert(L("Could not send code", "No se pudo enviar código"), err?.message || L("Please try again.", "Inténtalo de nuevo."));
    } finally {
      setPhoneBusy(false);
    }
  };

  const handleVerifyPhoneCode = async () => {
    if (!user?.id) return;
    const normalizedPhone = normalizePhoneNumber(editingPhone);
    if (!isValidE164Phone(normalizedPhone) || !phoneCode.trim()) {
      haptic.warning();
      Alert.alert(L("Missing code", "Falta código"), L("Enter your phone and SMS code.", "Ingresa tu teléfono y código SMS."));
      return;
    }
    setPhoneBusy(true);
    try {
      await supabaseAuth.verifyPhoneOtp(normalizedPhone, phoneCode.trim());
      const verifiedAt = new Date().toISOString();
      const resolved = await resolveAuthSession(user, (err) => {
        Alert.alert(L("Could not save phone", "No se pudo guardar teléfono"), err.message);
      });
      if (!resolved) return;
      await supabaseUserData.updateProfile(
        user.id,
        { phone_number: normalizedPhone, phone_verified_at: verifiedAt },
        resolved.sessionToken,
        user.email
      );
      setEditingPhone(normalizedPhone);
      setPhoneVerifiedAt(verifiedAt);
      await loadUserData(resolved.sessionToken, user);
      haptic.success();
      Alert.alert(L("Phone verified", "Teléfono verificado"), L("Your phone is now verified.", "Tu teléfono ya está verificado."));
    } catch (err: any) {
      haptic.error();
      Alert.alert(L("Could not verify phone", "No se pudo verificar teléfono"), err?.message || L("Please try again.", "Inténtalo de nuevo."));
    } finally {
      setPhoneBusy(false);
    }
  };

  const handleRequestNameChange = async () => {
    haptic.light();
    const subject = encodeURIComponent(L("Name change request", "Solicitud de cambio de nombre"));
    const body = encodeURIComponent(
      L(
        `Hi WrenchUp team,\n\nPlease update the display name on my account.\n\nCurrent name: ${state.userName}\nAccount email: ${user?.email ?? "—"}\nRequested new name: \n\nThanks!`,
        `Hola equipo de WrenchUp,\n\nPor favor actualicen el nombre visible de mi cuenta.\n\nNombre actual: ${state.userName}\nCorreo de la cuenta: ${user?.email ?? "—"}\nNuevo nombre solicitado: \n\n¡Gracias!`,
      ),
    );
    const mailtoUrl = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
    try {
      const canOpen = await Linking.canOpenURL(mailtoUrl);
      if (!canOpen) throw new Error("No mail client available");
      await Linking.openURL(mailtoUrl);
    } catch (err) {
      console.error("[Profile] Could not open mail client for name change request:", err);
      Alert.alert(
        L("Contact support", "Contactar soporte"),
        L(`Email us at ${SUPPORT_EMAIL} to request a name change.`, `Escríbenos a ${SUPPORT_EMAIL} para solicitar un cambio de nombre.`),
      );
    }
  };

  const handleSignOut = () => {
    haptic.warning();
    Alert.alert(
      L("Log out?", "¿Cerrar sesión?"),
      L("You can sign back in anytime.", "Puedes volver a iniciar sesión cuando quieras."),
      [
        { text: L("Cancel", "Cancelar"), style: "cancel" },
        {
          text: L("Log Out", "Cerrar sesión"),
          style: "destructive",
          onPress: async () => {
            setSigningOut(true);
            try {
              await clearUserData();
              await signOut();
              safeReplace("/auth/signin");
            } catch (err) {
              console.error("[Profile] Sign out failed:", err);
              haptic.error();
              Alert.alert(L("Could not log out", "No se pudo cerrar sesión"), L("Please try again.", "Inténtalo de nuevo."));
            } finally {
              setSigningOut(false);
            }
          },
        },
      ],
    );
  };

  const handleDeleteAccount = () => {
    haptic.warning();
    Alert.alert(
      L("Delete account?", "¿Eliminar cuenta?"),
      L(
        "This permanently deletes your account and all associated data. This cannot be undone.",
        "Esto elimina permanentemente tu cuenta y todos los datos asociados. Esta acción no se puede deshacer.",
      ),
      [
        { text: L("Cancel", "Cancelar"), style: "cancel" },
        {
          text: L("Delete Account", "Eliminar cuenta"),
          style: "destructive",
          onPress: async () => {
            if (!user) return;
            setDeletingAccount(true);
            try {
              const resolved = await resolveAuthSession(user, (err) => {
                Alert.alert(L("Could not delete account", "No se pudo eliminar la cuenta"), err.message);
              });
              if (!resolved) return;
              const res = await fetch(getApiUrl("/api/delete-account"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: user.id, sessionToken: resolved.sessionToken }),
              });
              if (!res.ok) {
                const data = await res.json().catch(() => null);
                throw new Error(data?.error || "Delete failed");
              }
              await clearUserData();
              await signOut();
              safeReplace("/auth/signin");
            } catch (err) {
              console.error("[Profile] Account deletion failed:", err);
              haptic.error();
              Alert.alert(L("Could not delete account", "No se pudo eliminar la cuenta"), L("Please try again.", "Inténtalo de nuevo."));
            } finally {
              setDeletingAccount(false);
            }
          },
        },
      ],
    );
  };

  return (
    <ScreenContainer edges={["left", "right"]}>
      <View style={styles.page}>
        <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
          <Pressable
            hitSlop={12}
            onPress={() => {
              haptic.light();
              openDrawer();
            }}
            style={styles.headerButton}
            accessibilityRole="button"
            accessibilityLabel={L("Open menu", "Abrir menú")}
          >
            <IconSymbol name="line.3.horizontal" size={18} color="#FF6A39" />
          </Pressable>
          <Text style={styles.headerTitle}>{t("tabs.profile")}</Text>
          <View style={styles.headerDot} />
        </View>

        <ScrollView style={styles.scrollArea} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.heroCard}>
            <Pressable onPress={handleAvatarEdit} hitSlop={8} style={styles.avatarWrap}>
              <Avatar name={editingName.trim() || state.userName} size={72} url={state.photoUrl ?? undefined} />
              <View style={styles.avatarBadge}>
                <IconSymbol name="checkmark" size={10} color="#13151B" />
              </View>
            </Pressable>

            <View style={styles.heroCopy}>
              <Text style={styles.heroName}>{editingName.trim() || state.userName}</Text>
              <Text style={styles.heroTagline}>
                {role === "mechanic"
                  ? L("Helping nearby drivers get back on the road.", "Ayudando a conductores cercanos a volver al camino.")
                  : L("Ready whenever your car needs help.", "Listo cuando tu auto necesite ayuda.")}
              </Text>
              <View style={styles.heroPills}>
                <View style={styles.roleBadge}>
                  <IconSymbol name={role === "mechanic" ? "wrench.fill" : "person.fill"} size={12} color="#FF6A39" />
                  <Text style={styles.roleBadgeText}>{role === "mechanic" ? L("Mechanic", "Mecánico") : L("Customer", "Cliente")}</Text>
                </View>
                <View style={styles.ratingBadge}>
                  <IconSymbol name="star.fill" size={11} color="#2FDFC4" />
                  <Text style={styles.ratingBadgeText}>{ratingValue}</Text>
                </View>
              </View>
            </View>

            <View style={styles.gaugeWrap}>
              <RingGauge percentage={ratingPercentage} size={60} strokeWidth={5} color="#FF6A39" label={averageRating != null ? averageRating.toFixed(1) : "—"} />
              <Text style={styles.gaugeCaption}>{L("Rating", "Rating")}</Text>
            </View>
          </View>

          <View style={styles.tabBar}>
            <TabButton label={L("Profile", "Perfil")} active={activeTab === "profile"} onPress={() => setActiveTab("profile")} />
            <TabButton label={L("Cards", "Tarjetas")} active={activeTab === "cards"} onPress={() => setActiveTab("cards")} />
            <TabButton label={L("Settings", "Ajustes")} active={activeTab === "settings"} onPress={() => setActiveTab("settings")} />
          </View>

          {activeTab === "profile" ? (
            <>
              <Section title={L("Performance", "Rendimiento")}>
                <View style={styles.metricGrid}>
                  <MetricCard
                    icon="star.fill"
                    label={L("Acceptance", "Aceptación")}
                    value={hasMechanicHistory ? `${mechanicMetrics.acceptanceRate}%` : "—"}
                    percentage={hasMechanicHistory ? mechanicMetrics.acceptanceRate : 0}
                    accent="#FF6A39"
                    valueColor="#F6F5F2"
                  />
                  <MetricCard
                    icon="xmark"
                    label={L("Cancellation", "Cancelación")}
                    value={hasMechanicHistory ? `${mechanicMetrics.cancellationRate}%` : "—"}
                    percentage={hasMechanicHistory ? mechanicMetrics.cancellationRate : 0}
                    accent="#FF5C5C"
                    valueColor="#FF5C5C"
                  />
                  <MetricCard
                    icon="checkmark"
                    label={L("Completion", "Finalización")}
                    value={hasMechanicHistory ? `${mechanicMetrics.completionRate}%` : "—"}
                    percentage={hasMechanicHistory ? mechanicMetrics.completionRate : 0}
                    accent="#2FDFC4"
                    valueColor="#2FDFC4"
                  />
                  <View style={styles.memberCard}>
                    <View style={styles.memberHeader}>
                      <View style={styles.memberIconWrap}>
                        <IconSymbol name="clock.fill" size={16} color="#FF6A39" />
                      </View>
                      <View style={styles.memberCopy}>
                        <Text style={styles.memberLabel}>{L("Member for", "Miembro por")}</Text>
                        <Text style={styles.memberValue}>{`${memberMonths} ${L("month", "mes")}${memberMonths === 1 ? "" : L("s", "es")}`}</Text>
                      </View>
                    </View>
                    <View style={styles.memberPill}>
                      <Text style={styles.memberPillText}>{memberMonths === 0 ? L("New Mechanic", "Nuevo mecánico") : L("Active", "Activo")}</Text>
                    </View>
                  </View>
                </View>
              </Section>

              <Section title={L("Account", "Cuenta")}>
                <View style={styles.panel}>
                  <InfoRow icon="mail" label={L("Email", "Correo")} value={user?.email ?? "—"} />
                  <InfoRow icon="person.fill" label={L("Name", "Nombre")} value={state.userName} />
                  <InfoRow
                    icon="phone.fill"
                    label={L("Phone", "Teléfono")}
                    valueNode={
                      <View style={styles.inlineStatusWrap}>
                        <Text style={styles.inlineValue} numberOfLines={1} ellipsizeMode="tail">
                          {editingPhone || "—"}
                        </Text>
                        <Text style={[styles.inlinePill, phoneVerifiedAt ? styles.inlinePillOn : styles.inlinePillOff]}>
                          {phoneVerifiedAt ? L("Verified", "Verificado") : L("Unverified", "Sin verificar")}
                        </Text>
                      </View>
                    }
                  />
                  <InfoRow
                    icon="lock.fill"
                    label={L("Change Password", "Cambiar contraseña")}
                    onPress={async () => {
                      if (!user?.email) return;
                      try {
                        await resetPassword(user.email);
                        haptic.success();
                        Alert.alert(L("Password reset", "Restablecer contraseña"), L("Check your email for the reset link.", "Revisa tu correo para el enlace."));
                      } catch (err) {
                        console.error("[Profile] Reset password failed:", err);
                        haptic.error();
                        Alert.alert(L("Could not reset password", "No se pudo restablecer contraseña"), L("Please try again.", "Inténtalo de nuevo."));
                      }
                    }}
                    chevron
                  />
                </View>
              </Section>

              <Section title={L("Edit Profile", "Editar perfil")}>
                <View style={styles.panel}>
                  <Field label={L("Display Name", "Nombre visible")}>
                    <View style={[styles.inputShell, styles.inputShellDisabled]}>
                      <IconSymbol name="lock.fill" size={15} color="#5C5F6E" />
                      <TextInput
                        value={editingName}
                        editable={false}
                        selectTextOnFocus={false}
                        style={styles.inputField}
                        placeholder={L("Your name", "Tu nombre")}
                        placeholderTextColor="#5C5F6E"
                      />
                    </View>
                    <Pressable onPress={handleRequestNameChange} hitSlop={6}>
                      <Text style={styles.helperLinkText}>
                        {L("Name changes require support — tap to request one", "Los cambios de nombre requieren soporte — toca para solicitarlo")}
                      </Text>
                    </Pressable>
                  </Field>

                  <Field label={L("Phone Number", "Número de teléfono")}>
                    <View style={styles.phoneRow}>
                      <View style={styles.countryChip}>
                        <Text style={styles.countryChipText}>+1</Text>
                      </View>
                      <View style={[styles.inputShell, styles.phoneInputShell, focusedField === "phone" && styles.inputShellFocused]}>
                        <IconSymbol name="phone.fill" size={15} color="#5C5F6E" />
                        <TextInput
                          value={editingPhone}
                          onChangeText={(value) => {
                            setEditingPhone(formatPhoneNumberDisplay(value));
                            setPhoneVerifiedAt(null);
                          }}
                          onFocus={() => setFocusedField("phone")}
                          onBlur={() => setFocusedField(null)}
                          style={styles.inputField}
                          keyboardType="phone-pad"
                          placeholder="###-###-####"
                          maxLength={12}
                          placeholderTextColor="#5C5F6E"
                        />
                      </View>
                    </View>
                    <Pressable onPress={handleSendPhoneCode} style={styles.secondaryButton} disabled={phoneBusy || !!phoneVerifiedAt}>
                      <IconSymbol name="paperplane.fill" size={13} color="#FF6A39" />
                      <Text style={styles.secondaryButtonText}>
                        {phoneVerifiedAt ? L("Verified", "Verificado") : phoneCodeSent ? L("Resend Code", "Reenviar código") : L("Send Code", "Enviar código")}
                      </Text>
                    </Pressable>
                    {phoneCodeSent && !phoneVerifiedAt ? (
                      <>
                        <View style={[styles.inputShell, focusedField === "code" && styles.inputShellFocused]}>
                          <IconSymbol name="checkmark" size={15} color="#5C5F6E" />
                          <TextInput
                            value={phoneCode}
                            onChangeText={setPhoneCode}
                            onFocus={() => setFocusedField("code")}
                            onBlur={() => setFocusedField(null)}
                            style={styles.inputField}
                            keyboardType="number-pad"
                            placeholder={L("SMS code", "Código SMS")}
                            placeholderTextColor="#5C5F6E"
                          />
                        </View>
                        <Pressable onPress={handleVerifyPhoneCode} style={styles.secondaryButton} disabled={phoneBusy}>
                          <IconSymbol name="checkmark.circle.fill" size={13} color="#2FDFC4" />
                          <Text style={styles.secondaryButtonText}>{phoneBusy ? L("Working...", "Procesando...") : L("Verify Phone", "Verificar teléfono")}</Text>
                        </Pressable>
                      </>
                    ) : null}
                  </Field>

                  <Field label={L("Bio", "Biografía")}>
                    <View style={[styles.inputShell, styles.textAreaShell, focusedField === "bio" && styles.inputShellFocused]}>
                      <IconSymbol name="doc.text.fill" size={15} color="#5C5F6E" />
                      <TextInput
                        value={editingBio}
                        onChangeText={setEditingBio}
                        onFocus={() => setFocusedField("bio")}
                        onBlur={() => setFocusedField(null)}
                        style={[styles.inputField, styles.textAreaField]}
                        multiline
                        placeholder={
                          role === "mechanic"
                            ? L("Tell customers about your experience", "Cuéntale a clientes tu experiencia")
                            : L("A short profile bio", "Biografía corta")
                        }
                        placeholderTextColor="#5C5F6E"
                      />
                    </View>
                  </Field>

                  <Pressable onPress={handleSaveProfile} style={[styles.saveButton, savingProfile && styles.saveButtonDisabled]} disabled={savingProfile}>
                    <IconSymbol name="wrench.fill" size={17} color="#FFFFFF" />
                    <Text style={styles.saveButtonText}>{savingProfile ? L("Saving...", "Guardando...") : L("Save Profile", "Guardar perfil")}</Text>
                  </Pressable>
                </View>
              </Section>
            </>
          ) : null}

          {activeTab === "cards" ? (
            <Section title={L("Payment Cards", "Tarjetas de pago")}>
              <View style={styles.panel}>
                {state.paymentMethods.length === 0 ? (
                  <Text style={styles.emptyText}>{L("No cards saved yet.", "Aún no hay tarjetas guardadas.")}</Text>
                ) : (
                  <View style={styles.cardList}>
                    {state.paymentMethods.map((pm) => {
                      const isDefault = state.defaultPaymentMethodId === pm.id;
                      return (
                        <View key={pm.id} style={styles.cardRow}>
                          <View style={styles.cardMetaWrap}>
                            <View style={styles.cardIconWrap}>
                              <IconSymbol name="creditcard.fill" size={15} color="#FF6A39" />
                            </View>
                            <View>
                              <Text style={styles.cardTitle}>
                                {pm.card.brand.toUpperCase()} •••• {pm.card.last4}
                              </Text>
                              <Text style={styles.cardMeta}>
                                {L("Expires", "Vence")} {pm.card.expMonth}/{pm.card.expYear}
                              </Text>
                            </View>
                          </View>
                          <View style={styles.cardActions}>
                            <Pressable
                              onPress={() => dispatch({ type: "SET_DEFAULT_PAYMENT_METHOD", payload: pm.id })}
                              style={[styles.defaultPill, isDefault && styles.defaultPillOn]}
                            >
                              <Text style={[styles.defaultPillText, isDefault && styles.defaultPillTextOn]}>
                                {isDefault ? L("Default", "Predeterminada") : L("Set Default", "Predeterminada")}
                              </Text>
                            </Pressable>
                            <Pressable onPress={() => dispatch({ type: "DELETE_PAYMENT_METHOD", payload: pm.id })} style={styles.deleteBtn}>
                              <IconSymbol name="trash.fill" size={14} color="#B91C1C" />
                            </Pressable>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
                <Pressable onPress={() => safePush("/payment-methods")} style={styles.primaryButton}>
                  <IconSymbol name="creditcard.fill" size={16} color="#FFFFFF" />
                  <Text style={styles.primaryButtonText}>{L("Manage Cards", "Administrar tarjetas")}</Text>
                </Pressable>
              </View>
            </Section>
          ) : null}

          {activeTab === "settings" ? (
            <>
              <Section title={L("Account", "Cuenta")}>
                <View style={styles.menuCard}>
                  <MenuRow
                    icon="car.fill"
                    title={L("Vehicles", "Vehículos")}
                    subtitle={L("Manage your vehicles", "Administra tus vehículos")}
                    onPress={() => safePush("/vehicles")}
                  />
                  <MenuRow
                    icon="doc.text.fill"
                    title={L("Documents", "Documentos")}
                    subtitle={L("Verification and requirements", "Verificación y requisitos")}
                    onPress={() => safePush("/requirements")}
                  />
                  {role !== "mechanic" ? (
                    <MenuRow
                      icon="doc.text.fill"
                      title={L("Receipts", "Recibos")}
                      subtitle={L("Past services requested", "Servicios solicitados anteriormente")}
                      onPress={() => safePush("/activity")}
                    />
                  ) : null}
                  <MenuRow
                    icon="lock.fill"
                    title={L("Change Password", "Cambiar contraseña")}
                    subtitle={L("Send a reset link to email", "Enviar enlace de recuperación")}
                    onPress={async () => {
                      if (!user?.email) return;
                      try {
                        await resetPassword(user.email);
                        haptic.success();
                        Alert.alert(L("Password reset", "Restablecer contraseña"), L("Check your email for the reset link.", "Revisa tu correo para el enlace."));
                      } catch (err) {
                        console.error("[Profile] Reset password failed:", err);
                        haptic.error();
                        Alert.alert(L("Could not reset password", "No se pudo restablecer contraseña"), L("Please try again.", "Inténtalo de nuevo."));
                      }
                    }}
                  />
                  <MenuRow
                    icon="info.circle.fill"
                    title={L("About", "Acerca de")}
                    subtitle={L("Policies and legal info", "Políticas e información legal")}
                    onPress={() => safePush("/legal/privacy")}
                    showDivider={false}
                  />
                </View>
              </Section>

              <Section title={L("Region", "Región")}>
                <View style={styles.toggleCard}>
                  <Text style={styles.regionDescription}>
                    {L(
                      "Sets pricing currency and which mechanics you're matched with. Detected automatically, but you can override it here.",
                      "Define la moneda y con qué mecánicos te emparejan. Se detecta automáticamente, pero puedes cambiarlo aquí.",
                    )}
                  </Text>
                  <View style={styles.regionPickerRow}>
                    {(["US", "MX"] as const).map((code) => {
                      const active = region === code;
                      return (
                        <Pressable
                          key={code}
                          onPress={() => {
                            if (active) return;
                            haptic.selection();
                            dispatch({ type: "SET_REGION_PREFERENCE", payload: code });
                          }}
                          style={[styles.regionPill, active && styles.regionPillActive]}
                        >
                          <Text style={[styles.regionPillText, active && styles.regionPillTextActive]}>
                            {code === "US" ? L("United States", "Estados Unidos") : L("Mexico", "México")}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  {state.regionPreference !== "auto" ? (
                    <Pressable
                      onPress={() => {
                        haptic.selection();
                        dispatch({ type: "SET_REGION_PREFERENCE", payload: "auto" });
                      }}
                      hitSlop={8}
                    >
                      <Text style={styles.regionAutoLink}>{L("Use automatic detection", "Usar detección automática")}</Text>
                    </Pressable>
                  ) : null}
                </View>
              </Section>

              <Section title={L("Notification Preferences", "Preferencias de notificación")}>
                <View style={styles.toggleCard}>
                  <ToggleRow
                    title={L("Chat notifications", "Notificaciones de chat")}
                    description={L("Mute direct message alerts.", "Silencia las alertas de mensajes directos.")}
                    value={chatNotificationsEnabled}
                    onValueChange={(value) => void handleToggleNotificationPreference("chat_notifications_enabled", value)}
                    disabled={savingNotificationPrefs}
                  />
                  <View style={styles.toggleDivider} />
                  <ToggleRow
                    title={L("Marketing notifications", "Notificaciones de marketing")}
                    description={L("Mute promos, offers, and announcements.", "Silencia promociones, ofertas y anuncios.")}
                    value={marketingNotificationsEnabled}
                    onValueChange={(value) => void handleToggleNotificationPreference("marketing_notifications_enabled", value)}
                    disabled={savingNotificationPrefs}
                  />
                </View>
              </Section>

              <Pressable
                onPress={handleSignOut}
                disabled={signingOut}
                style={[styles.signOutButton, signingOut && styles.signOutButtonDisabled]}
              >
                <IconSymbol name="rectangle.portrait.and.arrow.right" size={16} color="#FF5C5C" />
                <Text style={styles.signOutButtonText}>
                  {signingOut ? L("Logging out...", "Cerrando sesión...") : L("Log Out", "Cerrar sesión")}
                </Text>
              </Pressable>

              <Pressable onPress={handleDeleteAccount} disabled={deletingAccount} hitSlop={8} style={styles.deleteAccountLink}>
                <Text style={styles.deleteAccountLinkText}>
                  {deletingAccount ? L("Deleting...", "Eliminando...") : L("Delete account", "Eliminar cuenta")}
                </Text>
              </Pressable>

              <View style={styles.legalFooter}>
                <Pressable onPress={() => safePush("/legal/terms")} hitSlop={8}>
                  <Text style={styles.legalLink}>{L("Terms of Service", "Términos de servicio")}</Text>
                </Pressable>
                <Text style={styles.legalSeparator}>•</Text>
                <Pressable onPress={() => safePush("/legal/privacy")} hitSlop={8}>
                  <Text style={styles.legalLink}>{L("Privacy Policy", "Política de privacidad")}</Text>
                </Pressable>
              </View>
            </>
          ) : null}
        </ScrollView>
      </View>
    </ScreenContainer>
  );
}

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.tabBtn, active && styles.tabBtnOn]}>
      <Text style={[styles.tabBtnText, active && styles.tabBtnTextOn]}>{label}</Text>
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function MetricCard({
  icon,
  label,
  value,
  percentage,
  accent,
  valueColor,
}: {
  icon: ComponentProps<typeof IconSymbol>["name"];
  label: string;
  value: string;
  percentage: number;
  accent: string;
  valueColor: string;
}) {
  return (
    <View style={styles.metricCard}>
      <RingGauge percentage={percentage} size={44} strokeWidth={4.5} color={accent} label={value} labelClassName="text-[10px] text-wrench-text" />
      <View style={styles.metricTextWrap}>
        <View style={styles.metricIconWrap}>
          <IconSymbol name={icon} size={14} color={accent} />
        </View>
        <Text style={styles.metricLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
          {label}
        </Text>
        <Text style={[styles.metricValue, { color: valueColor }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function InfoRow({
  icon,
  label,
  value,
  valueNode,
  onPress,
  chevron = false,
}: {
  icon: ComponentProps<typeof IconSymbol>["name"];
  label: string;
  value?: string;
  valueNode?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
}) {
  const row = (
    <>
      <View style={styles.infoLeft}>
        <View style={styles.infoIconWrap}>
          <IconSymbol name={icon} size={16} color="#FF6A39" />
        </View>
        <Text style={styles.infoLabel} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <View style={styles.infoRight}>
        {valueNode ?? (
          <Text style={styles.infoValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} ellipsizeMode="tail">
            {value}
          </Text>
        )}
        {chevron ? <IconSymbol name="chevron.right" size={16} color="#5C5F6E" /> : null}
      </View>
    </>
  );

  if (onPress) {
  return (
    <Pressable onPress={onPress} style={styles.infoRow}>
      {row}
    </Pressable>
  );
}

  return <View style={styles.infoRow}>{row}</View>;
}

function MenuRow({
  icon,
  title,
  subtitle,
  onPress,
  showDivider = true,
}: {
  icon: ComponentProps<typeof IconSymbol>["name"];
  title: string;
  subtitle: string;
  onPress: () => void;
  showDivider?: boolean;
}) {
  return (
    <>
      <Pressable onPress={onPress} style={styles.menuRow}>
        <View style={styles.menuIconWrap}>
          <IconSymbol name={icon} size={18} color="#FF6A39" />
        </View>
        <View style={styles.menuTextWrap}>
          <Text style={styles.menuTitle}>{title}</Text>
          <Text style={styles.menuSubtitle}>{subtitle}</Text>
        </View>
        <IconSymbol name="chevron.right" size={18} color="#5C5F6E" />
      </Pressable>
      {showDivider ? <View style={styles.menuDivider} /> : null}
    </>
  );
}

function ToggleRow({
  title,
  description,
  value,
  onValueChange,
  disabled,
}: {
  title: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleTextWrap}>
        <Text style={styles.toggleTitle}>{title}</Text>
        <Text style={styles.toggleDesc}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: "#334155", true: "#FF6A39" }}
        thumbColor={value ? "#FFFFFF" : "#E2E8F0"}
        disabled={disabled}
      />
    </View>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function normalizePhoneNumber(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  const trimmed = value.trim();
  return /^\+\d{8,15}$/.test(trimmed) ? trimmed : "";
}

function formatPhoneNumberDisplay(value: string): string {
  const digits = value.replace(/\D/g, "");
  const local = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits.slice(0, 10);
  if (local.length <= 3) return local;
  if (local.length <= 6) return `${local.slice(0, 3)}-${local.slice(3)}`;
  return `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}`;
}

function isValidE164Phone(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value);
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#13151B",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
    gap: 12,
  },
  headerButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#242836",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    color: "#F6F5F2",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  headerDot: {
    marginLeft: "auto",
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: "#2FDFC4",
  },
  scrollArea: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 20,
    gap: 18,
  },
  heroCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#1C1F29",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 22,
    padding: 16,
  },
  avatarWrap: {
    width: 80,
    height: 80,
    borderRadius: 999,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarBadge: {
    position: "absolute",
    right: 2,
    bottom: 2,
    width: 20,
    height: 20,
    borderRadius: 999,
    backgroundColor: "#2FDFC4",
    borderWidth: 3,
    borderColor: "#1C1F29",
    alignItems: "center",
    justifyContent: "center",
  },
  heroCopy: {
    flex: 1,
    gap: 6,
  },
  heroName: {
    color: "#F6F5F2",
    fontSize: 22,
    fontWeight: "800",
  },
  heroTagline: {
    color: "#8C8FA0",
    fontSize: 13,
    lineHeight: 18,
  },
  heroPills: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 2,
  },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,106,57,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,106,57,0.28)",
  },
  roleBadgeText: {
    color: "#FF6A39",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  ratingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#242836",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  ratingBadgeText: {
    color: "#F6F5F2",
    fontSize: 11,
    fontWeight: "800",
  },
  gaugeWrap: {
    width: 72,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  gaugeCaption: {
    color: "#5C5F6E",
    fontSize: 9.5,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  tabBar: {
    flexDirection: "row",
    gap: 8,
    padding: 5,
    backgroundColor: "#1C1F29",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  tabBtn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  tabBtnOn: {
    backgroundColor: "#FF6A39",
  },
  tabBtnText: {
    color: "#8C8FA0",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  tabBtnTextOn: {
    color: "#FFFFFF",
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    color: "#5C5F6E",
    fontSize: 11.5,
    fontWeight: "800",
    letterSpacing: 1.8,
    textTransform: "uppercase",
  },
  sectionBody: {
    backgroundColor: "#1C1F29",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 22,
    overflow: "hidden",
    padding: 14,
    gap: 12,
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  metricCard: {
    width: "48%",
    minHeight: 108,
    padding: 12,
    borderRadius: 18,
    backgroundColor: "#242836",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  metricTextWrap: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  metricIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: "#13151B",
    alignItems: "center",
    justifyContent: "center",
  },
  metricLabel: {
    color: "#8C8FA0",
    fontSize: 9.25,
    lineHeight: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  metricValue: {
    fontSize: 15,
    fontWeight: "800",
  },
  memberCard: {
    width: "48%",
    minHeight: 108,
    padding: 12,
    borderRadius: 18,
    backgroundColor: "#242836",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    gap: 10,
  },
  memberHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  memberIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: "#13151B",
    alignItems: "center",
    justifyContent: "center",
  },
  memberCopy: {
    gap: 2,
    flex: 1,
    minWidth: 0,
  },
  memberLabel: {
    color: "#8C8FA0",
    fontSize: 10.5,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  memberValue: {
    color: "#F6F5F2",
    fontSize: 17,
    fontWeight: "800",
  },
  memberPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(47,223,196,0.12)",
    borderWidth: 1,
    borderColor: "rgba(47,223,196,0.28)",
  },
  memberPillText: {
    color: "#2FDFC4",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  panel: {
    gap: 12,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 1,
  },
  infoLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  infoIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: "#13151B",
    alignItems: "center",
    justifyContent: "center",
  },
  infoLabel: {
    color: "#F6F5F2",
    fontSize: 12.5,
    fontWeight: "700",
    flexShrink: 1,
  },
  infoRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginLeft: 10,
    flex: 1,
    justifyContent: "flex-end",
    minWidth: 0,
  },
  infoValue: {
    color: "#8C8FA0",
    fontSize: 11.5,
    fontWeight: "600",
    textAlign: "right",
    flexShrink: 1,
    minWidth: 0,
  },
  inlineStatusWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    justifyContent: "flex-end",
    minWidth: 0,
  },
  inlineValue: {
    color: "#8C8FA0",
    fontSize: 11.5,
    fontWeight: "600",
    textAlign: "right",
    flexShrink: 1,
    minWidth: 0,
  },
  inlinePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  inlinePillOn: {
    color: "#2FDFC4",
    backgroundColor: "rgba(47,223,196,0.12)",
    borderWidth: 1,
    borderColor: "rgba(47,223,196,0.28)",
  },
  inlinePillOff: {
    color: "#FF6A39",
    backgroundColor: "rgba(255,106,57,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,106,57,0.28)",
  },
  fieldBlock: {
    gap: 8,
  },
  fieldLabel: {
    color: "#8C8FA0",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  helperText: {
    color: "#8C8FA0",
    fontSize: 11,
    lineHeight: 16,
    marginTop: -2,
  },
  helperLinkText: {
    color: "#2FDFC4",
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 16,
    marginTop: -2,
    textDecorationLine: "underline",
  },
  inputShell: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: "#242836",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  inputShellFocused: {
    borderColor: "#FF6A39",
  },
  inputShellDisabled: {
    opacity: 0.82,
  },
  inputField: {
    flex: 1,
    color: "#F6F5F2",
    fontSize: 14.5,
    fontWeight: "600",
    paddingVertical: 0,
  },
  phoneRow: {
    flexDirection: "row",
    gap: 10,
  },
  countryChip: {
    width: 56,
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: "#242836",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  countryChipText: {
    color: "#8C8FA0",
    fontSize: 14,
    fontWeight: "800",
  },
  phoneInputShell: {
    flex: 1,
  },
  textAreaShell: {
    minHeight: 96,
    alignItems: "flex-start",
    paddingTop: 14,
  },
  textAreaField: {
    minHeight: 64,
    textAlignVertical: "top",
    lineHeight: 20,
  },
  secondaryButton: {
    marginTop: 2,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: "#242836",
    borderWidth: 1,
    borderColor: "rgba(255,106,57,0.35)",
  },
  secondaryButtonText: {
    color: "#FF6A39",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  saveButton: {
    marginTop: 4,
    borderRadius: 18,
    minHeight: 54,
    backgroundColor: "#FF6A39",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  saveButtonDisabled: {
    opacity: 0.78,
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  emptyText: {
    color: "#8C8FA0",
    fontSize: 14,
  },
  cardList: {
    gap: 10,
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 4,
  },
  cardMetaWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  cardIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#13151B",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    color: "#F6F5F2",
    fontSize: 14,
    fontWeight: "800",
  },
  cardMeta: {
    color: "#8C8FA0",
    fontSize: 12,
    marginTop: 2,
  },
  cardActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  defaultPill: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "#13151B",
  },
  defaultPillOn: {
    borderColor: "rgba(255,106,57,0.35)",
    backgroundColor: "rgba(255,106,57,0.12)",
  },
  defaultPillText: {
    color: "#8C8FA0",
    fontSize: 11,
    fontWeight: "800",
  },
  defaultPillTextOn: {
    color: "#FF6A39",
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,92,92,0.1)",
  },
  primaryButton: {
    marginTop: 4,
    borderRadius: 18,
    minHeight: 54,
    backgroundColor: "#FF6A39",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  menuCard: {
    backgroundColor: "#242836",
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  menuIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#13151B",
    alignItems: "center",
    justifyContent: "center",
  },
  menuTextWrap: {
    flex: 1,
    gap: 3,
  },
  menuTitle: {
    color: "#F6F5F2",
    fontSize: 14,
    fontWeight: "800",
  },
  menuSubtitle: {
    color: "#8C8FA0",
    fontSize: 12,
    lineHeight: 17,
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginLeft: 62,
  },
  toggleCard: {
    backgroundColor: "#242836",
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  toggleTextWrap: {
    flex: 1,
    gap: 4,
  },
  toggleTitle: {
    color: "#F6F5F2",
    fontSize: 14,
    fontWeight: "800",
  },
  toggleDesc: {
    color: "#8C8FA0",
    fontSize: 12,
    lineHeight: 17,
  },
  toggleDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginLeft: 14,
  },
  regionDescription: {
    color: "#8C8FA0",
    fontSize: 12,
    lineHeight: 17,
    padding: 14,
    paddingBottom: 0,
  },
  regionPickerRow: {
    flexDirection: "row",
    gap: 10,
    padding: 14,
  },
  regionPill: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "#1B1E29",
  },
  regionPillActive: {
    borderColor: "#F97316",
    backgroundColor: "rgba(249,115,22,0.14)",
  },
  regionPillText: {
    color: "#8C8FA0",
    fontSize: 13,
    fontWeight: "700",
  },
  regionPillTextActive: {
    color: "#FDBA74",
  },
  regionAutoLink: {
    color: "#F97316",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
    paddingBottom: 14,
  },
  signOutButton: {
    marginTop: 4,
    borderRadius: 18,
    minHeight: 54,
    backgroundColor: "rgba(255,92,92,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,92,92,0.3)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  signOutButtonDisabled: {
    opacity: 0.7,
  },
  signOutButtonText: {
    color: "#FF5C5C",
    fontSize: 15,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  deleteAccountLink: {
    marginTop: 14,
    alignItems: "center",
  },
  deleteAccountLinkText: {
    color: "rgba(255,92,92,0.7)",
    fontSize: 13,
    fontWeight: "700",
  },
  legalFooter: {
    marginTop: 6,
    marginBottom: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  legalLink: {
    color: "#2FDFC4",
    fontSize: 13,
    fontWeight: "800",
  },
  legalSeparator: {
    color: "#2FDFC4",
    fontSize: 13,
    fontWeight: "800",
  },
});
