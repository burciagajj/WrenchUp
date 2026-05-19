/**
 * Profile Completion Screen (v1.6)
 * Post-signup profile setup for customers and mechanics
 * Now saves data to Supabase with per-user isolation
 * Customers: Add first vehicle
 * Mechanics: Basic info (name, photo, services)
 */

import { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Platform } from "react-native";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ScreenContainer } from "@/components/screen-container";
import { useStore } from "@/lib/store";
import { useAuth, useLoadUserData } from "@/lib/auth-context";
import { supabaseUserData } from "@/lib/_core/supabase-user-data";
import * as Haptics from "expo-haptics";

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

  const handleCustomerComplete = async () => {
    if (!validateCustomerForm()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    // Wait for auth to load
    if (isAuthLoading) {
      setError("Loading authentication...");
      return;
    }

    if (!user || !user.id) {
      setError("Not authenticated. Please sign up again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      // Get session token
      const sessionToken = await getSessionToken();
      if (!sessionToken) {
        setError("Session expired. Please log in again.");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }

      // Save vehicle to Supabase (per-user)
      await supabaseUserData.addVehicle(
        user.id,
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

      // Load fresh user data from Supabase
      await loadUserData(sessionToken);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Navigate to home
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

    // Wait for auth to load
    if (isAuthLoading) {
      setError("Loading authentication...");
      return;
    }

    if (!user || !user.id) {
      setError("Not authenticated. Please sign up again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      // Get session token
      const sessionToken = await getSessionToken();
      if (!sessionToken) {
        setError("Session expired. Please log in again.");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }

      // Update profile in Supabase (per-user)
      await supabaseUserData.updateProfile(
        user.id,
        {
          name: mechanicName,
          bio: mechanicBio,
        },
        sessionToken
      );

      // Load fresh user data from Supabase
      await loadUserData(sessionToken);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Navigate to home
      router.replace("/(tabs)");
    } catch (err) {
      console.error("[ProfileComplete] Error:", err);
      setError("Failed to save profile. Please try again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  // Show loading screen while auth is loading
  if (isAuthLoading) {
    return (
      <ScreenContainer className="flex items-center justify-center">
        <ActivityIndicator size="large" />
        <Text className="mt-4 text-muted">Loading authentication...</Text>
      </ScreenContainer>
    );
  }

  if (isCustomer) {
    return (
      <ScreenContainer className="bg-background">
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="px-6 py-8">
          {/* Header */}
          <View className="mb-8">
            <Text className="text-3xl font-bold text-foreground mb-2">Add Your Vehicle</Text>
            <Text className="text-base text-muted">We need this to provide accurate service estimates</Text>
          </View>

          {/* Error Message */}
          {error && (
            <View className="mb-6 p-4 bg-error/10 rounded-lg border border-error">
              <Text className="text-error font-medium">{error}</Text>
            </View>
          )}

          {/* Nickname */}
          <View className="mb-5">
            <Text className="text-sm font-semibold text-foreground mb-2">Nickname</Text>
            <TextInput
              value={vehicleNickname}
              onChangeText={setVehicleNickname}
              placeholder="e.g., My Tesla, Daily Driver"
              placeholderTextColor="#999"
              editable={!loading}
              className="px-4 py-3 bg-surface border border-border rounded-lg text-foreground"
            />
          </View>

          {/* Year */}
          <View className="mb-5">
            <Text className="text-sm font-semibold text-foreground mb-2">Year</Text>
            <TextInput
              value={vehicleYear}
              onChangeText={setVehicleYear}
              placeholder="2024"
              placeholderTextColor="#999"
              keyboardType="number-pad"
              editable={!loading}
              className="px-4 py-3 bg-surface border border-border rounded-lg text-foreground"
            />
          </View>

          {/* Make */}
          <View className="mb-5">
            <Text className="text-sm font-semibold text-foreground mb-2">Make</Text>
            <TextInput
              value={vehicleMake}
              onChangeText={setVehicleMake}
              placeholder="e.g., Toyota"
              placeholderTextColor="#999"
              editable={!loading}
              className="px-4 py-3 bg-surface border border-border rounded-lg text-foreground"
            />
          </View>

          {/* Model */}
          <View className="mb-5">
            <Text className="text-sm font-semibold text-foreground mb-2">Model</Text>
            <TextInput
              value={vehicleModel}
              onChangeText={setVehicleModel}
              placeholder="e.g., Camry"
              placeholderTextColor="#999"
              editable={!loading}
              className="px-4 py-3 bg-surface border border-border rounded-lg text-foreground"
            />
          </View>

          {/* Color */}
          <View className="mb-8">
            <Text className="text-sm font-semibold text-foreground mb-2">Color (Optional)</Text>
            <TextInput
              value={vehicleColor}
              onChangeText={setVehicleColor}
              placeholder="e.g., Silver"
              placeholderTextColor="#999"
              editable={!loading}
              className="px-4 py-3 bg-surface border border-border rounded-lg text-foreground"
            />
          </View>

          {/* Complete Button */}
          <Pressable
            onPress={handleCustomerComplete}
            disabled={loading}
            className={`py-4 rounded-lg flex-row items-center justify-center ${
              loading ? "bg-primary/50" : "bg-primary"
            }`}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text className="text-white font-bold text-lg">Continue</Text>
            )}
          </Pressable>

          {/* Skip Link */}
          <Pressable onPress={() => router.replace("/(tabs)")} className="mt-4">
            <Text className="text-center text-muted font-medium">Skip for now</Text>
          </Pressable>
        </ScrollView>
      </ScreenContainer>
    );
  }

  // Mechanic profile completion
  return (
    <ScreenContainer className="bg-background">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="px-6 py-8">
        {/* Header */}
        <View className="mb-8">
          <Text className="text-3xl font-bold text-foreground mb-2">Complete Your Profile</Text>
          <Text className="text-base text-muted">Help customers find you</Text>
        </View>

        {/* Error Message */}
        {error && (
          <View className="mb-6 p-4 bg-error/10 rounded-lg border border-error">
            <Text className="text-error font-medium">{error}</Text>
          </View>
        )}

        {/* Name */}
        <View className="mb-5">
          <Text className="text-sm font-semibold text-foreground mb-2">Full Name</Text>
          <TextInput
            value={mechanicName}
            onChangeText={setMechanicName}
            placeholder="Your name"
            placeholderTextColor="#999"
            editable={!loading}
            className="px-4 py-3 bg-surface border border-border rounded-lg text-foreground"
          />
        </View>

        {/* Bio */}
        <View className="mb-8">
          <Text className="text-sm font-semibold text-foreground mb-2">Bio (Optional)</Text>
          <TextInput
            value={mechanicBio}
            onChangeText={setMechanicBio}
            placeholder="Tell customers about your experience"
            placeholderTextColor="#999"
            multiline
            numberOfLines={4}
            editable={!loading}
            className="px-4 py-3 bg-surface border border-border rounded-lg text-foreground"
          />
        </View>

        {/* Complete Button */}
        <Pressable
          onPress={handleMechanicComplete}
          disabled={loading}
          className={`py-4 rounded-lg flex-row items-center justify-center ${
            loading ? "bg-primary/50" : "bg-primary"
          }`}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text className="text-white font-bold text-lg">Get Started</Text>
          )}
        </Pressable>

        {/* Skip Link */}
        <Pressable onPress={() => router.replace("/(tabs)")} className="mt-4">
          <Text className="text-center text-muted font-medium">Skip for now</Text>
        </Pressable>
      </ScrollView>
    </ScreenContainer>
  );
}
