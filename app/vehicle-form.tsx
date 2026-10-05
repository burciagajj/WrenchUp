import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/lib/auth-context";
import { syncUserDataToStore } from "@/lib/load-user-data";
import { supabaseUserData } from "@/lib/_core/supabase-user-data";
import { resolveAuthSession } from "@/lib/resolve-auth-session";
import { useStore } from "@/lib/store";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { PrimaryButton } from "@/components/primary-button";
import { haptic } from "@/lib/haptics";
import type { Vehicle } from "@/lib/types";
import { useImagePicker } from "@/hooks/use-image-picker";
import { deleteVehicleApproval, upsertVehicleApproval } from "@/lib/vehicle-approvals";
import { uploadVehicleDoc } from "@/lib/upload-vehicle-doc";
import { isVehicleReferencedByActiveJob } from "@/lib/vehicle-delete-guard-core";
import { useL } from "@/hooks/use-locale";
import { VEHICLE_CATALOG } from "@/lib/vehicle-catalog";
import { useTapGuard } from "@/hooks/use-tap-guard";

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: CURRENT_YEAR - 1979 }, (_, i) => `${CURRENT_YEAR - i}`);
const MAKE_OPTIONS = Object.keys(VEHICLE_CATALOG);
const TRANSMISSION_OPTIONS: { value: NonNullable<Vehicle["transmissionType"]>; label: string }[] = [
  { value: "automatic", label: "Automatic" },
  { value: "manual", label: "Manual" },
  { value: "cvt", label: "CVT" },
  { value: "dct", label: "Dual-Clutch" },
  { value: "other", label: "Other" },
];
const DRIVETRAIN_OPTIONS: { value: NonNullable<Vehicle["drivetrain"]>; label: string }[] = [
  { value: "FWD", label: "FWD (Front-Wheel Drive)" },
  { value: "RWD", label: "RWD (Rear-Wheel Drive)" },
  { value: "AWD", label: "AWD (All-Wheel Drive)" },
];

