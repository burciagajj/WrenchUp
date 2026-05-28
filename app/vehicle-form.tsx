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

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: CURRENT_YEAR - 1979 }, (_, i) => `${CURRENT_YEAR - i}`);
const MAKE_MODEL_ENGINE_TRIM: Record<string, { models: string[]; engines: string[]; trims: string[] }> = {
  Audi: {
    models: ["A3", "A4", "A5", "A6", "Q3", "Q5", "Q7"],
    engines: ["2.0L Turbo", "3.0L V6", "4.0L V8"],
    trims: ["Premium", "Premium Plus", "Prestige", "S Line"],
  },
  BMW: {
    models: ["228i", "330i", "530i", "X3", "X5", "M3"],
    engines: ["2.0L Turbo", "3.0L I6", "4.4L V8"],
    trims: ["Base", "Sport", "M Sport", "Luxury"],
  },
  Toyota: {
    models: ["Corolla", "Camry", "RAV4", "Tacoma", "Highlander", "Tundra"],
    engines: ["1.8L I4", "2.5L I4", "3.5L V6", "Hybrid"],
    trims: ["L", "LE", "SE", "XLE", "Limited"],
  },
  Ford: {
    models: ["Focus", "Fusion", "Escape", "F-150", "Explorer", "Mustang"],
    engines: ["2.0L I4", "2.3L EcoBoost", "3.5L EcoBoost", "5.0L V8"],
    trims: ["XL", "XLT", "Lariat", "Platinum", "ST"],
  },
  Chevrolet: {
    models: ["Malibu", "Equinox", "Tahoe", "Silverado", "Camaro"],
    engines: ["1.5L Turbo", "2.0L Turbo", "5.3L V8", "6.2L V8"],
    trims: ["LS", "LT", "RS", "Premier", "High Country"],
  },
  Honda: {
    models: ["Civic", "Accord", "CR-V", "Pilot", "Ridgeline"],
    engines: ["1.5L Turbo", "2.0L I4", "3.5L V6", "Hybrid"],
    trims: ["LX", "Sport", "EX", "EX-L", "Touring"],
  },
  Nissan: {
    models: ["Sentra", "Altima", "Rogue", "Frontier", "Pathfinder"],
    engines: ["2.0L I4", "2.5L I4", "3.5L V6"],
    trims: ["S", "SV", "SL", "SR", "Platinum"],
  },
  Hyundai: {
    models: ["Elantra", "Sonata", "Tucson", "Santa Fe", "Palisade"],
    engines: ["2.0L I4", "2.5L I4", "1.6L Turbo", "Hybrid"],
    trims: ["SE", "SEL", "N Line", "Limited", "Calligraphy"],
  },
  Kia: {
    models: ["Forte", "K5", "Sportage", "Sorento", "Telluride"],
    engines: ["2.0L I4", "2.5L I4", "1.6L Turbo", "Hybrid"],
    trims: ["LX", "S", "EX", "GT-Line", "SX"],
  },
  Mercedes: {
    models: ["C 300", "E 350", "GLC 300", "GLE 350", "S 500"],
    engines: ["2.0L Turbo", "3.0L I6", "4.0L V8"],
    trims: ["Base", "AMG Line", "Premium", "Exclusive"],
  },
  Lexus: {
    models: ["IS 250", "IS 350", "ES 350", "RX 350", "GX 460", "LX 600"],
    engines: ["2.5L I4", "3.5L V6", "5.7L V8", "Hybrid"],
    trims: ["Base", "F Sport", "Luxury", "Premium", "Ultra Luxury"],
  },
  Mazda: {
    models: ["Mazda3", "Mazda6", "CX-30", "CX-5", "CX-50", "CX-90"],
    engines: ["2.0L I4", "2.5L I4", "2.5L Turbo", "3.3L Turbo"],
    trims: ["S", "Select", "Preferred", "Premium", "Turbo"],
  },
  Volkswagen: {
    models: ["Jetta", "Passat", "Golf", "Tiguan", "Atlas", "Taos"],
    engines: ["1.4L Turbo", "1.5L Turbo", "2.0L Turbo", "3.6L V6"],
    trims: ["S", "SE", "SEL", "R-Line", "Autobahn"],
  },
  Subaru: {
    models: ["Impreza", "Legacy", "Crosstrek", "Forester", "Outback", "WRX"],
    engines: ["2.0L Boxer", "2.5L Boxer", "2.4L Turbo Boxer"],
    trims: ["Base", "Premium", "Sport", "Limited", "Touring"],
  },
  Jeep: {
    models: ["Wrangler", "Compass", "Cherokee", "Grand Cherokee", "Gladiator"],
    engines: ["2.0L Turbo", "3.6L V6", "5.7L V8", "6.4L V8"],
    trims: ["Sport", "Latitude", "Limited", "Rubicon", "Overland"],
  },
  Dodge: {
    models: ["Charger", "Challenger", "Durango", "Journey", "Hornet"],
    engines: ["2.0L Turbo", "3.6L V6", "5.7L V8", "6.4L V8"],
    trims: ["SXT", "GT", "R/T", "Scat Pack", "SRT"],
  },
  GMC: {
    models: ["Terrain", "Acadia", "Yukon", "Sierra 1500", "Canyon"],
    engines: ["2.0L Turbo", "3.6L V6", "5.3L V8", "6.2L V8"],
    trims: ["SLE", "SLT", "AT4", "Denali", "Elevation"],
  },
  RAM: {
    models: ["1500", "2500", "3500", "ProMaster", "ProMaster City"],
    engines: ["3.6L V6", "5.7L V8", "6.7L Cummins Diesel"],
    trims: ["Tradesman", "Big Horn", "Laramie", "Limited", "Rebel"],
  },
  Tesla: {
    models: ["Model 3", "Model S", "Model X", "Model Y", "Cybertruck"],
    engines: ["Single Motor", "Dual Motor", "Tri Motor"],
    trims: ["Standard Range", "Long Range", "Performance", "Plaid"],
  },
  Acura: {
    models: ["ILX", "TLX", "RDX", "MDX", "Integra"],
    engines: ["2.0L Turbo", "2.4L I4", "3.5L V6", "Hybrid"],
    trims: ["Base", "A-Spec", "Advance", "Technology", "Type S"],
  },
  Infiniti: {
    models: ["Q50", "Q60", "QX50", "QX60", "QX80"],
    engines: ["2.0L Turbo", "3.0L Twin Turbo", "3.5L V6", "5.6L V8"],
    trims: ["Pure", "Luxe", "Sensory", "Autograph", "Red Sport"],
  },
  Mitsubishi: {
    models: ["Mirage", "Lancer", "Outlander", "Outlander Sport", "Eclipse Cross"],
    engines: ["1.2L I3", "2.0L I4", "2.4L I4", "Plug-In Hybrid"],
    trims: ["ES", "SE", "SEL", "GT", "LE"],
  },
  Volvo: {
    models: ["S60", "S90", "XC40", "XC60", "XC90"],
    engines: ["2.0L Turbo", "2.0L Turbo Hybrid", "Recharge EV"],
    trims: ["Core", "Plus", "Ultimate", "R-Design", "Inscription"],
  },
  Porsche: {
    models: ["Macan", "Cayenne", "Panamera", "911", "Taycan"],
    engines: ["2.0L Turbo", "2.9L Twin Turbo", "4.0L Flat-6", "EV"],
    trims: ["Base", "S", "GTS", "Turbo", "Turbo S"],
  },
  Jaguar: {
    models: ["XE", "XF", "F-PACE", "E-PACE", "I-PACE"],
    engines: ["2.0L Turbo", "3.0L Supercharged", "EV"],
    trims: ["S", "SE", "R-Dynamic", "HSE", "SVR"],
  },
  "Land Rover": {
    models: ["Range Rover", "Range Rover Sport", "Defender", "Discovery", "Evoque"],
    engines: ["2.0L Turbo", "3.0L I6", "4.4L V8", "Plug-In Hybrid"],
    trims: ["S", "SE", "HSE", "Autobiography", "Dynamic"],
  },
  Mini: {
    models: ["Cooper", "Cooper S", "Clubman", "Countryman", "John Cooper Works"],
    engines: ["1.5L Turbo", "2.0L Turbo", "Electric"],
    trims: ["Classic", "Signature", "Iconic", "S", "JCW"],
  },
};
const MAKE_OPTIONS = Object.keys(MAKE_MODEL_ENGINE_TRIM);
const TRANSMISSION_OPTIONS: Array<{ value: NonNullable<Vehicle["transmissionType"]>; label: string }> = [
  { value: "automatic", label: "Automatic" },
  { value: "manual", label: "Manual" },
  { value: "cvt", label: "CVT" },
  { value: "dct", label: "Dual-Clutch" },
  { value: "other", label: "Other" },
];
const DRIVETRAIN_OPTIONS: Array<{ value: NonNullable<Vehicle["drivetrain"]>; label: string }> = [
  { value: "FWD", label: "FWD (Front-Wheel Drive)" },
  { value: "RWD", label: "RWD (Rear-Wheel Drive)" },
  { value: "AWD", label: "AWD (All-Wheel Drive)" },
  { value: "4WD", label: "4WD (Four-Wheel Drive)" },
];

