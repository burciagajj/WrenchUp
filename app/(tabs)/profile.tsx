/**
 * Profile Screen (v1.5)
 * Personal info, vehicle management, and logout
 */

import { useRouter, useFocusEffect } from "expo-router";
import { safeReplace } from "@/lib/safe-router";
import { useState, useEffect, useCallback } from "react";
import { ScreenContainer } from "@/components/screen-container";
import { ScreenMenuHeader } from "@/components/screen-menu-header";
import { useStore } from "@/lib/store";
import { useAuth, useClearUserData, useLoadUserData } from "@/lib/auth-context";
import { useT } from "@/hooks/use-locale";
import { useColors } from "@/hooks/use-colors";
import { supabaseUserData } from "@/lib/_core/supabase-user-data";
import { saveProfileAvatar } from "@/lib/profile-avatar";
import { resolveAuthSession } from "@/lib/resolve-auth-session";
import { useImagePicker } from "@/hooks/use-image-picker";
import { Avatar } from "@/components/avatar";
import { getSessionToken } from "@/lib/auth-context";
import {
  ScrollView,
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
} from "react-native";
import * as Haptics from "expo-haptics";

export default function ProfileScreen() {
  const router = useRouter();
  const { state, dispatch } = useStore();
  const { user, signOut, isLoading: isAuthLoading } = useAuth();
  const loadUserData = useLoadUserData();
  const t = useT();
  const colors = useColors();

  // Personal info state
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(state.userName || "");
  const [email, setEmail] = useState("");
  const [editingPassword, setEditingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Vehicle state
  const [editingVehicle, setEditingVehicle] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState(state.selectedVehicleId);

  // Photo upload state
  const [photoUrl, setPhotoUrl] = useState(state.photoUrl || "");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const { pickProfileImage } = useImagePicker();

  // Loading state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const profileSyncing = state.userDataStatus === "loading";

  // Sync email when user changes
  useEffect(() => {
    if (user?.email) {
      setEmail(user.email);
      console.log("[ProfileScreen] Email synced:", user.email);
    }
  }, [user]);

  // Refresh profile + vehicles when the tab is focused (uses in-memory token first)
  useFocusEffect(
    useCallback(() => {
      if (!user?.id) return;

      let cancelled = false;
      (async () => {
        try {
          const token = await getSessionToken();
          if (cancelled || !token) return;
          setSessionToken(token);
          await loadUserData(token, user);
        } catch (err) {
          console.error("[ProfileScreen] Failed to refresh profile:", err);
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [user?.id, loadUserData, user])
  );

  // Keep local UI in sync with store after LOAD_USER_DATA
  useEffect(() => {
    setSelectedVehicleId(state.selectedVehicleId);
  }, [state.selectedVehicleId]);

  useEffect(() => {
    setName(state.userName || "");
  }, [state.userName]);

  // Sync avatar from store after LOAD_USER_DATA (logout → login persistence)
  useEffect(() => {
    setPhotoUrl(state.photoUrl || "");
    console.log("[ProfileScreen] Avatar synced from store:", state.photoUrl ? "yes" : "no");
  }, [state.photoUrl]);

  // Handle photo upload — camera/gallery → Storage → avatar_url → reload store
  const handlePhotoUpload = async () => {
    if (!user?.id) {
      setError("Not authenticated. Please log in again.");
      return;
    }

    try {
      setUploadingPhoto(true);
      setError(null);

      const image = await pickProfileImage();
      if (!image) {
        return;
      }

      const resolved = await resolveAuthSession(user, (err) => setError(err.message));
      if (!resolved) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }
      const { sessionToken: token } = resolved;
      setSessionToken(token);

      console.log("[ProfileScreen] Uploading profile photo...", { size: image.base64.length });
      const publicUrl = await saveProfileAvatar(user.id, image, token);

      setPhotoUrl(publicUrl);
      dispatch({ type: "SET_PHOTO_URL", payload: publicUrl });

      await loadUserData(token, user);
      console.log("[ProfileScreen] Profile photo saved and store refreshed");

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      console.error("[ProfileScreen] Photo upload failed:", err);
      setError(err?.message || "Failed to upload photo");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setUploadingPhoto(false);
    }
  };

  // Stats
  const completedCount = state.jobs.filter((j) => j.status === "completed").length;
  const totalSpent = state.jobs
    .filter((j) => j.status === "completed")
    .reduce((sum, j) => sum + j.fare.total + (j.tip ?? 0), 0);

  const selectedVehicle = state.vehicles.find((v) => v.id === selectedVehicleId);

  // Persist full_name to Supabase (same session refresh pattern as vehicles)
  const handleSaveName = async () => {
    if (!name.trim()) {
      setError("Name cannot be empty");
      return;
    }

    if (!user?.id) {
      setError("Not authenticated. Please log in again.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const resolved = await resolveAuthSession(user, (err) => setError(err.message));
      if (!resolved) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }
      const { sessionToken: token } = resolved;
      setSessionToken(token);

      console.log("[ProfileScreen] Saving full_name to Supabase:", name.trim());
      await supabaseUserData.updateProfile(
        user.id,
        { full_name: name.trim(), email: user.email },
        token,
        user.email
      );

      dispatch({ type: "SET_USER_NAME", payload: name.trim() });
      await loadUserData(token, user);

      setEditingName(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      console.error("[ProfileScreen] Name save failed:", err);
      setError(err?.message || "Failed to save name");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async () => {
    setError(null);

    if (!currentPassword.trim()) {
      setError("Current password is required");
      return;
    }
    if (!newPassword.trim() || newPassword.length < 8) {
      setError("New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      if (!user || !user.id) {
        console.error("[ProfileScreen] Not authenticated:", { user });
        setError("Not authenticated. Please log in again.");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setLoading(false);
        return;
      }

      let token = sessionToken ?? (await getSessionToken());

      if (!token) {
        console.error("[ProfileScreen] No session token available");
        setError("Session expired. Please log in again.");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setLoading(false);
        return;
      }

      console.log("[ProfileScreen] Changing password for user:", user.id);
      // Change password via Supabase
      await supabaseUserData.changePassword(newPassword, token);

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setEditingPassword(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", "Password changed successfully");
    } catch (err: any) {
      const errorMsg = err?.message || "Failed to change password";
      setError(errorMsg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectVehicle = (vehicleId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    dispatch({ type: "SELECT_VEHICLE", payload: vehicleId });
    setSelectedVehicleId(vehicleId);
  };

  const handleAddVehicle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/vehicle-form");
  };

  const clearUserData = useClearUserData();

  const handleLogout = async () => {
    Alert.alert("Log Out", "Are you sure you want to log out?", [
      { text: "Cancel", onPress: () => {} },
      {
        text: "Log Out",
        onPress: async () => {
          setLoading(true);
          try {
            clearUserData();
            await signOut();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            safeReplace("/auth/signin");
          } catch (err) {
            setError("Failed to log out");
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          } finally {
            setLoading(false);
          }
        },
        style: "destructive",
      },
    ]);
  };

  return (
    <ScreenContainer className="bg-background" edges={["left", "right", "bottom"]}>
      <ScreenMenuHeader title={t("tabs.profile")} />
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 32, paddingHorizontal: 20 }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View className="mb-8 mt-4">
          <Text className="text-2xl font-bold text-foreground">Profile</Text>
          {isAuthLoading || profileSyncing ? (
            <View className="flex-row items-center gap-2 mt-2">
              <ActivityIndicator size="small" color={colors.primary} />
              <Text className="text-base text-muted">Loading profile…</Text>
            </View>
          ) : user?.email ? (
            <Text className="text-base text-muted mt-2">{user.email}</Text>
          ) : (
            <Text className="text-base text-error mt-2">Not authenticated</Text>
          )}
        </View>

        {/* Photo Section */}
        <View className="mb-8 items-center">
          <Pressable onPress={handlePhotoUpload} disabled={uploadingPhoto}>
            <View className="relative">
              <Avatar name={name} url={photoUrl} size={120} />
              {uploadingPhoto && (
                <View className="absolute inset-0 bg-black/40 rounded-full items-center justify-center">
                  <ActivityIndicator color="#fff" size="large" />
                </View>
              )}
            </View>
          </Pressable>
          <Text className="text-sm text-muted mt-3">Tap to change — camera or gallery</Text>
        </View>

        {/* Error Message */}
        {error && (
          <View className="bg-error/10 border border-error rounded-lg p-4 mb-6">
            <Text className="text-error text-sm">{error}</Text>
          </View>
        )}

        {/* Personal Information Section */}
        <View className="mb-8">
          <Text className="text-lg font-semibold text-foreground mb-4">Personal Information</Text>

          {/* Name */}
          <View className="bg-surface rounded-lg p-4 mb-4 border border-border">
            <Text className="text-sm text-muted mb-2">Name</Text>
            {editingName ? (
              <View className="gap-3">
                <TextInput
                  className="bg-background border border-border rounded-lg px-4 py-3 text-foreground"
                  placeholder="Enter your name"
                  placeholderTextColor={colors.muted}
                  value={name}
                  onChangeText={setName}
                  editable={!loading}
                />
                <View className="flex-row gap-2">
                  <Pressable
                    className="flex-1 bg-primary rounded-lg py-3 items-center"
                    onPress={handleSaveName}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text className="text-white font-semibold">Save</Text>
                    )}
                  </Pressable>
                  <Pressable
                    className="flex-1 bg-border rounded-lg py-3 items-center"
                    onPress={() => {
                      setEditingName(false);
                      setName(state.userName || "");
                    }}
                    disabled={loading}
                  >
                    <Text className="text-foreground font-semibold">Cancel</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                className="flex-row justify-between items-center"
                onPress={() => setEditingName(true)}
              >
                <Text className="text-foreground text-base">
                  {profileSyncing && !name ? "Loading…" : name || "Not set"}
                </Text>
                <Text className="text-primary">Edit</Text>
              </Pressable>
            )}
          </View>

          {/* Email */}
          <View className="bg-surface rounded-lg p-4 mb-4 border border-border">
            <Text className="text-sm text-muted mb-2">Email</Text>
            <Text className="text-foreground text-base">{email}</Text>
            <Text className="text-xs text-muted mt-2">Email cannot be changed</Text>
          </View>

          {/* Password */}
          <View className="bg-surface rounded-lg p-4 border border-border">
            <Text className="text-sm text-muted mb-2">Password</Text>
            {editingPassword ? (
              <View className="gap-3">
                <TextInput
                  className="bg-background border border-border rounded-lg px-4 py-3 text-foreground"
                  placeholder="Current password"
                  placeholderTextColor={colors.muted}
                  secureTextEntry
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  editable={!loading}
                />
                <TextInput
                  className="bg-background border border-border rounded-lg px-4 py-3 text-foreground"
                  placeholder="New password (min 8 chars)"
                  placeholderTextColor={colors.muted}
                  secureTextEntry
                  value={newPassword}
                  onChangeText={setNewPassword}
                  editable={!loading}
                />
                <TextInput
                  className="bg-background border border-border rounded-lg px-4 py-3 text-foreground"
                  placeholder="Confirm new password"
                  placeholderTextColor={colors.muted}
                  secureTextEntry
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  editable={!loading}
                />
                <View className="flex-row gap-2">
                  <Pressable
                    className="flex-1 bg-primary rounded-lg py-3 items-center"
                    onPress={handleChangePassword}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text className="text-white font-semibold">Save</Text>
                    )}
                  </Pressable>
                  <Pressable
                    className="flex-1 bg-border rounded-lg py-3 items-center"
                    onPress={() => {
                      setEditingPassword(false);
                      setCurrentPassword("");
                      setNewPassword("");
                      setConfirmPassword("");
                    }}
                    disabled={loading}
                  >
                    <Text className="text-foreground font-semibold">Cancel</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                className="flex-row justify-between items-center"
                onPress={() => setEditingPassword(true)}
              >
                <Text className="text-foreground text-base">••••••••</Text>
                <Text className="text-primary">Change</Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Vehicles Section */}
        <View className="mb-8">
          <View className="flex-row justify-between items-center mb-4">
            <Text className="text-lg font-semibold text-foreground">Vehicles</Text>
            <Pressable onPress={handleAddVehicle} className="bg-primary rounded-lg px-4 py-2">
              <Text className="text-white font-semibold text-sm">Add Vehicle</Text>
            </Pressable>
          </View>

          {profileSyncing && state.vehicles.length === 0 ? (
            <View className="bg-surface rounded-lg p-6 items-center border border-border">
              <ActivityIndicator color={colors.primary} />
              <Text className="text-muted text-center mt-3">Loading vehicles…</Text>
            </View>
          ) : state.vehicles.length === 0 ? (
            <View className="bg-surface rounded-lg p-6 items-center border border-border">
              <Text className="text-muted text-center">No vehicles added yet</Text>
              <Text className="text-muted text-sm mt-2">Add your first vehicle to get started</Text>
            </View>
          ) : (
            <View className="gap-3">
              {state.vehicles.map((vehicle) => (
                <Pressable
                  key={vehicle.id}
                  onPress={() => handleSelectVehicle(vehicle.id)}
                  className={`rounded-lg p-4 border ${
                    selectedVehicleId === vehicle.id
                      ? "bg-primary/10 border-primary"
                      : "bg-surface border-border"
                  }`}
                >
                  <View className="flex-row justify-between items-start">
                    <View className="flex-1">
                      <Text className="text-foreground font-semibold">{vehicle.nickname}</Text>
                      <Text className="text-muted text-sm">
                        {vehicle.year} {vehicle.make} {vehicle.model}
                      </Text>
                      {vehicle.color && (
                        <Text className="text-muted text-sm mt-1">Color: {vehicle.color}</Text>
                      )}
                    </View>
                    {selectedVehicleId === vehicle.id && (
                      <View className="bg-primary rounded-full w-6 h-6 items-center justify-center">
                        <Text className="text-white text-sm">✓</Text>
                      </View>
                    )}
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* Stats Section */}
        <View className="mb-8">
          <Text className="text-lg font-semibold text-foreground mb-4">Statistics</Text>
          <View className="flex-row gap-4">
            <View className="flex-1 bg-surface rounded-lg p-4 border border-border items-center">
              <Text className="text-2xl font-bold text-primary">{completedCount}</Text>
              <Text className="text-muted text-sm mt-1">Completed Rides</Text>
            </View>
            <View className="flex-1 bg-surface rounded-lg p-4 border border-border items-center">
              <Text className="text-2xl font-bold text-primary">${totalSpent.toFixed(2)}</Text>
              <Text className="text-muted text-sm mt-1">Total Spent</Text>
            </View>
          </View>
        </View>

        {/* Logout Button */}
        <Pressable
          onPress={handleLogout}
          disabled={loading}
          className="bg-error/10 border border-error rounded-lg py-4 items-center mb-8"
        >
          {loading ? (
            <ActivityIndicator color="#EF4444" />
          ) : (
            <Text className="text-error font-semibold text-base">Log Out</Text>
          )}
        </Pressable>
      </ScrollView>
    </ScreenContainer>
  );
}
