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
import { useStore } from "@/lib/store";
import { useAuth, useLoadUserData } from "@/lib/auth-context";
import { supabaseUserData } from "@/lib/_core/supabase-user-data";
import { getSessionToken } from "@/lib/auth-context";
import { resolveAuthSession } from "@/lib/resolve-auth-session";
import { saveProfileAvatar } from "@/lib/profile-avatar";
import { useImagePicker, type PickedImage } from "@/hooks/use-image-picker";
import { userHasVehicles } from "@/lib/vehicles";
import { uploadMechanicDoc } from "@/lib/upload-mechanic-doc";
import * as Haptics from "expo-haptics";

export default function ProfileCompleteScreen() {
  const { state } = useStore();
  const { user, isLoading: isAuthLoading } = useAuth();
  const { prefillName } = useLocalSearchParams<{ prefillName?: string }>();
  const loadUserData = useLoadUserData();
  const { pickProfileImage, pickImageFromGallery } = useImagePicker();
  const isCustomer = user?.role === "customer";

  // Shared profile fields (both roles)
  const [fullName, setFullName] = useState(state.userName || "");
  const [pendingAvatar, setPendingAvatar] = useState<PickedImage | null>(null);
  const [avatarPreviewUri, setAvatarPreviewUri] = useState<string | null>(state.photoUrl || null);
  const [pickingPhoto, setPickingPhoto] = useState(false);

  // Customer: vehicle form
  const [vehicleNickname, setVehicleNickname] = useState("");
  const [vehicleYear, setVehicleYear] = useState("");
  const [vehicleMake, setVehicleMake] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleColor, setVehicleColor] = useState("");

  // Mechanic: optional bio
  const [mechanicBio, setMechanicBio] = useState("");
  const [licenseDoc, setLicenseDoc] = useState<PickedImage | null>(null);
  const [certDoc, setCertDoc] = useState<PickedImage | null>(null);
  const [attestedNoCriminalRecord, setAttestedNoCriminalRecord] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof prefillName !== "string") return;
    const trimmed = prefillName.trim();
    if (!trimmed) return;
    setFullName((prev) => (prev.includes("@") || prev.trim().length === 0 ? trimmed : prev));
  }, [prefillName]);

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
          router.replace("/(tabs)");
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
      const image = await pickProfileImage();
      if (image) {
        setPendingAvatar(image);
        setAvatarPreviewUri(image.uri);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        console.log("[ProfileComplete] Photo selected (uploads on save)");
      }
    } catch (err) {
      console.error("[ProfileComplete] Photo pick failed:", err);
      setError("Could not select photo.");
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
      { full_name: fullName.trim(), email: user?.email, ...extra },
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
    const name = fullName.trim();
    if (!name) {
      setError("Full name is required");
      return false;
    }
    const emailLike = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(name);
    if (emailLike) {
      setError("Please enter your real full name, not your email.");
      return false;
    }
    return true;
  };

  const validateCustomerForm = (): boolean => {
    if (!validateProfileFields()) return false;

    if (!vehicleNickname.trim()) {
      setError("Vehicle nickname is required");
      return false;
    }
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
    if (user) await loadUserData(sessionToken, user);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (user?.role === "mechanic") {
      router.replace("/(tabs)");
      return;
    }
    router.replace("/(tabs)");
  };

  const handleSaveCustomer = async () => {
    if (!validateCustomerForm()) {
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
      await supabaseUserData.addVehicle(
        userId,
        {
          nickname: vehicleNickname,
          year: parseInt(vehicleYear, 10),
          make: vehicleMake,
          model: vehicleModel,
          color: vehicleColor,
          plate: "",
        },
        sessionToken
      );

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
    if (!licenseDoc || !certDoc) {
      setError("Please upload both your driver's license and certification.");
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

      const [licensePath, certPath] = await Promise.all([
        uploadMechanicDoc(userId, sessionToken, "license", licenseDoc),
        uploadMechanicDoc(userId, sessionToken, "certification", certDoc),
      ]);

      await saveProfileFields(userId, sessionToken, { bio: mechanicBio });
      await supabaseUserData.updateProfile(
        userId,
        {
          verification_status: "pending_review",
          id_document_url: licensePath,
          certification_document_url: certPath,
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
      <ScreenContainer className="items-center justify-center">
        <ActivityIndicator size="large" color="#F97316" />
      </ScreenContainer>
    );
  }

  if (!user) {
    return <Redirect href="/auth/signin" />;
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
          <Text style={{ fontSize: 28, fontWeight: "800", color: "#0F172A", marginBottom: 8 }}>
            {isCustomer ? "Set Up Your Profile" : "Complete Your Profile"}
          </Text>
          <Text style={{ fontSize: 14, color: "#64748B", lineHeight: 20 }}>
            {isCustomer
              ? "Add your name, photo, and vehicle"
              : "Add your name, photo, and verification docs to request approval"}
          </Text>
        </View>

        {error && (
          <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
            <View style={{ backgroundColor: "#FEE2E2", borderRadius: 12, padding: 12, borderLeftWidth: 4, borderLeftColor: "#DC2626" }}>
              <Text style={{ color: "#991B1B", fontSize: 14, fontWeight: "600" }}>{error}</Text>
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
          <Text style={{ fontSize: 12, color: "#64748B", marginTop: 8 }}>Tap — camera or gallery</Text>
          {pendingAvatar ? (
            <Text style={{ fontSize: 12, color: "#F97316", marginTop: 4 }}>Photo uploads when you save</Text>
          ) : null}
        </View>

        <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
          <Text style={{ fontSize: 13, fontWeight: "700", color: "#475569", marginBottom: 6 }}>Full Name</Text>
          <TextInput
            placeholder="Your full name"
            value={fullName}
            onChangeText={setFullName}
            editable={!loading}
            style={{
              borderWidth: 1,
              borderColor: "#E2E8F0",
              borderRadius: 8,
              paddingHorizontal: 12,
              paddingVertical: 10,
              fontSize: 14,
              color: "#0F172A",
            }}
          />
        </View>

        {isCustomer ? (
          <View style={{ paddingHorizontal: 20, marginTop: 24, gap: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#0F172A" }}>Your Vehicle</Text>
            <View>
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#475569", marginBottom: 6 }}>Nickname</Text>
              <TextInput
                placeholder="e.g., My Honda"
                value={vehicleNickname}
                onChangeText={setVehicleNickname}
                editable={!loading}
                style={{ borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: "#0F172A" }}
              />
            </View>

            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: "#475569", marginBottom: 6 }}>Year</Text>
                <TextInput
                  placeholder="2020"
                  value={vehicleYear}
                  onChangeText={setVehicleYear}
                  keyboardType="number-pad"
                  editable={!loading}
                  style={{ borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: "#0F172A" }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: "#475569", marginBottom: 6 }}>Make</Text>
                <TextInput
                  placeholder="Honda"
                  value={vehicleMake}
                  onChangeText={setVehicleMake}
                  editable={!loading}
                  style={{ borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: "#0F172A" }}
                />
              </View>
            </View>

            <View>
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#475569", marginBottom: 6 }}>Model</Text>
              <TextInput
                placeholder="Civic"
                value={vehicleModel}
                onChangeText={setVehicleModel}
                editable={!loading}
                style={{ borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: "#0F172A" }}
              />
            </View>

            <View>
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#475569", marginBottom: 6 }}>Color (optional)</Text>
              <TextInput
                placeholder="Blue"
                value={vehicleColor}
                onChangeText={setVehicleColor}
                editable={!loading}
                style={{ borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: "#0F172A" }}
              />
            </View>

            <Pressable
              onPress={handleSaveCustomer}
              disabled={loading}
              style={({ pressed }) => ({
                backgroundColor: loading ? "#CBD5E1" : "#F97316",
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
            <View>
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#475569", marginBottom: 6 }}>Bio (optional)</Text>
              <TextInput
                placeholder="Tell customers about your experience..."
                value={mechanicBio}
                onChangeText={setMechanicBio}
                multiline
                numberOfLines={4}
                editable={!loading}
                style={{ borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: "#0F172A", textAlignVertical: "top" }}
              />
            </View>

            <View style={{ gap: 10 }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: "#0F172A" }}>Verification Documents</Text>
              <DocUploadRow
                label="Driver's license"
                value={licenseDoc?.filename}
                onPress={async () => {
                  const picked = await pickImageFromGallery();
                  if (picked) setLicenseDoc(picked);
                }}
                disabled={loading}
              />
              <DocUploadRow
                label="Proof of certification"
                value={certDoc?.filename}
                onPress={async () => {
                  const picked = await pickImageFromGallery();
                  if (picked) setCertDoc(picked);
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
                    borderColor: attestedNoCriminalRecord ? "#F97316" : "#CBD5E1",
                    backgroundColor: attestedNoCriminalRecord ? "#F97316" : "#FFFFFF",
                    alignItems: "center",
                    justifyContent: "center",
                    marginTop: 2,
                  }}
                >
                  {attestedNoCriminalRecord ? <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 12 }}>✓</Text> : null}
                </View>
                <Text style={{ flex: 1, fontSize: 13, color: "#475569", lineHeight: 18 }}>
                  I certify my documents are valid and I have no disqualifying criminal record.
                </Text>
              </Pressable>
              <Text style={{ fontSize: 12, color: "#64748B" }}>
                Your status will be pending review until approved in admin.
              </Text>
            </View>

            <Pressable
              onPress={handleMechanicComplete}
              disabled={loading}
              style={({ pressed }) => ({
                backgroundColor: loading ? "#CBD5E1" : "#F97316",
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
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        borderWidth: 1,
        borderColor: "#E2E8F0",
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 12,
        backgroundColor: "#FFFFFF",
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Text style={{ fontSize: 13, fontWeight: "700", color: "#334155" }}>{label}</Text>
      <Text style={{ marginTop: 4, fontSize: 12, color: value ? "#0F172A" : "#94A3B8" }}>
        {value ?? "Tap to upload"}
      </Text>
    </Pressable>
  );
}
