/**
 * Sign-up Screen (v1.5)
 * Email/password registration with Customer/Mechanic role selection
 * Complements existing OAuth flow
 */

import { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/lib/auth-context";
import { useStore } from "@/lib/store";
import * as Haptics from "expo-haptics";

export default function SignUpScreen() {
  const { dispatch } = useStore();
  const { signUp: authSignUp } = useAuth();

  // Form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [selectedRole, setSelectedRole] = useState<"customer" | "mechanic">("customer");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateForm = (): boolean => {
    setError(null);

    // Email validation
    if (!email.trim()) {
      setError("Email is required");
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError("Please enter a valid email address");
      return false;
    }

    // Password validation
    if (!password) {
      setError("Password is required");
      return false;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return false;
    }

    // Confirm password
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return false;
    }

    return true;
  };

  const handleSignUp = async () => {
    if (!validateForm()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      // Use auth context to sign up (this handles session persistence)
      await authSignUp(email, password, selectedRole);

      // Store user info in app state
      dispatch({
        type: "SET_ROLE",
        payload: selectedRole,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Navigate to profile completion screen
      // Auth context will have user set, so profile-complete can access it
      router.replace("/auth/profile-complete");
    } catch (err: any) {
      console.error("[SignUp] Full Error:", err);

      // User-friendly error messages
      let message = "Sign-up failed. Please try again.";
      const errorCode = err?.code || "";
      const errorMsg = err?.message || "";

      if (errorCode === "user_already_exists" || errorMsg.includes("already exists")) {
        message = "This email is already registered. Please sign in instead.";
      } else if (errorCode === "weak_password" || errorMsg.includes("weak")) {
        message = "Password is too weak. Use at least 8 characters with letters and numbers.";
      } else if (errorMsg.includes("invalid") || errorMsg.includes("Invalid")) {
        message = `Invalid input: ${errorMsg}`;
      } else if (errorMsg.includes("email") || errorMsg.includes("Email")) {
        message = `Email error: ${errorMsg}`;
      } else if (errorMsg) {
        message = errorMsg;
      }

      setError(message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer className="bg-background">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="px-6 py-8">
        {/* Header */}
        <View className="mb-8">
          <Text className="text-4xl font-bold text-foreground mb-2">Create Account</Text>
          <Text className="text-base text-muted">Join WrenchUp and get started</Text>
        </View>

        {/* Role Selection */}
        <View className="mb-8">
          <Text className="text-lg font-semibold text-foreground mb-4">I am a:</Text>
          <View className="flex-row gap-4">
            {/* Customer Role */}
            <Pressable
              onPress={() => {
                setSelectedRole("customer");
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              className={`flex-1 p-4 rounded-lg border-2 ${
                selectedRole === "customer"
                  ? "border-primary bg-primary/10"
                  : "border-border bg-surface"
              }`}
            >
              <Text
                className={`text-center font-semibold ${
                  selectedRole === "customer" ? "text-primary" : "text-foreground"
                }`}
              >
                Customer
              </Text>
              <Text
                className={`text-center text-xs mt-1 ${
                  selectedRole === "customer" ? "text-primary" : "text-muted"
                }`}
              >
                Need a mechanic
              </Text>
            </Pressable>

            {/* Mechanic Role */}
            <Pressable
              onPress={() => {
                setSelectedRole("mechanic");
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              className={`flex-1 p-4 rounded-lg border-2 ${
                selectedRole === "mechanic"
                  ? "border-primary bg-primary/10"
                  : "border-border bg-surface"
              }`}
            >
              <Text
                className={`text-center font-semibold ${
                  selectedRole === "mechanic" ? "text-primary" : "text-foreground"
                }`}
              >
                Mechanic
              </Text>
              <Text
                className={`text-center text-xs mt-1 ${
                  selectedRole === "mechanic" ? "text-primary" : "text-muted"
                }`}
              >
                Offer services
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Error Message */}
        {error && (
          <View className="mb-6 p-4 bg-error/10 rounded-lg border border-error">
            <Text className="text-error font-medium">{error}</Text>
          </View>
        )}

        {/* Email Input */}
        <View className="mb-5">
          <Text className="text-sm font-semibold text-foreground mb-2">Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="your@email.com"
            placeholderTextColor="#999"
            keyboardType="email-address"
            autoCapitalize="none"
            editable={!loading}
            className="px-4 py-3 bg-surface border border-border rounded-lg text-foreground"
          />
        </View>

        {/* Password Input */}
        <View className="mb-5">
          <Text className="text-sm font-semibold text-foreground mb-2">Password</Text>
          <View className="flex-row items-center">
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="At least 8 characters"
              placeholderTextColor="#999"
              secureTextEntry={!showPassword}
              editable={!loading}
              className="flex-1 px-4 py-3 bg-surface border border-border rounded-lg text-foreground"
            />
            <Pressable
              onPress={() => setShowPassword(!showPassword)}
              className="absolute right-4"
            >
              <Text className="text-primary text-sm font-semibold">
                {showPassword ? "Hide" : "Show"}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Confirm Password Input */}
        <View className="mb-8">
          <Text className="text-sm font-semibold text-foreground mb-2">Confirm Password</Text>
          <TextInput
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Repeat password"
            placeholderTextColor="#999"
            secureTextEntry={!showPassword}
            editable={!loading}
            className="px-4 py-3 bg-surface border border-border rounded-lg text-foreground"
          />
        </View>

        {/* Sign Up Button */}
        <Pressable
          onPress={handleSignUp}
          disabled={loading}
          className={`py-4 rounded-lg flex-row items-center justify-center ${
            loading ? "bg-primary/50" : "bg-primary"
          }`}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text className="text-white font-bold text-lg">Create Account</Text>
          )}
        </Pressable>

        {/* Sign In Link */}
        <View className="mt-6 flex-row justify-center gap-2">
          <Text className="text-muted">Already have an account?</Text>
          <Pressable onPress={() => router.push("/(tabs)")}>
            <Text className="text-primary font-semibold">Sign In</Text>
          </Pressable>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
