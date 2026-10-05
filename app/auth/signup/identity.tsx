import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";

import { PrimaryButton } from "@/components/primary-button";
import { ScreenContainer } from "@/components/screen-container";
import { PickedImage, useImagePicker } from "@/hooks/use-image-picker";
import { useL } from "@/hooks/use-locale";

type SignupRole = "customer" | "mechanic";
type SignupDocumentType = "drivers_license" | "insurance";

function parseRole(value: unknown): SignupRole {
  return value === "mechanic" ? "mechanic" : "customer";
}

export default function SignupIdentityScreen() {
  const L = useL();
  const params = useLocalSearchParams<{ role?: string; email?: string }>();
  const role = parseRole(params.role);
  const email = typeof params.email === "string" ? params.email : "";
  const { pickImageFromGallery } = useImagePicker();
  const [driversLicense, setDriversLicense] = useState<PickedImage | null>(null);
  const [insurance, setInsurance] = useState<PickedImage | null>(null);

  const isMechanic = role === "mechanic";
  const canFinish = !isMechanic || (!!driversLicense && !!insurance);

  const pickDocument = async (type: SignupDocumentType) => {
    const picked = await pickImageFromGallery();
    if (!picked) return;
    if (type === "drivers_license") {
      setDriversLicense(picked);
    } else {
      setInsurance(picked);
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const finish = () => {
    router.replace({
      pathname: "/auth/signup/done" as any,
      params: { role, email },
    });
  };

  return (
    <View style={styles.root}>
      <ScreenContainer
        containerClassName="bg-background"
        className="bg-background"
        showBackButton
        title={L("Verify your identity", "Verifica tu identidad")}
      >
        <ScrollView contentContainerStyle={styles.content} className="px-6 py-8 bg-background">
          <View>
            <View style={styles.stepPill}>
              <Text style={styles.stepPillText}>{L("Step 4 of 4", "Paso 4 de 4")}</Text>
            </View>

            <Text style={styles.title}>{L("Verify your identity", "Verifica tu identidad")}</Text>
            <Text style={styles.body}>
              {isMechanic
                ? L(
                  "Upload your driver's license and insurance. Mechanics must be approved before they can go online or take job requests.",
                    "Sube tu licencia de conducir y seguro. Los mecánicos deben ser aprobados antes de conectarse o tomar solicitudes."
                  )
                : L(
                    "No driver's license or insurance is required for customer signup. Finish will take you to the signup complete screen.",
                    "No se requiere licencia de conducir ni seguro para registrarte como cliente. Finalizar te llevará a la pantalla de registro completado."
                  )}
            </Text>

            {isMechanic ? (
              <>
                <View style={styles.options}>
                  <Pressable
                    onPress={() => pickDocument("drivers_license")}
                    style={[styles.option, driversLicense ? styles.optionSelected : null]}
                  >
                    <Text style={styles.optionTitle}>{L("Upload Driver's License", "Subir licencia de conducir")}</Text>
                    <Text style={styles.optionText}>
                      {driversLicense
                        ? driversLicense.filename
                        : L("Required before mechanics can be approved", "Requerida antes de aprobar mecánicos")}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => pickDocument("insurance")}
                    style={[styles.option, insurance ? styles.optionSelected : null]}
                  >
                    <Text style={styles.optionTitle}>{L("Upload Insurance", "Subir seguro")}</Text>
                    <Text style={styles.optionText}>
                      {insurance
                        ? insurance.filename
                        : L("Proof of active vehicle insurance", "Comprobante de seguro vehicular activo")}
                    </Text>
                  </Pressable>
                </View>

                {canFinish ? (
                  <View style={styles.statusCard}>
                    <Text style={styles.statusTitle}>{L("Documents selected", "Documentos seleccionados")}</Text>
                    <Text style={styles.statusText}>{L("Driver's license and insurance are ready.", "Licencia de conducir y seguro listos.")}</Text>
                  </View>
                ) : (
                  <Text style={styles.requiredText}>
                    {L(
                      "Finish unlocks after driver's license and insurance are uploaded.",
                      "Finalizar se activa después de subir licencia de conducir y seguro."
                    )}
                  </Text>
                )}
              </>
            ) : (
              <View style={styles.statusCard}>
                <Text style={styles.statusTitle}>{L("Customer signup ready", "Registro de cliente listo")}</Text>
                <Text style={styles.statusText}>
                  {L(
                    "Finish is available now. You can sign in after account creation.",
                    "Finalizar ya está disponible. Puedes iniciar sesión después de crear la cuenta."
                  )}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.footer}>
            <Pressable
              onPress={() =>
                router.replace({
                  pathname: "/auth/signup/customer" as any,
                  params: { role, email },
                })
              }
              style={styles.backButton}
            >
              <Text style={styles.backButtonText}>{L("Back", "Atrás")}</Text>
            </Pressable>
            <PrimaryButton
              title={L("Finish", "Finalizar")}
              onPress={finish}
              disabled={!canFinish}
              fullWidth={false}
            />
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
  title: {
    color: "#F8FAFC",
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 30,
    marginBottom: 10,
  },
  body: {
    color: "#94A3B8",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 22,
  },
  options: {
    gap: 12,
    marginBottom: 18,
  },
  option: {
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 12,
    backgroundColor: "#111827",
    padding: 16,
  },
  optionSelected: {
    borderColor: "#F97316",
    backgroundColor: "#1F2937",
  },
  optionTitle: {
    color: "#F8FAFC",
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 5,
  },
  optionText: {
    color: "#94A3B8",
    fontSize: 13,
    lineHeight: 18,
  },
  statusCard: {
    borderRadius: 12,
    backgroundColor: "#052E2B",
    borderWidth: 1,
    borderColor: "#C2410C",
    padding: 14,
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
  requiredText: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
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
