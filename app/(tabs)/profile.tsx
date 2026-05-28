import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { ScreenMenuHeader } from "@/components/screen-menu-header";
import { Avatar } from "@/components/avatar";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAuth, useLoadUserData } from "@/lib/auth-context";
import { useStore } from "@/lib/store";
import { useImagePicker } from "@/hooks/use-image-picker";
import { resolveAuthSession } from "@/lib/resolve-auth-session";
import { saveProfileAvatar } from "@/lib/profile-avatar";
import { useLocaleContext, useT } from "@/hooks/use-locale";
import { haptic } from "@/lib/haptics";
import { supabaseUserData } from "@/lib/_core/supabase-user-data";
import { computeMechanicMetrics } from "@/lib/mechanic-metrics";

type ProfileTabKey = "profile" | "cards" | "settings";

export default function ProfileScreen() {
  const router = useRouter();
  const t = useT();
  const { locale } = useLocaleContext();
  const { user, resetPassword } = useAuth();
  const loadUserData = useLoadUserData();
  const { state, dispatch } = useStore();
  const { pickProfileImage } = useImagePicker();

  const [activeTab, setActiveTab] = useState<ProfileTabKey>("profile");
  const [editingName, setEditingName] = useState(state.userName);
  const [editingBio, setEditingBio] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const role = user?.role ?? state.role;
  const isEs = locale === "es-MX";
  const L = (en: string, es: string) => (isEs ? es : en);
  const memberMonths = useMemo(() => {
    const first = [...state.jobs, ...state.mechanicJobs]
      .map((j) => ("createdAt" in j ? j.createdAt : j.receivedAt))
      .filter(Boolean)
      .sort((a, b) => a - b)[0];
    if (!first) return 0;
    const diffMs = Date.now() - first;
    return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30.4)));
  }, [state.jobs, state.mechanicJobs]);

  const ratingValue = useMemo(() => {
    if (role === "mechanic") return "4.9 ★";
    const ratedJobs = state.jobs.filter((j) => typeof j.rating === "number");
    if (ratedJobs.length === 0) return L("No ratings yet", "Sin calificaciones");
    const average = ratedJobs.reduce((sum, j) => sum + (j.rating ?? 0), 0) / ratedJobs.length;
    return `${average.toFixed(1)} ★`;
  }, [role, state.jobs, locale]);
  const mechanicMetrics = useMemo(() => computeMechanicMetrics(state.mechanicJobs), [state.mechanicJobs]);

  const handleAvatarEdit = async () => {
    if (!user?.id) return;
    try {
      const image = await pickProfileImage();
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
        { full_name: name, bio: editingBio.trim() || null },
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

  return (
    <ScreenContainer edges={["left", "right", "bottom"]}>
      <ScreenMenuHeader title={t("tabs.profile")} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable onPress={handleAvatarEdit} hitSlop={8}>
            <Avatar name={state.userName} size={92} url={state.photoUrl ?? undefined} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{state.userName}</Text>
            <View style={styles.roleChip}>
              <Text style={styles.roleChipText}>
                {role === "mechanic" ? L("Mechanic", "Mecánico") : L("Customer", "Cliente")}
              </Text>
            </View>
            <Text style={styles.tagline}>
              {role === "mechanic"
                ? L("Helping nearby drivers get back on the road.", "Ayudando a conductores cercanos a volver al camino.")
                : L("Ready whenever your car needs help.", "Listo cuando tu auto necesite ayuda.")}
            </Text>
          </View>
        </View>

        <View style={styles.tabBar}>
          <TabButton label={L("Profile", "Perfil")} active={activeTab === "profile"} onPress={() => setActiveTab("profile")} />
          <TabButton label={L("Cards", "Tarjetas")} active={activeTab === "cards"} onPress={() => setActiveTab("cards")} />
          <TabButton label={L("Settings", "Ajustes")} active={activeTab === "settings"} onPress={() => setActiveTab("settings")} />
        </View>

        {activeTab === "profile" ? (
          <Section title={L("Profile", "Perfil")}>
            <StatRow label={L("Ratings", "Calificación")} value={ratingValue} />
            <StatRow label={L("Member for", "Miembro por")} value={`${memberMonths} ${L("month", "mes")}${memberMonths === 1 ? "" : L("s", "es")}`} />
            {role === "mechanic" ? (
              <>
                <StatRow label={L("Acceptance Rate", "Tasa de aceptación")} value={`${mechanicMetrics.acceptanceRate}%`} />
                <StatRow label={L("Cancellation Rate", "Tasa de cancelación")} value={`${mechanicMetrics.cancellationRate}%`} />
                <StatRow label={L("Completion Rate", "Tasa de finalización")} value={`${mechanicMetrics.completionRate}%`} />
              </>
            ) : null}
            <View style={styles.rowBtn}>
              <Text style={styles.rowBtnText}>{L("Email", "Correo")}</Text>
              <Text style={styles.readonlyValue}>{user?.email ?? "—"}</Text>
            </View>
            <View style={styles.rowBtn}>
              <Text style={styles.rowBtnText}>{L("Name", "Nombre")}</Text>
              <Text style={styles.readonlyValue}>{state.userName}</Text>
            </View>
            <Pressable
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
              style={styles.rowBtn}
            >
              <Text style={styles.rowBtnText}>{L("Change Password", "Cambiar contraseña")}</Text>
              <IconSymbol name="chevron.right" size={16} color="#64748B" />
            </Pressable>
            <View style={styles.formArea}>
              <Text style={styles.label}>{L("Display Name", "Nombre visible")}</Text>
              <TextInput
                value={editingName}
                onChangeText={setEditingName}
                style={styles.input}
                placeholder={L("Your name", "Tu nombre")}
                placeholderTextColor="#94A3B8"
              />
              <Text style={styles.label}>{L("Bio", "Biografía")}</Text>
              <TextInput
                value={editingBio}
                onChangeText={setEditingBio}
                style={[styles.input, styles.inputBio]}
                multiline
                placeholder={role === "mechanic" ? L("Tell customers about your experience", "Cuéntale a clientes tu experiencia") : L("A short profile bio", "Biografía corta")}
                placeholderTextColor="#94A3B8"
              />
              <Pressable onPress={handleSaveProfile} style={styles.primaryRowBtn} disabled={savingProfile}>
                <Text style={styles.primaryRowBtnText}>{savingProfile ? L("Saving...", "Guardando...") : L("Save Profile", "Guardar perfil")}</Text>
              </Pressable>
            </View>
          </Section>
        ) : null}

        {activeTab === "cards" ? (
          <Section title={L("Payment Cards", "Tarjetas de pago")}>
            {state.paymentMethods.length === 0 ? (
              <Text style={styles.emptyText}>{L("No cards saved yet.", "Aún no hay tarjetas guardadas.")}</Text>
            ) : (
              state.paymentMethods.map((pm) => {
                const isDefault = state.defaultPaymentMethodId === pm.id;
                return (
                  <View key={pm.id} style={styles.vehicleRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.vehicleTitle}>
                        {pm.card.brand.toUpperCase()} •••• {pm.card.last4}
                      </Text>
                      <Text style={styles.vehicleMeta}>
                        {L("Expires", "Vence")} {pm.card.expMonth}/{pm.card.expYear}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => dispatch({ type: "SET_DEFAULT_PAYMENT_METHOD", payload: pm.id })}
                      style={[styles.activeBtn, isDefault && styles.activeBtnOn]}
                    >
                      <Text style={[styles.activeBtnText, isDefault && styles.activeBtnTextOn]}>
                        {isDefault ? L("Default", "Predeterminada") : L("Set Default", "Predeterminada")}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => dispatch({ type: "DELETE_PAYMENT_METHOD", payload: pm.id })}
                      style={styles.deleteBtn}
                    >
                      <IconSymbol name="trash" size={14} color="#B91C1C" />
                    </Pressable>
                  </View>
                );
              })
            )}
            <Pressable onPress={() => router.push("/payment-methods" as any)} style={styles.primaryRowBtn}>
              <IconSymbol name="creditcard.fill" size={16} color="#FFFFFF" />
              <Text style={styles.primaryRowBtnText}>{L("Manage Cards", "Administrar tarjetas")}</Text>
            </Pressable>
          </Section>
        ) : null}

        {activeTab === "settings" ? (
          <Section title={L("Account Settings", "Ajustes de cuenta")}>
            <Text style={styles.emptyText}>{L("Manage app preferences from this panel.", "Administra las preferencias de la app desde este panel.")}</Text>
          </Section>
        ) : null}

        <View style={styles.legalFooter}>
          <Pressable onPress={() => router.push("/legal/terms" as any)} hitSlop={8}>
            <Text style={styles.legalLink}>{L("Terms of Service", "Términos de servicio")}</Text>
          </Pressable>
          <Text style={styles.legalSeparator}>•</Text>
          <Pressable onPress={() => router.push("/legal/privacy" as any)} hitSlop={8}>
            <Text style={styles.legalLink}>{L("Privacy Policy", "Política de privacidad")}</Text>
          </Pressable>
        </View>

      </ScrollView>
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.rowBtn}>
      <Text style={styles.rowBtnText}>{label}</Text>
      <Text style={styles.rowBtnMeta}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 34,
    gap: 18,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#1A1A2E",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#2A2A40",
  },
  name: {
    fontSize: 22,
    fontWeight: "800",
    color: "#F8FAFC",
  },
  roleChip: {
    marginTop: 6,
    alignSelf: "flex-start",
    backgroundColor: "#FFEDD5",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  roleChipText: {
    color: "#C2410C",
    fontSize: 12,
    fontWeight: "700",
  },
  tagline: {
    marginTop: 8,
    color: "#C2410C",
    fontSize: 13,
    lineHeight: 18,
  },
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#121212",
    borderWidth: 1,
    borderColor: "#2A2A40",
    borderRadius: 14,
    padding: 4,
    gap: 6,
  },
  tabBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: "center",
  },
  tabBtnOn: {
    backgroundColor: "#F97316",
  },
  tabBtnText: {
    fontSize: 12,
    color: "#C2410C",
    fontWeight: "700",
  },
  tabBtnTextOn: {
    color: "#FFFFFF",
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#F8FAFC",
  },
  sectionBody: {
    backgroundColor: "#1A1A2E",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#2A2A40",
    overflow: "hidden",
  },
  formArea: {
    padding: 14,
    gap: 8,
  },
  label: {
    fontSize: 12,
    color: "#C2410C",
    fontWeight: "700",
  },
  input: {
    backgroundColor: "#121212",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2A2A40",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#F8FAFC",
    fontSize: 14,
  },
  inputBio: {
    minHeight: 84,
    textAlignVertical: "top",
  },
  emptyText: {
    padding: 14,
    fontSize: 14,
    color: "#C2410C",
  },
  vehicleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#2A2A40",
  },
  vehicleTitle: {
    color: "#F8FAFC",
    fontSize: 15,
    fontWeight: "700",
  },
  vehicleMeta: {
    marginTop: 2,
    color: "#C2410C",
    fontSize: 12,
  },
  activeBtn: {
    borderWidth: 1,
    borderColor: "#3A3A58",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  activeBtnOn: {
    borderColor: "#F97316",
    backgroundColor: "#FFF7ED",
  },
  activeBtnText: {
    color: "#C2410C",
    fontSize: 12,
    fontWeight: "700",
  },
  activeBtnTextOn: {
    color: "#C2410C",
  },
  primaryRowBtn: {
    margin: 14,
    borderRadius: 12,
    backgroundColor: "#F97316",
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryRowBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  rowBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#2A2A40",
  },
  rowBtnText: {
    color: "#E5E7EB",
    fontSize: 14,
    fontWeight: "600",
  },
  rowBtnMeta: {
    color: "#C2410C",
    fontSize: 13,
    fontWeight: "700",
  },
  readonlyValue: {
    color: "#C2410C",
    fontSize: 13,
    fontWeight: "600",
    maxWidth: "58%",
    textAlign: "right",
  },
  deleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FEF2F2",
  },
  editBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2A2A40",
  },
  check: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#3A3A58",
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: {
    borderColor: "#F97316",
    backgroundColor: "#F97316",
  },
  checkTick: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 11,
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
    color: "#2DD4BF",
    fontSize: 13,
    fontWeight: "700",
  },
  legalSeparator: {
    color: "#2DD4BF",
    fontSize: 13,
    fontWeight: "700",
  },
});