export default function VehicleFormScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { user } = useAuth();
  const { state, dispatch } = useStore();
  const { pickDocumentImage } = useImagePicker();
  const L = useL();
  const guardDelete = useTapGuard();
  const existing = useMemo(
    () => (typeof id === "string" ? state.vehicles.find((v) => v.id === id) : undefined),
    [id, state.vehicles],
  );

  const [year, setYear] = useState(existing?.year?.toString() ?? "");
  const [make, setMake] = useState(existing?.make ?? "");
  const [model, setModel] = useState(existing?.model ?? "");
  const [trim, setTrim] = useState(existing?.trim ?? "");
  const [engineSize, setEngineSize] = useState(existing?.engineSize ?? "");
  const [transmissionType, setTransmissionType] = useState<Vehicle["transmissionType"]>(
    existing?.transmissionType ?? "automatic"
  );
  const [drivetrain, setDrivetrain] = useState<Vehicle["drivetrain"]>(
    existing?.drivetrain ?? "FWD"
  );
  const [color, setColor] = useState(existing?.color ?? "");
  const [plate, setPlate] = useState(existing?.plate ?? "");
  const [insuranceDocUri, setInsuranceDocUri] = useState(existing?.insuranceDocUri ?? "");
  const [registrationStickerUri, setRegistrationStickerUri] = useState(existing?.registrationStickerUri ?? "");
  const [uploadingInsurance, setUploadingInsurance] = useState(false);
  const [uploadingRegistration, setUploadingRegistration] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerLabel, setPickerLabel] = useState("");
  const [pickerOptions, setPickerOptions] = useState<{ value: string; label: string }[]>([]);
  const [pickerValue, setPickerValue] = useState<string>("");
  const [pickerOnSelect, setPickerOnSelect] = useState<(v: string) => void>(() => () => {});

  // Trim and engine aren't independent picks — a model's real trim ladder
  // determines what engines are actually offered on each trim. So the chain
  // is Make -> Model -> Trim -> Engine, each level narrowing from the
  // catalog rather than everything being a flat per-make list.
  const makeMeta = VEHICLE_CATALOG[make];
  const modelOptions = Object.keys(makeMeta?.models ?? {}).map((value) => ({ value, label: value }));
  const modelMeta = makeMeta?.models?.[model];
  const trimOptions = Object.keys(modelMeta?.trims ?? {}).map((value) => ({ value, label: value }));
  const trimMeta = modelMeta?.trims?.[trim];
  const engineOptions = (trimMeta?.engines ?? []).map((value) => ({ value, label: value }));
  const transmissionLabel = TRANSMISSION_OPTIONS.find((o) => o.value === transmissionType)?.label ?? "";
  const drivetrainLabel = DRIVETRAIN_OPTIONS.find((o) => o.value === drivetrain)?.label ?? "";

  // Insurance/registration docs are intentionally NOT required to save a
  // vehicle — onboarding (auth/profile-complete.tsx) never asks for them
  // either, so requiring them here made a customer's onboarding-created
  // vehicle permanently uneditable until they backfilled documents they were
  // never asked for in the first place. Docs stay optional everywhere; a
  // vehicle just sits in "pending" approval until they're uploaded and an
  // admin reviews them (see the "verify later" hint below).
  const isValid =
    make.trim().length > 0 &&
    model.trim().length > 0 &&
    /^\d{4}$/.test(year) &&
    parseInt(year, 10) >= 1950 &&
    parseInt(year, 10) <= CURRENT_YEAR + 1;

  const openPicker = (
    label: string,
    currentValue: string,
    options: { value: string; label: string }[],
    onSelect: (next: string) => void,
  ) => {
    setPickerLabel(label);
    setPickerValue(currentValue);
    setPickerOptions(options);
    setPickerOnSelect(() => onSelect);
    setPickerVisible(true);
  };

  const pickInsurance = async () => {
    const picked = await pickDocumentImage();
    if (!picked) return;
    haptic.selection();
    setUploadingInsurance(true);
    try {
      const resolved = await resolveAuthSession(user, (err) => {
        Alert.alert(L("Could not upload document", "No se pudo subir el documento"), err.message);
      });
      if (!resolved) return;
      // Actually upload to Supabase Storage — previously this just kept the
      // local device file URI, which nobody (not even an admin reviewer on a
      // different device) could ever open.
      const path = await uploadVehicleDoc(resolved.userId, resolved.sessionToken, "insurance", picked);
      setInsuranceDocUri(path);
    } catch (err) {
      console.error("[VehicleForm] Insurance upload failed:", err);
      Alert.alert(L("Upload failed", "Error al subir"), err instanceof Error ? err.message : L("Please try again.", "Inténtalo de nuevo."));
    } finally {
      setUploadingInsurance(false);
    }
  };

  const pickRegistration = async () => {
    const picked = await pickDocumentImage();
    if (!picked) return;
    haptic.selection();
    setUploadingRegistration(true);
    try {
      const resolved = await resolveAuthSession(user, (err) => {
        Alert.alert(L("Could not upload document", "No se pudo subir el documento"), err.message);
      });
      if (!resolved) return;
      const path = await uploadVehicleDoc(resolved.userId, resolved.sessionToken, "registration", picked);
      setRegistrationStickerUri(path);
    } catch (err) {
      console.error("[VehicleForm] Registration upload failed:", err);
      Alert.alert(L("Upload failed", "Error al subir"), err instanceof Error ? err.message : L("Please try again.", "Inténtalo de nuevo."));
    } finally {
      setUploadingRegistration(false);
    }
  };

  const handleSave = async () => {
    if (!isValid) {
      haptic.error();
      return;
    }

    const vehiclePayload: Omit<Vehicle, "id"> = {
      nickname: `${year.trim()} ${make.trim()} ${model.trim()}`.trim(),
      year: parseInt(year, 10),
      make: make.trim(),
      model: model.trim(),
      trim: trim.trim() || undefined,
      engineSize: engineSize.trim() || undefined,
      transmissionType,
      drivetrain,
      color: color.trim() || "Unknown",
      plate: plate.trim().toUpperCase(),
    };

    const resolved = await resolveAuthSession(user, (err) => {
      Alert.alert(L("Could not save vehicle", "No se pudo guardar el vehículo"), err.message);
    });
    if (!resolved) return;

    const authUser =
      user ?? {
        id: resolved.userId,
        email: state.userName,
        role: state.role,
        profileCompleted: true,
        emailConfirmed: true,
      };

    setSaving(true);
    try {
      let approvalVehicleId = existing?.id ?? "";
      let approvalStatus: "pending" | "approved" | "rejected" = existing?.approvalStatus ?? "pending";
      if (existing) {
        await supabaseUserData.updateVehicle(
          existing.id,
          resolved.userId,
          vehiclePayload,
          resolved.sessionToken
        );
      } else {
        const added = await supabaseUserData.addVehicle(
          resolved.userId,
          vehiclePayload,
          resolved.sessionToken
        );
        const newVehicleId = added.id;
        approvalVehicleId = newVehicleId;
        approvalStatus = "pending";
        await upsertVehicleApproval(resolved.userId, newVehicleId, {
          insuranceDocUri,
          registrationStickerUri,
          approvalStatus: "pending",
        });
      }

      if (existing) {
        await upsertVehicleApproval(resolved.userId, existing.id, {
          insuranceDocUri,
          registrationStickerUri,
          approvalStatus: existing.approvalStatus ?? "pending",
        });
      }

      // Preferred path: store approvals in Supabase for manual admin review.
      // Fallback: keep local cache if DB columns are not available yet.
      try {
        await supabaseUserData.updateVehicleApproval(
          approvalVehicleId,
          resolved.userId,
          {
            insurance_doc_url: insuranceDocUri,
            registration_sticker_url: registrationStickerUri,
            approval_status: approvalStatus,
          },
          resolved.sessionToken
        );
      } catch (err: any) {
        if (err?.code !== "VEHICLE_APPROVAL_COLUMNS_MISSING") {
          throw err;
        }
        console.warn("[VehicleForm] Supabase vehicle approval columns missing; using local fallback.");
      }

      await syncUserDataToStore(dispatch, authUser, resolved.sessionToken);
      dispatch({
        type: "MERGE_VEHICLE_APPROVALS",
        payload: {
          [approvalVehicleId]: {
            insuranceDocUri,
            registrationStickerUri,
            approvalStatus,
          },
        },
      });
      haptic.success();
      router.back();
    } catch (err) {
      console.error("[VehicleForm] Save failed:", err);
      haptic.error();
      Alert.alert(L("Could not save vehicle", "No se pudo guardar el vehículo"), L("Please try again.", "Inténtalo de nuevo."));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!existing) return;
    if (isVehicleReferencedByActiveJob(existing.id, state.jobs)) {
      haptic.error();
      Alert.alert(
        L("Can't delete this vehicle", "No se puede eliminar este vehículo"),
        L(
          "This vehicle is tied to an active or upcoming job. Wait until that job is completed or cancelled before deleting it.",
          "Este vehículo está vinculado a un trabajo activo o próximo. Espera a que ese trabajo se complete o cancele antes de eliminarlo.",
        ),
      );
      return;
    }
    const doDelete = guardDelete(async () => {
      const resolved = await resolveAuthSession(user, (err) => {
        Alert.alert(L("Could not delete vehicle", "No se pudo eliminar el vehículo"), err.message);
      });
      if (!resolved) return;

      const authUser =
        user ?? {
          id: resolved.userId,
          email: state.userName,
          role: state.role,
          profileCompleted: true,
          emailConfirmed: true,
        };

      setSaving(true);
      try {
        await supabaseUserData.deleteVehicle(
          existing.id,
          resolved.userId,
          resolved.sessionToken
        );
        await deleteVehicleApproval(resolved.userId, existing.id);
        await syncUserDataToStore(dispatch, authUser, resolved.sessionToken);
        haptic.warning();
        router.back();
      } catch (err) {
        console.error("[VehicleForm] Delete failed:", err);
        haptic.error();
        Alert.alert(L("Could not delete vehicle", "No se pudo eliminar el vehículo"), L("Please try again.", "Inténtalo de nuevo."));
      } finally {
        setSaving(false);
      }
    });
    if (Platform.OS === "web") {
      doDelete();
    } else {
      Alert.alert(L("Delete vehicle", "Eliminar vehículo"), L("This action cannot be undone.", "Esta acción no se puede deshacer."), [
        { text: L("Cancel", "Cancelar"), style: "cancel" },
        { text: L("Delete", "Eliminar"), style: "destructive", onPress: doDelete },
      ]);
    }
  };

  return (
    <ScreenContainer edges={["left", "right"]} style={{ backgroundColor: "#040B1B" }} showBackButton title="Add vehicle">
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            haptic.light();
            router.back();
          }}
          hitSlop={10}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <IconSymbol name="xmark" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>{existing ? "Edit vehicle" : "Add vehicle"}</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32, gap: 14 }}>
        <View style={styles.previewCard}>
          <Text style={styles.previewLabel}>Vehicle Preview</Text>
          <Text style={styles.previewTitle}>
            {year || "Year"} {make || "Make"} {model || "Model"}
          </Text>
          <Text style={styles.previewMeta}>
            {(trim || "Trim")} • {(engineSize || "Engine")} • {(transmissionLabel || "Transmission")}
          </Text>
          <Text style={styles.previewMeta}>{drivetrainLabel || "Drivetrain"}</Text>
        </View>


        <SelectField
          label="Year"
          value={year}
          placeholder="Select year"
          onPress={() =>
            openPicker(
              "Select Year",
              year,
              YEAR_OPTIONS.map((value) => ({ value, label: value })),
              (next) => setYear(next),
            )
          }
        />
        <SelectField
          label="Make"
          value={make}
          placeholder="Select make"
          onPress={() =>
            openPicker(
              "Select Make",
              make,
              MAKE_OPTIONS.map((value) => ({ value, label: value })),
              (next) => {
                setMake(next);
                setModel("");
                setEngineSize("");
                setTrim("");
              },
            )
          }
        />
        <SelectField
          label="Model"
          value={model}
          placeholder={make ? "Select model" : "Select make first"}
          disabled={!make}
          onPress={() =>
            openPicker(
              "Select Model",
              model,
              modelOptions,
              (next) => {
                setModel(next);
                setTrim("");
                setEngineSize("");
              },
            )
          }
        />
        {/* Trim before Engine, and Engine stays locked until a trim is
            picked — which real engine options exist depends on the trim
            (e.g. a Hybrid engine is often only on specific trims), not the
            model as a whole. */}
        <SelectField
          label="Trim"
          value={trim}
          placeholder={model ? "Select trim" : "Select model first"}
          disabled={!model}
          onPress={() =>
            openPicker(
              "Select Trim",
              trim,
              trimOptions,
              (next) => {
                setTrim(next);
                setEngineSize("");
              },
            )
          }
        />
        <SelectField
          label="Engine"
          value={engineSize}
          placeholder={trim ? "Select engine" : "Select trim first"}
          disabled={!trim}
          onPress={() =>
            openPicker(
              "Select Engine",
              engineSize,
              engineOptions,
              (next) => setEngineSize(next),
            )
          }
        />
        <SelectField
          label="Transmission"
          value={transmissionLabel}
          placeholder="Select transmission"
          onPress={() =>
            openPicker(
              "Select Transmission",
              transmissionType ?? "",
              TRANSMISSION_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
              (next) => setTransmissionType(next as Vehicle["transmissionType"]),
            )
          }
        />
        <SelectField
          label="Traction"
          value={drivetrainLabel}
          placeholder="Select traction"
          onPress={() =>
            openPicker(
              "Select Traction",
              drivetrain ?? "",
              DRIVETRAIN_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
              (next) => setDrivetrain(next as Vehicle["drivetrain"]),
            )
          }
        />

        <Field label="Color" value={color} onChangeText={setColor} placeholder="Silver" autoCapitalize="words" />
        <Field label="License plate" value={plate} onChangeText={setPlate} placeholder="ABC1234" autoCapitalize="characters" maxLength={10} />

        <UploadRow
          label="Insurance document (optional for now)"
          value={uploadingInsurance ? "Uploading..." : insuranceDocUri ? "Uploaded" : "Tap to upload"}
          onPress={pickInsurance}
          disabled={uploadingInsurance}
        />
        <UploadRow
          label="Registration sticker (optional for now)"
          value={uploadingRegistration ? "Uploading..." : registrationStickerUri ? "Uploaded" : "Tap to upload"}
          onPress={pickRegistration}
          disabled={uploadingRegistration}
        />
        <Text style={styles.hintText}>
          You can add insurance and registration now or later
        </Text>

        <View style={{ height: 8 }} />
        <PrimaryButton
          title={saving ? "Saving..." : existing ? "Save changes" : "Add vehicle"}
          onPress={handleSave}
          disabled={!isValid || saving || uploadingInsurance || uploadingRegistration}
          hapticType="success"
        />
        {existing ? (
          <PrimaryButton
            title={saving ? "Working..." : "Delete vehicle"}
            variant="danger"
            onPress={handleDelete}
            disabled={saving}
            hapticType="error"
          />
        ) : null}
      </ScrollView>

      <SelectModal
        visible={pickerVisible}
        title={pickerLabel}
        value={pickerValue}
        options={pickerOptions}
        onClose={() => setPickerVisible(false)}
        onSelect={(next) => {
          pickerOnSelect(next);
          setPickerVisible(false);
        }}
      />
    </ScreenContainer>
  );
}

