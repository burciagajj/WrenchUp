/**
 * Profile Completion Screen (v1.6+)
 * Post-signup onboarding: full name, profile photo, vehicle (customers) or bio (mechanics).
 * Uses session refresh + loadUserData (same pattern as vehicle persistence).
 */

import { useState, useEffect } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { router, Redirect, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { Avatar } from "@/components/avatar";
import { PhoneNumberInput } from "@/components/phone-number-input";
import { useStore } from "@/lib/store";
import { useAuth, useLoadUserData, getSessionToken } from "@/lib/auth-context";
import { supabaseUserData } from "@/lib/_core/supabase-user-data";
import { supabaseAuth } from "@/lib/_core/supabase-auth";
import { resolveAuthSession } from "@/lib/resolve-auth-session";
import { saveProfileAvatar } from "@/lib/profile-avatar";
import { useImagePicker, type PickedImage } from "@/hooks/use-image-picker";
import { userHasVehicles } from "@/lib/vehicles";
import { uploadMechanicDoc } from "@/lib/upload-mechanic-doc";
import { normalizeFullName, validateFullName } from "@/lib/identity-validation";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolateColor,
} from "react-native-reanimated";

export default function ProfileCompleteScreen() {
  const { state } = useStore();
  const { user, isLoading: isAuthLoading } = useAuth();
  const { prefillName } = useLocalSearchParams<{ prefillName?: string }>();
  const loadUserData = useLoadUserData();
  const { pickFacePhoto, pickDocumentImage } = useImagePicker();
  const isCustomer = user?.role === "customer";

  // Shared profile fields (both roles). Prefer the name already captured at
  // account creation (auth user_metadata, available immediately — no DB
  // round-trip) over state.userName, which is empty until the profile row's
  // full_name is set. Without this, a fresh signup lands here with blank
  // name fields even though the user already typed their name one screen
  // ago, and re-typing the exact same thing "still" failed validation
  // because the field the button actually reads was empty, not what the
  // user visually associated with "I already entered this."
  const [fullName, setFullName] = useState(user?.fullName || state.userName || "");
  const [displayName, setDisplayName] = useState(user?.displayName || user?.fullName || state.userName || "");
  const [phoneNumber, setPhoneNumber] = useState(state.phoneNumber || "");
  // Always null here now — this screen no longer verifies phone (see comment
  // above the removed name/phone block below); still written to the profile
  // as-is so a later verification from Profile settings isn't clobbered.
  const [phoneVerifiedAt] = useState<string | null>(null);
  const [pendingAvatar, setPendingAvatar] = useState<PickedImage | null>(null);
  const [avatarPreviewUri, setAvatarPreviewUri] = useState<string | null>(state.photoUrl || null);
  const [pickingPhoto, setPickingPhoto] = useState(false);

  // Customer: vehicle form
  const [vehicleYear, setVehicleYear] = useState("");
  const [vehicleMake, setVehicleMake] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleColor, setVehicleColor] = useState("");

  // Mechanic: verification documents
  const [licenseDoc, setLicenseDoc] = useState<PickedImage | null>(null);
  const [insuranceDoc, setInsuranceDoc] = useState<PickedImage | null>(null);
  const [businessDoc, setBusinessDoc] = useState<PickedImage | null>(null);
  const [attestedNoCriminalRecord, setAttestedNoCriminalRecord] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof prefillName !== "string") return;
    const trimmed = prefillName.trim();
    if (!trimmed) return;
    setFullName((prev) => (prev.includes("@") || prev.trim().length === 0 ? trimmed : prev));
    setDisplayName((prev) => (prev.includes("@") || prev.trim().length === 0 ? trimmed : prev));
  }, [prefillName]);

  // Belt-and-suspenders for the initial useState above: if `user` was still
  // null on first render (auth still hydrating) but resolves with a name a
  // moment later, backfill it — but only into fields the person hasn't
  // already touched, same guard as the prefillName effect.
  useEffect(() => {
    const authFullName = user?.fullName?.trim();
    const authDisplayName = (user?.displayName || user?.fullName)?.trim();
    if (authFullName) {
      setFullName((prev) => (prev.includes("@") || prev.trim().length === 0 ? authFullName : prev));
    }
    if (authDisplayName) {
      setDisplayName((prev) => (prev.includes("@") || prev.trim().length === 0 ? authDisplayName : prev));
    }
  }, [user?.fullName, user?.displayName]);

  // Require a real session — do not allow onboarding without signing in
  useEffect(() => {
    if (!isAuthLoading && !user) {
      router.replace("/auth/signin");
    }
  }, [isAuthLoading, user]);

  // Skip vehicle form if customer already has vehicles — still sync profile from Supabase
  useEffect(() => {
    const checkExistingVehicles = async () => {
      if (!user?.id || !isCustomer) return;

      try {
        const hasVehicles = await userHasVehicles(user.id);
        if (hasVehicles) {
          console.log("[ProfileComplete] Has vehicles → syncing profile and skipping");
          const token = await getSessionToken();
          if (token) await loadUserData(token, user);
          // Route through the shared gate, not straight to (tabs) — it
          // bounces through automatically once approved, but still catches
          // pre-existing accounts that never got an approved photo on file.
          router.replace("/approval-pending");
        }
      } catch (err) {
        console.error("[ProfileComplete] Error checking vehicles:", err);
      }
    };

    checkExistingVehicles();
  }, [user?.id, isCustomer, loadUserData, user]);

  const handlePickPhoto = async () => {
    if (loading || pickingPhoto) return;
    setPickingPhoto(true);
    setError(null);
    try {
      // Camera-only — no gallery option. This becomes the account's required,
      // admin-reviewed profile photo (see migration 034), so it must be a
      // live shot, not an existing image.
      const image = await pickFacePhoto();
      if (image) {
        setPendingAvatar(image);
        setAvatarPreviewUri(image.uri);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        console.log("[ProfileComplete] Face photo captured (uploads on save)");
      }
    } catch (err) {
      console.error("[ProfileComplete] Photo capture failed:", err);
      setError("Could not take photo.");
    } finally {
      setPickingPhoto(false);
    }
  };

  const resolveSessionAndUserId = async () => {
    const resolved = await resolveAuthSession(user, (err) => {
      setError(err.message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    });
    return resolved;
  };

  const saveProfileFields = async (
    userId: string,
    sessionToken: string,
    extra?: { bio?: string }
  ) => {
    await supabaseUserData.updateProfile(
      userId,
      {
        full_name: fullName.trim(),
        display_name: displayName.trim(),
        phone_number: normalizePhoneNumber(phoneNumber),
        phone_verified_at: phoneVerifiedAt,
        email: user?.email,
        ...extra,
      },
      sessionToken,
      user?.email
    );
    if (pendingAvatar) {
      const publicUrl = await saveProfileAvatar(userId, pendingAvatar, sessionToken);
      setAvatarPreviewUri(publicUrl);
      setPendingAvatar(null);
    }
  };

  const validateProfileFields = (): boolean => {
    setError(null);
    if (!pendingAvatar && !avatarPreviewUri) {
      setError("Take a photo of your face to continue — this is required for account approval.");
      return false;
    }
    const name = normalizeFullName(fullName);
    const display = displayName.trim();
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    const nameError = validateFullName(name);
    if (nameError) {
      setError(nameError);
      return false;
    }
    if (!display) {
      setError("Display name is required");
      return false;
    }
    if (display.length < 2) {
      setError("Please enter a longer display name.");
      return false;
    }
    if (!normalizedPhone) {
      setError("Phone number is required.");
      return false;
    }
    if (!isValidE164Phone(normalizedPhone)) {
      setError("Enter your phone in international format, like +15551234567.");
      return false;
    }
    // Phone verification is no longer collected on this screen for either
    // role (see the removed name/phone block below) — it can still be done
    // later from Profile settings, so it's not gated here at all anymore.
    return true;
  };

  const validateCustomerForm = (): boolean => {
    if (!validateProfileFields()) return false;

    if (!vehicleYear.trim()) {
      setError("Vehicle year is required");
      return false;
    }
    if (!vehicleMake.trim()) {
      setError("Vehicle make is required");
      return false;
    }
    if (!vehicleModel.trim()) {
      setError("Vehicle model is required");
      return false;
    }

    const year = parseInt(vehicleYear);
    if (isNaN(year) || year < 1990 || year > new Date().getFullYear() + 1) {
      setError("Please enter a valid year");
      return false;
    }

    return true;
  };

  const finishOnboarding = async (sessionToken: string) => {
    if (user?.id) {
      await supabaseUserData.updateProfile(
        user.id,
        { completed_at: new Date().toISOString() },
        sessionToken,
        user.email
      );
      await supabaseAuth.updateUserMetadataWithToken(sessionToken, {
        role: user.role,
        profileCompleted: true,
      });
    }
    if (user) await loadUserData(sessionToken, user);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Both roles now require an admin-approved profile photo (migration 034),
    // and mechanics additionally require approved verification documents.
    // A photo was just submitted (pending_review at minimum), so route
    // through the shared gate rather than assuming approval.
    router.replace("/approval-pending");
  };

  const handleSaveCustomer = async (skipVehicle = false) => {
    if (skipVehicle ? !validateProfileFields() : !validateCustomerForm()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    if (isAuthLoading) {
      setError("Loading authentication...");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const resolved = await resolveSessionAndUserId();
      if (!resolved) {
        setLoading(false);
        return;
      }
      const { sessionToken, userId } = resolved;

      await saveProfileFields(userId, sessionToken);
      // Skipping vehicle entirely is fine — vehicles can be added later from
      // the Vehicles tab before booking. Photo + phone still required above
      // (validateProfileFields), since those gate account approval.
      if (!skipVehicle) {
        await supabaseUserData.addVehicle(
          userId,
          {
            nickname: `${vehicleYear.trim()} ${vehicleMake.trim()} ${vehicleModel.trim()}`.trim(),
            year: parseInt(vehicleYear, 10),
            make: vehicleMake,
            model: vehicleModel,
            color: vehicleColor,
            plate: "",
          },
          sessionToken
        );
      }

      await finishOnboarding(sessionToken);
    } catch (err) {
      console.error("[ProfileComplete] Customer save error:", err);
      setError("Failed to save profile. Please try again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const handleMechanicComplete = async () => {
    if (!validateProfileFields()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    if (!licenseDoc || !insuranceDoc) {
      setError("Please upload both your driver's license and insurance.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    if (!attestedNoCriminalRecord) {
      setError("You must certify your eligibility before continuing.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    if (isAuthLoading || !user?.id) {
      setError("Not authenticated. Please sign up again.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const resolved = await resolveSessionAndUserId();
      if (!resolved) {
        setLoading(false);
        return;
      }
      const { sessionToken, userId } = resolved;

      const [licensePath, insurancePath] = await Promise.all([
        uploadMechanicDoc(userId, sessionToken, "license", licenseDoc),
        uploadMechanicDoc(userId, sessionToken, "insurance", insuranceDoc),
      ]);
      const businessPath = businessDoc
        ? await uploadMechanicDoc(userId, sessionToken, "business_license", businessDoc)
        : null;

      await saveProfileFields(userId, sessionToken);
      await supabaseUserData.updateProfile(
        userId,
        {
          verification_status: "pending_review",
          id_document_url: licensePath,
          insurance_document_url: insurancePath,
          business_license_document_url: businessPath,
          mechanic_attested_no_criminal_record: true,
          mechanic_attested_at: new Date().toISOString(),
        },
        sessionToken,
        user.email
      );
      await finishOnboarding(sessionToken);
    } catch (err) {
      console.error("[ProfileComplete] Mechanic save error:", err);
      setError("Failed to save profile. Please try again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  if (isAuthLoading) {
    return (
      <ScreenContainer containerClassName="bg-background" className="items-center justify-center">
        <ActivityIndicator size="large" color="#F97316" />
      </ScreenContainer>
    );
  }

  if (!user) {
    return <Redirect href="/auth/signin" />;
  }

  return (
    <ScreenContainer containerClassName="bg-background">
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
          <Text style={{ fontSize: 28, fontWeight: "800", color: "#F8FAFC", marginBottom: 8 }}>
            {isCustomer ? "Set Up Your Profile" : "Complete Your Profile"}
          </Text>
          <Text style={{ fontSize: 14, color: "#94A3B8", lineHeight: 20 }}>
            {isCustomer
              ? "Add your photo and vehicle"
              : "Add your photo and verification docs to request approval"}
          </Text>
        </View>

        {error && (
          <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
            <View style={{ backgroundColor: "#3B0D0D", borderRadius: 12, padding: 12, borderLeftWidth: 4, borderLeftColor: "#DC2626" }}>
              <Text style={{ color: "#FCA5A5", fontSize: 14, fontWeight: "600" }}>{error}</Text>
            </View>
          </View>
        )}

        {/* Avatar + full name (both roles) */}
        <View style={{ paddingHorizontal: 20, marginTop: 24, alignItems: "center" }}>
          <Pressable onPress={handlePickPhoto} disabled={loading || pickingPhoto}>
            <View style={{ position: "relative" }}>
              <Avatar name={fullName || "User"} url={avatarPreviewUri ?? undefined} size={100} />
              {(pickingPhoto || loading) && (
                <View
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: "rgba(0,0,0,0.35)",
                    borderRadius: 50,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <ActivityIndicator color="#fff" />
                </View>
              )}
            </View>
          </Pressable>
          <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 8, textAlign: "center" }}>
            Tap to take a photo of your face — required, camera only
          </Text>
          {pendingAvatar ? (
            <Text style={{ fontSize: 12, color: "#F97316", marginTop: 4 }}>Photo uploads when you save, then goes to admin review</Text>
          ) : null}
        </View>

        {/* Name was already captured at signup (see signup-role-flow.tsx) and
            pre-fills reliably from auth user_metadata above. Phone number
            was also captured at signup, but only into auth metadata — it
            isn't synced into state.phoneNumber until after this screen's
            own save completes, so the pre-fill here can be empty even
            though a number was already typed. Shown here (editable, not
            just silently carried through) so that gap never leaves someone
            stuck on a "Phone number is required" error with no field to
            fix it. */}
        <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
          <Text style={{ fontSize: 13, fontWeight: "700", color: "#94A3B8", marginBottom: 6 }}>Phone Number</Text>
          <PhoneNumberInput value={phoneNumber} onChangeValue={setPhoneNumber} editable={!loading} />
        </View>

        {isCustomer ? (
          <View style={{ paddingHorizontal: 20, marginTop: 24, gap: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: "#F8FAFC" }}>Your Vehicle</Text>
              <Pressable onPress={() => handleSaveCustomer(true)} disabled={loading}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: "#F97316" }}>Skip for now</Text>
              </Pressable>
            </View>
            <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: -12 }}>
              You can add a vehicle later from the Vehicles tab before booking.
            </Text>

            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: "#94A3B8", marginBottom: 6 }}>Year</Text>
                <TextInput
                  placeholder="2020"
                  value={vehicleYear}
                  onChangeText={setVehicleYear}
                  keyboardType="number-pad"
                  editable={!loading}
                  style={{ borderWidth: 1, borderColor: "#374151", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: "#F8FAFC" }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: "#94A3B8", marginBottom: 6 }}>Make</Text>
                <TextInput
                  placeholder="Honda"
                  value={vehicleMake}
                  onChangeText={setVehicleMake}
                  editable={!loading}
                  style={{ borderWidth: 1, borderColor: "#374151", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: "#F8FAFC" }}
                />
              </View>
            </View>

            <View>
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#94A3B8", marginBottom: 6 }}>Model</Text>
              <TextInput
                placeholder="Civic"
                value={vehicleModel}
                onChangeText={setVehicleModel}
                editable={!loading}
                style={{ borderWidth: 1, borderColor: "#374151", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: "#F8FAFC" }}
              />
            </View>

            <View>
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#94A3B8", marginBottom: 6 }}>Color (optional)</Text>
              <TextInput
                placeholder="Blue"
                value={vehicleColor}
                onChangeText={setVehicleColor}
                editable={!loading}
                style={{ borderWidth: 1, borderColor: "#374151", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: "#F8FAFC" }}
              />
            </View>

            <Pressable
              onPress={() => handleSaveCustomer()}
              disabled={loading}
              style={({ pressed }) => ({
                backgroundColor: loading ? "#1F2937" : "#F97316",
                paddingVertical: 14,
                borderRadius: 8,
                alignItems: "center",
                marginTop: 8,
                opacity: pressed ? 0.9 : 1,
              })}
            >
              {loading ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "700" }}>Save & Continue</Text>}
            </Pressable>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 20, marginTop: 24, gap: 16 }}>
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 16, fontWeight: "700", color: "#F8FAFC" }}>Verification Documents</Text>
                <Text style={{ fontSize: 12, fontWeight: "700", color: "#94A3B8" }}>
                  {[licenseDoc, insuranceDoc].filter(Boolean).length} of 2 required
                </Text>
              </View>
              <UploadProgressBar completed={[licenseDoc, insuranceDoc].filter(Boolean).length} total={2} />
              <DocUploadRow
                label="Driver's license"
                value={licenseDoc?.filename}
                onPress={async () => {
                  const picked = await pickDocumentImage();
                  if (picked) {
                    setLicenseDoc(picked);
                    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  }
                }}
                disabled={loading}
              />
              <DocUploadRow
                label="Insurance"
                value={insuranceDoc?.filename}
                onPress={async () => {
                  const picked = await pickDocumentImage();
                  if (picked) {
                    setInsuranceDoc(picked);
                    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  }
                }}
                disabled={loading}
              />
              <DocUploadRow
                label="Business license (optional)"
                value={businessDoc?.filename}
                onPress={async () => {
                  const picked = await pickDocumentImage();
                  if (picked) {
                    setBusinessDoc(picked);
                    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  }
                }}
                disabled={loading}
              />
              <Pressable
                onPress={() => setAttestedNoCriminalRecord((prev) => !prev)}
                style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}
              >
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 4,
                    borderWidth: 1,
                    borderColor: attestedNoCriminalRecord ? "#F97316" : "#94A3B8",
                    backgroundColor: attestedNoCriminalRecord ? "#F97316" : "#1F2937",
                    alignItems: "center",
                    justifyContent: "center",
                    marginTop: 2,
                  }}
                >
                  {attestedNoCriminalRecord ? <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 12 }}>✓</Text> : null}
                </View>
                <Text style={{ flex: 1, fontSize: 13, color: "#94A3B8", lineHeight: 18 }}>
                  I certify my documents are valid and I have no disqualifying criminal record.
                </Text>
              </Pressable>
              <Text style={{ fontSize: 12, color: "#94A3B8" }}>
                Your status will be pending review until approved in admin.
              </Text>
            </View>

            <Pressable
              onPress={handleMechanicComplete}
              disabled={loading}
              style={({ pressed }) => ({
                backgroundColor: loading ? "#1F2937" : "#F97316",
                paddingVertical: 14,
                borderRadius: 8,
                alignItems: "center",
                marginTop: 8,
                opacity: pressed ? 0.9 : 1,
              })}
            >
              {loading ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "700" }}>Complete Profile</Text>}
            </Pressable>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

