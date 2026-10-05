import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Redirect, router } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { Avatar } from "@/components/avatar";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAuth, useClearUserData, getSessionToken } from "@/lib/auth-context";
import { supabaseUserData, type UserProfile } from "@/lib/_core/supabase-user-data";
import { saveProfileAvatar } from "@/lib/profile-avatar";
import { useImagePicker } from "@/hooks/use-image-picker";
import { haptic } from "@/lib/haptics";
import { useL } from "@/hooks/use-locale";

/**
 * Shared post-signup gate for BOTH roles. Deliberately placed OUTSIDE
 * app/auth/ (which has a layout guard that redirects any authenticated user
 * straight to (tabs) — see app/auth/_layout.tsx) so this screen can actually
 * stay put and block an authenticated-but-unapproved user. Same reasoning
 * that originally put mechanic/approval-pending.tsx outside app/auth/.
 *
 * A camera-captured profile photo is required for every account (migration
 * 034) and must be approved by an admin before the app can be used;
 * mechanics additionally need their verification documents approved
 * (pre-existing flow, unchanged). Anyone fully approved is bounced straight
 * through to (tabs).
 */
export default function ApprovalPendingScreen() {
  const { user, isLoading, signOut } = useAuth();
  const clearUserData = useClearUserData();
  const { pickFacePhoto } = useImagePicker();
  const L = useL();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [retaking, setRetaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    if (!user?.id || !user.role) return;
    setLoadingProfile(true);
    try {
      const token = await getSessionToken();
      if (!token) return;
      const nextProfile = await supabaseUserData.getOrCreateProfile(user.id, user.role, token);
      setProfile(nextProfile);
    } catch (err) {
      console.error("[ApprovalPending] Could not load profile:", err);
    } finally {
      setLoadingProfile(false);
    }
  }, [user?.id, user?.role]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const handleRetakePhoto = async () => {
    if (retaking || !user?.id) return;
    setRetaking(true);
    setError(null);
    try {
      const image = await pickFacePhoto();
      if (!image) {
        setRetaking(false);
        return;
      }
      const token = await getSessionToken();
      if (!token) throw new Error("Not signed in");
      await saveProfileAvatar(user.id, image, token);
      haptic.success();
      await loadProfile();
    } catch (err) {
      console.error("[ApprovalPending] Retake photo failed:", err);
      setError("Could not upload photo. Please try again.");
    } finally {
      setRetaking(false);
    }
  };

  if (isLoading || loadingProfile) {
    return (
      <ScreenContainer containerClassName="bg-background" className="items-center justify-center">
        <ActivityIndicator size="large" color="#F97316" />
      </ScreenContainer>
    );
  }

  if (!user) return <Redirect href="/auth/signin" />;

  const isMechanic = user.role === "mechanic";
  const avatarStatus = profile?.avatar_status ?? "pending_review";
  const hasPhoto = !!profile?.avatar_url;
  const avatarApproved = avatarStatus === "approved" && hasPhoto;
  const avatarRejected = avatarStatus === "rejected";

  const mechanicDocsApproved = !isMechanic || profile?.verification_status === "approved";
  const mechanicDocsRejected = isMechanic && profile?.verification_status === "rejected";
  const missingDriverLicense = isMechanic && !profile?.id_document_url;

  if (avatarApproved && mechanicDocsApproved) {
    return <Redirect href="/(tabs)" />;
  }

  const photoStatusLabel = !hasPhoto
    ? L("Not submitted", "No enviado")
    : avatarStatus === "pending_review"
      ? L("Pending review", "Pendiente de revisión")
      : avatarStatus === "approved"
        ? L("Approved", "Aprobado")
        : L("Rejected", "Rechazado");

  return (
    <ScreenContainer containerClassName="bg-background">
      <View style={styles.wrap}>
        <View style={styles.iconWrap}>
          <IconSymbol name="shield.fill" size={34} color="#F97316" />
        </View>
        <Text style={styles.title}>
          {avatarRejected || mechanicDocsRejected
            ? L("Verification needs attention", "La verificación requiere atención")
            : L("Waiting for approval", "Esperando aprobación")}
        </Text>
        <Text style={styles.body}>
          {L(
            "Your account needs an admin-approved profile photo before you can use WrenchUp.",
            "Tu cuenta necesita una foto de perfil aprobada por un administrador antes de poder usar WrenchUp."
          )}
        </Text>

        {profile?.avatar_url ? (
          <View style={{ marginTop: 18, alignItems: "center" }}>
            <Avatar name={profile.full_name || profile.display_name || "User"} url={profile.avatar_url} size={88} />
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>{L("Photo status", "Estado de la foto")}</Text>
          <Text style={styles.status}>{photoStatusLabel}</Text>
        </View>
        {avatarRejected && profile?.avatar_rejection_reason ? (
          <Text style={styles.rejectionReason}>{profile.avatar_rejection_reason}</Text>
        ) : null}

        {isMechanic ? (
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>{L("Documents status", "Estado de documentos")}</Text>
            <Text style={styles.status}>
              {profile?.verification_status === "pending_review"
                ? L("Pending review", "Pendiente de revisión")
                : profile?.verification_status === "approved"
                  ? L("Approved", "Aprobado")
                  : profile?.verification_status === "rejected"
                    ? L("Rejected", "Rechazado")
                    : L("Not submitted", "No enviado")}
            </Text>
          </View>
        ) : null}

        {!hasPhoto || avatarRejected ? (
          <Pressable onPress={handleRetakePhoto} disabled={retaking} style={styles.primaryBtn}>
            <Text style={styles.primaryBtnText}>
              {retaking
                ? L("Uploading...", "Subiendo...")
                : !hasPhoto
                  ? L("Take required photo", "Tomar foto requerida")
                  : L("Retake photo", "Volver a tomar foto")}
            </Text>
          </Pressable>
        ) : null}

        {isMechanic && (missingDriverLicense || mechanicDocsRejected) ? (
          <Pressable
            onPress={() => {
              haptic.light();
              router.push("/(tabs)/requirements" as any);
            }}
            style={styles.secondaryActionBtn}
          >
            <Text style={styles.secondaryActionBtnText}>{L("Update verification documents", "Actualizar documentos de verificación")}</Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={() => {
            haptic.light();
            router.replace("/(tabs)" as any);
          }}
          style={styles.secondaryBtn}
        >
          <Text style={styles.secondaryBtnText}>{L("Go to dashboard", "Ir al panel")}</Text>
        </Pressable>

        <Pressable
          onPress={async () => {
            haptic.warning();
            try {
              await clearUserData();
              await signOut();
              router.replace("/auth/signin");
            } catch (err) {
              console.error("[ApprovalPending] Sign out failed:", err);
            }
          }}
          style={styles.linkBtn}
        >
          <Text style={styles.linkText}>{L("Sign out", "Cerrar sesión")}</Text>
        </Pressable>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#1F2937",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 22,
  },
  title: {
    color: "#F8FAFC",
    fontSize: 26,
    fontWeight: "900",
    textAlign: "center",
  },
  body: {
    color: "#CBD5E1",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginTop: 12,
  },
  error: {
    color: "#FCA5A5",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 14,
    textAlign: "center",
  },
  statusRow: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 18,
  },
  statusLabel: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "700",
  },
  status: {
    color: "#F97316",
    fontSize: 13,
    fontWeight: "800",
  },
  rejectionReason: {
    color: "#FCA5A5",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
    width: "100%",
  },
  primaryBtn: {
    marginTop: 24,
    width: "100%",
    borderRadius: 12,
    backgroundColor: "#F97316",
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
  },
  secondaryActionBtn: {
    marginTop: 12,
    width: "100%",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#F97316",
    paddingVertical: 13,
    alignItems: "center",
  },
  secondaryActionBtnText: {
    color: "#F97316",
    fontSize: 14,
    fontWeight: "800",
  },
  secondaryBtn: {
    marginTop: 12,
    width: "100%",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
    paddingVertical: 13,
    alignItems: "center",
  },
  secondaryBtnText: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "800",
  },
  linkBtn: {
    marginTop: 18,
    paddingVertical: 8,
  },
  linkText: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "700",
  },
});
