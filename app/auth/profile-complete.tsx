/**
 * Profile Completion Screen (v1.6)
 * Post-signup profile setup for customers and mechanics
 * Now skips for customers who already have vehicles
 */

import { useState, useEffect } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Platform } from "react-native";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ScreenContainer } from "@/components/screen-container";
import { useStore } from "@/lib/store";
import { useAuth, useLoadUserData } from "@/lib/auth-context";
import { supabaseUserData } from "@/lib/_core/supabase-user-data";
import { supabaseAuth } from "@/lib/_core/supabase-auth";
import { getRefreshToken, updateSessionToken } from "@/lib/auth-context";
import * as Haptics from "expo-haptics";

import { userHasVehicles } from "@/lib/vehicles";   // ← Added for vehicle check

export default function ProfileCompleteScreen() {
  const { state, dispatch } = useStore();
  const { user, isLoading: isAuthLoading } = useAuth();
  const loadUserData = useLoadUserData();
  const isCustomer = state.role === "customer";

  // Customer: Vehicle form state
  const [vehicleNickname, setVehicleNickname] = useState("");
  const [vehicleYear, setVehicleYear] = useState("");
  const [vehicleMake, setVehicleMake] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleColor, setVehicleColor] = useState("");

  // Mechanic: Basic info state
  const [mechanicName, setMechanicName] = useState(state.userName || "");
  const [mechanicBio, setMechanicBio] = useState("");

  // Common state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Skip screen if customer already has vehicles
  useEffect(() => {
    const checkExistingVehicles = async () => {
      if (!user?.id || !isCustomer) return;

      try {
        const hasVehicles = await userHasVehicles(user.id);
        if (hasVehicles) {
          console.log("✅ User already has vehicles → skipping Add Vehicle screen");
          router.replace("/(tabs)");
        }
      } catch (err) {
        console.error("Error checking vehicles:", err);
        // Continue to show the screen as fallback
      }
    };

    checkExistingVehicles();
  }, [user?.id, isCustomer]);

  const getSessionToken = async (): Promise<string | null> => {
    try {
      if (Platform.OS === "web") {
        return await AsyncStorage.getItem("wrenchup_session_token");
      } else {
        return await SecureStore.getItemAsync("wrenchup_session_token");
      }
    } catch (err) {
      console.error("[ProfileComplete] Failed to get session token:", err);
      return null;
    }
  };

  const validateCustomerForm = (): boolean => {
    setError(null);

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

  const validateMechanicForm = (): boolean => {
    setError(null);

    if (!mechanicName.trim()) {
      setError("Name is required");
      return false;
    }

    return true;
  };

  const handleSaveCustomer = async () => {
    if (!validateCustomerForm()) return;

    if (isAuthLoading) {
      setError("Loading authentication...");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      let sessionToken = await getSessionToken();
      if (!sessionToken) {
        setError("Session expired. Please log in again.");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setLoading(false);
        return;
      }

      // Refresh session if possible
      try {
        const refreshToken = await getRefreshToken();
        if (refreshToken) {
          const refreshResult = await supabaseAuth.refreshSession(refreshToken);
          sessionToken = refreshResult.access_token;
          await updateSessionToken(sessionToken, refreshResult.refresh_token);
        }
      } catch (refreshErr) {
        console.warn("[ProfileComplete] Session refresh failed, continuing...", refreshErr);
      }

      let userId = user?.id;
      if (!userId) {
        const currentUser = await supabaseAuth.getCurrentUser(sessionToken);
        userId = currentUser?.id;
      }

      if (!userId) {
        setError("Failed to get user information.");
        setLoading(false);
        return;
      }

      await supabaseUserData.addVehicle(
        userId,
        {
          nickname: vehicleNickname,
          year: parseInt(vehicleYear),
          make: vehicleMake,
          model: vehicleModel,
          color: vehicleColor,
          plate: "",
        },
        sessionToken
      );

      await loadUserData(sessionToken);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } catch (err) {
      console.error("[ProfileComplete] Error:", err);
      setError("Failed to save vehicle. Please try again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const handleMechanicComplete = async () => {
    if (!validateMechanicForm()) {
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

      let sessionToken = await getSessionToken();
      if (!sessionToken) {
        setError("Session expired. Please log in again.");
        setLoading(false);
        return;
      }

      // Refresh session logic...
      try {
        const refreshToken = await getRefreshToken();
        if (refreshToken) {
          const refreshResult = await supabaseAuth.refreshSession(refreshToken);
          sessionToken = refreshResult.access_token;
          await updateSessionToken(sessionToken, refreshResult.refresh_token);
        }
      } catch (refreshErr) {
        console.warn("[ProfileComplete] Session refresh failed...", refreshErr);
      }

      await supabaseUserData.updateProfile(
        user.id,
        {
          full_name: mechanicName,
          bio: mechanicBio,
          email: user.email,
        },
        sessionToken
      );

      await loadUserData(sessionToken);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } catch (err) {
      console.error("[ProfileComplete] Error:", err);
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

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
          <Text style={{ fontSize: 28, fontWeight: "800", color: "#0F172A", marginBottom: 8 }}>
            {isCustomer ? "Add Your Vehicle" : "Complete Your Profile"}
          </Text>
          <Text style={{ fontSize: 14, color: "#64748B", lineHeight: 20 }}>
            {isCustomer
              ? "Tell us about your vehicle so mechanics can help you better"
              : "Set up your mechanic profile to start accepting jobs"}
          </Text>
        </View>

        {error && (
          <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
            <View style={{ backgroundColor: "#FEE2E2", borderRadius: 12, padding: 12, borderLeftWidth: 4, borderLeftColor: "#DC2626" }}>
              <Text style={{ color: "#991B1B", fontSize: 14, fontWeight: "600" }}>{error}</Text>
            </View>
          </View>
        )}

        {isCustomer ? (
          <View style={{ paddingHorizontal: 20, marginTop: 24, gap: 16 }}>
            {/* Vehicle Form Fields - unchanged */}
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
              {loading ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "700" }}>Save Vehicle</Text>}
            </Pressable>
          </View>
        ) : (
          /* Mechanic form - unchanged */
          <View style={{ paddingHorizontal: 20, marginTop: 24, gap: 16 }}>
            <View>
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#475569", marginBottom: 6 }}>Full Name</Text>
              <TextInput
                placeholder="Your name"
                value={mechanicName}
                onChangeText={setMechanicName}
                editable={!loading}
                style={{ borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: "#0F172A" }}
              />
            </View>

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