function UploadProgressBar({ completed, total }: { completed: number; total: number }) {
  const progress = useSharedValue(total > 0 ? completed / total : 0);

  useEffect(() => {
    progress.value = withTiming(total > 0 ? completed / total : 0, { duration: 350 });
  }, [completed, total, progress]);

  const trackStyle = useAnimatedStyle(() => ({
    width: `${Math.round(progress.value * 100)}%`,
    backgroundColor: interpolateColor(progress.value, [0, 1], ["#F97316", "#22C55E"]),
  }));

  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: "#1F2937", overflow: "hidden" }}>
      <Animated.View style={[{ height: "100%", borderRadius: 3 }, trackStyle]} />
    </View>
  );
}

function DocUploadRow({
  label,
  value,
  onPress,
  disabled,
}: {
  label: string;
  value?: string;
  onPress: () => void;
  disabled: boolean;
}) {
  const uploaded = !!value;
  const progress = useSharedValue(uploaded ? 1 : 0);
  const pressScale = useSharedValue(1);

  useEffect(() => {
    progress.value = withSpring(uploaded ? 1 : 0, { damping: 14, stiffness: 180 });
  }, [uploaded, progress]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
    borderColor: interpolateColor(progress.value, [0, 1], ["#374151", "#22C55E"]),
    backgroundColor: interpolateColor(progress.value, [0, 1], ["#1F2937", "#132A1E"]),
  }));

  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: progress.value }],
    opacity: progress.value,
  }));

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => {
        pressScale.value = withSpring(0.97, { damping: 16, stiffness: 260 });
      }}
      onPressOut={() => {
        pressScale.value = withSpring(1, { damping: 16, stiffness: 260 });
      }}
      style={{ opacity: disabled ? 0.6 : 1 }}
    >
      <Animated.View
        style={[
          {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            borderWidth: 1,
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 12,
          },
          containerStyle,
        ]}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: "700", color: "#94A3B8" }}>{label}</Text>
          <Text style={{ marginTop: 4, fontSize: 12, color: value ? "#F1F5F9" : "#94A3B8" }}>
            {value ?? "Tap to upload"}
          </Text>
        </View>
        <Animated.View
          style={[
            {
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: "#22C55E",
              alignItems: "center",
              justifyContent: "center",
              marginLeft: 10,
            },
            checkStyle,
          ]}
        >
          <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 13 }}>✓</Text>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

function normalizePhoneNumber(value: string): string {
  return value.trim().replace(/[^\d+]/g, "");
}

function isValidE164Phone(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value);
}
