import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useEffect, useState } from "react";
import { Redirect } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { ScreenMenuHeader } from "@/components/screen-menu-header";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAuth } from "@/lib/auth-context";
import { useStore } from "@/lib/store";
import { useImagePicker, type PickedImage } from "@/hooks/use-image-picker";
import { resolveAuthSession } from "@/lib/resolve-auth-session";
import { useLocaleContext, useT } from "@/hooks/use-locale";
import { haptic } from "@/lib/haptics";
import { supabaseUserData } from "@/lib/_core/supabase-user-data";
import { uploadMechanicDoc } from "@/lib/upload-mechanic-doc";

export default function RequirementsScreen() {
  const t = useT();
  const { locale } = useLocaleContext();
  const { user } = useAuth();
  const { state } = useStore();
  const { pickImageFromGallery } = useImagePicker();

  const [verificationStatus, setVerificationStatus] = useState<"pending_review" | "approved" | "rejected" | null>(null);
  const [idDocPath, setIdDocPath] = useState<string | null>(null);
  const [certDocPath, setCertDocPath] = useState<string | null>(null);
  const [docBusy, setDocBusy] = useState(false);
  const [profileAttest, setProfileAttest] = useState(false);

  const role = user?.role ?? state.role;
  const isEs = locale === "es-MX";
  const L = (en: string, es: string) => (isEs ? es : en);

  useEffect(() => {
    if (role !== "mechanic" || !user?.id) return;
    let cancelled = false;
    (async () => {
      const resolved = await resolveAuthSession(user);
      if (!resolved) return;
      try {
        const profile = await supabaseUserData.getOrCreateProfile(
          user.id,
          "mechanic",
          resolved.sessionToken
        );
        if (cancelled) return;
        setVerificationStatus(profile.verification_status);
        setIdDocPath(profile.id_document_url);
        setCertDocPath(profile.certification_document_url);
        setProfileAttest(Boolean(profile.mechanic_attested_no_criminal_record));
      } catch (err) {
        console.error("[Requirements] Could not load verification profile:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [role, user]);

  const handleMechanicDocUpload = async (docType: "license" | "certification") => {
    if (!user?.id) return;
    const picked: PickedImage | null = await pickImageFromGallery();
    if (!picked) return;
    setDocBusy(true);
    try {
      const resolved = await resolveAuthSession(user, (err) => {
        Alert.alert(L("Could not upload document", "No se pudo subir el documento"), err.message);
      });
      if (!resolved) return;
      const path = await uploadMechanicDoc(user.id, resolved.sessionToken, docType, picked);
      if (docType === "license") setIdDocPath(path);
      if (docType === "certification") setCertDocPath(path);
      haptic.success();
      Alert.alert(
        L("Uploaded", "Subido"),
        docType === "license"
          ? L("Driver's license uploaded.", "Licencia de conducir subida.")
          : L("Certification uploaded.", "Certificación subida.")
      );
    } catch (err) {
      console.error("[Requirements] Mechanic doc upload failed:", err);
      haptic.error();
      Alert.alert(L("Upload failed", "Error al subir"), L("Please try again.", "Inténtalo de nuevo."));
    } finally {
      setDocBusy(false);
    }
  };

  const handleSubmitVerificationReview = async () => {
    if (!user?.id) return;
    if (!idDocPath) {
      Alert.alert(
        L("Missing document", "Falta documento"),
        L("Please upload your driver's license first.", "Primero sube tu licencia de conducir.")
      );
      return;
    }
    if (!profileAttest) {
      Alert.alert(
        L("Certification required", "Certificación requerida"),
        L("Please certify eligibility before submitting.", "Confirma elegibilidad antes de enviar.")
      );
      return;
    }

    setDocBusy(true);
    try {
      const resolved = await resolveAuthSession(user, (err) => {
        Alert.alert(L("Could not submit", "No se pudo enviar"), err.message);
      });
      if (!resolved) return;

      await supabaseUserData.updateProfile(
        user.id,
        {
          verification_status: "pending_review",
          id_document_url: idDocPath,
          certification_document_url: certDocPath,
          mechanic_attested_no_criminal_record: true,
          mechanic_attested_at: new Date().toISOString(),
        },
        resolved.sessionToken,
        user.email
      );
      setVerificationStatus("pending_review");
      haptic.success();
      Alert.alert(
        L("Submitted", "Enviado"),
        L("Your verification documents are now pending admin review.", "Tus documentos están pendientes de revisión.")
      );
    } catch (err) {
      console.error("[Requirements] Verification submit failed:", err);
      haptic.error();
      Alert.alert(L("Could not submit", "No se pudo enviar"), L("Please try again.", "Inténtalo de nuevo."));
    } finally {
      setDocBusy(false);
    }
  };

  if (role !== "mechanic") {
    return <Redirect href="/(tabs)/profile" />;
  }

  return (
    <ScreenContainer edges={["left", "right", "bottom"]}>
      <ScreenMenuHeader title={t("tabs.requirements")} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.sectionBody}>
          <View style={styles.formArea}>
            <Text style={styles.label}>{L("Approval Status", "Estado de aprobación")}</Text>
            <Text style={styles.rowBtnMeta}>
              {verificationStatus === "approved"
                ? L("Approved", "Aprobado")
                : verificationStatus === "pending_review"
                ? L("Pending Review", "Pendiente de revisión")
                : verificationStatus === "rejected"
                ? L("Rejected", "Rechazado")
                : L("Not Submitted", "No enviado")}
            </Text>

            <Pressable
              onPress={() => handleMechanicDocUpload("license")}
              disabled={docBusy}
              style={styles.rowBtn}
            >
              <Text style={styles.rowBtnText}>{L("Upload Driver's License", "Subir licencia de conducir")}</Text>
              <Text style={styles.rowBtnMeta}>{idDocPath ? L("Uploaded", "Subido") : L("Missing", "Falta")}</Text>
            </Pressable>

            <Pressable
              onPress={() => handleMechanicDocUpload("certification")}
              disabled={docBusy}
              style={styles.rowBtn}
            >
              <Text style={styles.rowBtnText}>{L("Upload Certification (if any)", "Subir certificación (si aplica)")}</Text>
              <Text style={styles.rowBtnMeta}>{certDocPath ? L("Uploaded", "Subido") : L("Optional", "Opcional")}</Text>
            </Pressable>

            <Pressable
              onPress={() => setProfileAttest((prev) => !prev)}
              style={styles.attestRow}
            >
              <View style={[styles.check, profileAttest && styles.checkOn]}>
                {profileAttest ? <Text style={styles.checkTick}>✓</Text> : null}
              </View>
              <Text style={styles.helperText}>
                {L(
                  "I certify my documents are valid and I have no disqualifying criminal record.",
                  "Certifico que mis documentos son válidos y no tengo antecedentes descalificantes."
                )}
              </Text>
            </Pressable>

            <Pressable
              onPress={handleSubmitVerificationReview}
              disabled={docBusy}
              style={styles.primaryRowBtn}
            >
              <IconSymbol name="checkmark.seal.fill" size={16} color="#FFFFFF" />
              <Text style={styles.primaryRowBtnText}>
                {docBusy ? L("Working...", "Procesando...") : L("Submit For Review", "Enviar a revisión")}
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 34,
    gap: 18,
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
    gap: 10,
  },
  label: {
    fontSize: 12,
    color: "#C2410C",
    fontWeight: "700",
  },
  rowBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#2A2A40",
    borderRadius: 10,
    backgroundColor: "#121212",
  },
  rowBtnText: {
    color: "#E5E7EB",
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
    paddingRight: 8,
  },
  rowBtnMeta: {
    color: "#C2410C",
    fontSize: 13,
    fontWeight: "700",
  },
  attestRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  helperText: {
    color: "#C2410C",
    fontSize: 12,
    flex: 1,
    lineHeight: 17,
  },
  primaryRowBtn: {
    marginTop: 4,
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
});