export default function VehicleFormScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { user } = useAuth();
  const { state, dispatch } = useStore();
  const { pickImageFromGallery } = useImagePicker();
  const existing = useMemo(
    () => (typeof id === "string" ? state.vehicles.find((v) => v.id === id) : undefined),
    [id, state.vehicles],
  );

  const [nickname, setNickname] = useState(existing?.nickname ?? "");
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
  const [saving, setSaving] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerLabel, setPickerLabel] = useState("");
  const [pickerOptions, setPickerOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [pickerValue, setPickerValue] = useState<string>("");
  const [pickerOnSelect, setPickerOnSelect] = useState<(v: string) => void>(() => () => {});

  const makeMeta = MAKE_MODEL_ENGINE_TRIM[make];
  const modelOptions = (makeMeta?.models ?? []).map((value) => ({ value, label: value }));
  const engineOptions = (makeMeta?.engines ?? ["2.0L Turbo", "2.5L I4", "3.0L V6"]).map((value) => ({ value, label: value }));
  const trimOptions = (makeMeta?.trims ?? ["Base", "Sport", "Premium", "Limited"]).map((value) => ({ value, label: value }));
  const transmissionLabel = TRANSMISSION_OPTIONS.find((o) => o.value === transmissionType)?.label ?? "";
  const drivetrainLabel = DRIVETRAIN_OPTIONS.find((o) => o.value === drivetrain)?.label ?? "";

  const isValid =
    nickname.trim().length > 0 &&
    make.trim().length > 0 &&
    model.trim().length > 0 &&
    /^\d{4}$/.test(year) &&
    parseInt(year, 10) >= 1950 &&
    parseInt(year, 10) <= CURRENT_YEAR + 1 &&
    insuranceDocUri.trim().length > 0 &&
    registrationStickerUri.trim().length > 0;

  const openPicker = (
    label: string,
    currentValue: string,
    options: Array<{ value: string; label: string }>,
    onSelect: (next: string) => void,
  ) => {
    setPickerLabel(label);
    setPickerValue(currentValue);
    setPickerOptions(options);
    setPickerOnSelect(() => onSelect);
    setPickerVisible(true);
  };

  const pickInsurance = async () => {
    const picked = await pickImageFromGallery();
    if (!picked) return;
    setInsuranceDocUri(picked.uri);
    haptic.selection();
  };

  const pickRegistration = async () => {
    const picked = await pickImageFromGallery();
    if (!picked) return;
    setRegistrationStickerUri(picked.uri);
    haptic.selection();
  };

  const handleSave = async () => {
    if (!isValid) {
      haptic.error();
      return;
    }

    const vehiclePayload: Omit<Vehicle, "id"> = {
      nickname: nickname.trim(),
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
      Alert.alert("Could not save vehicle", err.message);
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
      Alert.alert("Could not save vehicle", "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!existing) return;
    const doDelete = async () => {
      const resolved = await resolveAuthSession(user, (err) => {
        Alert.alert("Could not delete vehicle", err.message);
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
        Alert.alert("Could not delete vehicle", "Please try again.");
      } finally {
        setSaving(false);
      }
    };
    if (Platform.OS === "web") {
      doDelete();
    } else {
      Alert.alert("Delete vehicle", "This action cannot be undone.", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: doDelete },
      ]);
    }
  };

  return (
    <ScreenContainer edges={["top", "left", "right"]} style={{ backgroundColor: "#040B1B" }}>
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

        <Field label="Nickname" value={nickname} onChangeText={setNickname} placeholder="Daily Driver" />

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
              (next) => setModel(next),
            )
          }
        />
        <SelectField
          label="Engine"
          value={engineSize}
          placeholder={make ? "Select engine" : "Select make first"}
          disabled={!make}
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
          label="Trim"
          value={trim}
          placeholder={make ? "Select trim" : "Select make first"}
          disabled={!make}
          onPress={() =>
            openPicker(
              "Select Trim",
              trim,
              trimOptions,
              (next) => setTrim(next),
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
          label="Insurance document"
          value={insuranceDocUri ? "Uploaded" : "Tap to upload"}
          onPress={pickInsurance}
        />
        <UploadRow
          label="Registration sticker"
          value={registrationStickerUri ? "Uploaded" : "Tap to upload"}
          onPress={pickRegistration}
        />
        <Text style={styles.hintText}>
          Vehicle approval is required for mechanics to go online.
        </Text>

        <View style={{ height: 8 }} />
        <PrimaryButton
          title={saving ? "Saving..." : existing ? "Save changes" : "Add vehicle"}
          onPress={handleSave}
          disabled={!isValid || saving}
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
  options: Array<{ value: string; label: string }>;
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

function UploadRow({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <Pressable onPress={onPress} style={({ pressed }) => [styles.uploadBtn, pressed && { opacity: 0.8 }]}>
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