function SelectField({
  label,
  value,
  placeholder,
  onPress,
  disabled,
}: {
  label: string;
  value?: string;
  placeholder: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [styles.selectBtn, disabled && { opacity: 0.45 }, pressed && { opacity: 0.86 }]}
      >
        <Text style={[styles.selectBtnText, !value && styles.selectPlaceholder]}>{value || placeholder}</Text>
        <IconSymbol name="chevron.down" size={16} color="#94A3B8" />
      </Pressable>
    </View>
  );
}

function SelectModal({
  visible,
  title,
  value,
  options,
  onClose,
  onSelect,
}: {
  visible: boolean;
  title: string;
  value: string;
  options: { value: string; label: string }[];
  onClose: () => void;
  onSelect: (v: string) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <IconSymbol name="xmark" size={18} color="#CBD5E1" />
            </Pressable>
          </View>
          <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ paddingBottom: 8 }}>
            {options.map((opt) => {
              const active = value === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => onSelect(opt.value)}
                  style={({ pressed }) => [styles.modalOption, active && styles.modalOptionActive, pressed && { opacity: 0.85 }]}
                >
                  <Text style={[styles.modalOptionText, active && styles.modalOptionTextActive]}>{opt.label}</Text>
                  {active ? <IconSymbol name="checkmark" size={14} color="#35E0D0" /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function UploadRow({
  label,
  value,
  onPress,
  disabled,
}: {
  label: string;
  value: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [styles.uploadBtn, (pressed || disabled) && { opacity: 0.8 }]}
      >
        <Text style={styles.uploadBtnText}>{value}</Text>
        <IconSymbol name="chevron.right" size={16} color="#64748B" />
      </Pressable>
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize,
  maxLength,
}: {
  label: string;
  value: string;
  onChangeText: (s: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "number-pad";
  autoCapitalize?: "none" | "words" | "characters";
  maxLength?: number;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#94A3B8"
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        maxLength={maxLength}
        style={styles.input}
        returnKeyType="done"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
  },
  title: { fontSize: 18, fontWeight: "800", color: "#F8FAFC" },
  label: { fontSize: 12, color: "#94A3B8", fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  previewCard: {
    backgroundColor: "#111827",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#334155",
    padding: 12,
    gap: 3,
  },
  previewLabel: {
    color: "#35E0D0",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  previewTitle: {
    color: "#F8FAFC",
    fontSize: 18,
    fontWeight: "800",
  },
  previewMeta: {
    color: "#CBD5E1",
    fontSize: 13,
    fontWeight: "600",
  },
  input: {
    backgroundColor: "#111827",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#F8FAFC",
  },
  selectBtn: {
    backgroundColor: "#111827",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selectBtnText: {
    color: "#F8FAFC",
    fontSize: 15,
    fontWeight: "600",
  },
  selectPlaceholder: {
    color: "#94A3B8",
  },
  uploadBtn: {
    backgroundColor: "#111827",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  uploadBtnText: {
    fontSize: 15,
    color: "#F8FAFC",
    fontWeight: "600",
  },
  hintText: {
    color: "#35E0D0",
    fontSize: 12,
    marginTop: 4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#0F172A",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderColor: "#334155",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 16,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  modalTitle: {
    color: "#F8FAFC",
    fontSize: 16,
    fontWeight: "800",
  },
  modalOption: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#111827",
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalOptionActive: {
    borderColor: "#35E0D0",
    backgroundColor: "rgba(53,224,208,0.12)",
  },
  modalOptionText: {
    color: "#E2E8F0",
    fontSize: 14,
    fontWeight: "700",
  },
  modalOptionTextActive: {
    color: "#F8FAFC",
  },
});
