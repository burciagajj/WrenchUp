/**
 * Profile Screen (v1.5)
 * Personal info, vehicle management, and logout
 */

import { useRouter } from "expo-router";
import { useState, useEffect } from "react";
import { ScreenContainer } from "@/components/screen-container";
import { useStore } from "@/lib/store";
import { useAuth, useClearUserData } from "@/lib/auth-context";
import { useT } from "@/hooks/use-locale";
import { useColors } from "@/hooks/use-colors";
import { supabaseUserData } from "@/lib/_core/supabase-user-data";
import { supabaseStorage } from "@/lib/_core/supabase-storage";
import { useImagePicker } from "@/hooks/use-image-picker";
import { Avatar } from "@/components/avatar";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ScrollView,
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import * as Haptics from "expo-haptics";

export default function ProfileScreen() {
  const router = useRouter();
  const { state, dispatch } = useStore();
  const { user, signOut, isLoading: isAuthLoading } = useAuth();
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
  const [avatar_url, setPhotoUrl] = useState(state.avatar_url || "");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const { pickImage } = useImagePicker();

  // Loading state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);

  // Sync email when user changes
  useEffect(() => {
    if (user?.email) {
      setEmail(user.email);
      console.log("[ProfileScreen] Email synced:", user.email);
    }
  }, [user]);

  // Load session token on mount
  useEffect(() => {
    const loadSessionToken = async () => {
      try {
        let token: string | null = null;
        if (Platform.OS === "web") {
          token = await AsyncStorage.getItem("wrenchup_session_token");
        } else {
          token = await SecureStore.getItemAsync("wrenchup_session_token");
        }
        setSessionToken(token);
        console.log("[ProfileScreen] Session token loaded:", token ? "✓ Found" : "✗ Not found");
      } catch (err) {
        console.error("[ProfileScreen] Failed to load session token:", err);
      }
    }
    loadSessionToken();
  }, []);

  // Fetch user's vehicles on mount or when user/token changes
  useEffect(() => {
    const fetchUserVehicles = async () => {
      if (!user || !user.id || !sessionToken) {
        console.log("[ProfileScreen] Skipping vehicle fetch - missing user/token", {
          hasUser: !!user,
          hasUserId: !!user?.id,
          hasToken: !!sessionToken,
        });
        return;
      }

      try {
        console.log("[ProfileScreen] Fetching vehicles for user:", user.id);
        const vehicles = await supabaseUserData.getUserVehicles(user.id, sessionToken);
        console.log("[ProfileScreen] Fetched vehicles:", vehicles);

        // Update store with fetched vehicles
        if (vehicles && vehicles.length > 0) {
          const mappedVehicles = vehicles.map((v: any) => ({
            id: v.id,
            nickname: v.nickname,
            year: v.year,
            make: v.make,
            model: v.model,
            color: v.color || "",
            plate: v.plate || "",
          }));

          // Use LOAD_USER_DATA to update vehicles in store
          const firstVehicleId = mappedVehicles[0]?.id ?? null;
          dispatch({
            type: "LOAD_USER_DATA",
            payload: {
              userName: state.userName,
              vehicles: mappedVehicles,
              selectedVehicleId: firstVehicleId,
            },
          });

          // Update local state
          setSelectedVehicleId(firstVehicleId);
        }
      } catch (err: any) {
        console.error("[ProfileScreen] Failed to fetch vehicles:", err);
        // Don't show error to user - vehicles might not exist yet
      }
    };

    fetchUserVehicles();
  }, [user?.id, sessionToken, dispatch]);

  // Handle photo upload
  const handlePhotoUpload = async () => {
    if (!user || !sessionToken) {
      setError("Not authenticated. Please log in again.");
      return;
    }

    try {
      setUploadingPhoto(true);
      setError(null);

      const image = await pickImage();
      if (!image) {
        setUploadingPhoto(false);
        return;
      }

      console.log("[ProfileScreen] Uploading photo...", { size: image.base64.length });

      // Upload to Supabase Storage
      const uploadResult = await supabaseStorage.uploadProfilePhoto(
        user.id,
        image.base64,
        image.mimeType,
        sessionToken
      );

      console.log("[ProfileScreen] Photo uploaded:", uploadResult.publicUrl);

      // Update profile with photo URL
      await supabaseUserData.updateProfilePhoto(user.id, uploadResult.publicUrl, sessionToken);

      // Update local state
      setPhotoUrl(uploadResult.publicUrl);
      dispatch({
        type: "SET_PHOTO_URL",
        payload: uploadResult.publicUrl,
      });

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

  const handleSaveName = async () => {
    if (!name.trim()) {
      setError("Name cannot be empty");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      
      if (!user || !user.id) {
        setError("Not authenticated. Please log in again.");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setLoading(false);
        return;
      }

      // Use stored session token or try to get it
      let token = sessionToken;
      if (!token) {
        console.log("[ProfileScreen] Session token not in state, fetching...");
        if (Platform.OS === "web") {
          token = await AsyncStorage.getItem("wrenchup_session_token");
        } else {
          token = await SecureStore.getItemAsync("wrenchup_session_token");
        }
      }

      if (!token) {
        setError("Session expired. Please log in again.");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setLoading(false);
        return;
      }

      // Save to Supabase
      console.log("[ProfileScreen] Saving name to Supabase:", name.trim());
      await supabaseUserData.updateProfile(
        user.id,
        { full_name: name.trim() },
        token,
        user.email
      );

      // Update local state
      dispatch({ type: "SET_USER_NAME", payload: name.trim() });
      setEditingName(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      const errorMsg = err?.message || "Failed to save name";
      console.error("[ProfileScreen] Save name error:", err);
      setError(errorMsg);
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

      // Use stored session token or try to get it
      let token = sessionToken;
      if (!token) {
        console.log("[ProfileScreen] Session token not in state, fetching...");
        if (Platform.OS === "web") {
          token = await AsyncStorage.getItem("wrenchup_session_token");
        } else {
          token = await SecureStore.getItemAsync("wrenchup_session_token");
        }
      }

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
            router.replace("/auth/signin");
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
    <ScreenContainer className="bg-background">
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View className="mb-8 mt-6">
          <Text className="text-4xl font-bold text-foreground">Profile</Text>
          {isAuthLoading ? (
            <Text className="text-base text-muted mt-2">Loading...</Text>
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
              <Avatar name={name} url={avatar_url} size={120} />
              {uploadingPhoto && (
                <View className="absolute inset-0 bg-black/40 rounded-full items-center justify-center">
                  <ActivityIndicator color="#fff" size="large" />
                </View>
              )}
            </View>
          </Pressable>
          <Text className="text-sm text-muted mt-3">Tap to change photo</Text>
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
                <Text className="text-foreground text-base">{name || "Not set"}</Text>
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

          {state.vehicles.length === 0 ? (
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
