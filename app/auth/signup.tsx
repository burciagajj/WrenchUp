/**
 * Sign-up Screen (v1.8)
 * Fixed button response + minimal dependencies
 */

import { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { router, Redirect } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/hooks/use-locale";
import * as Haptics from "expo-haptics";

export default function SignUpScreen() {
  const { signUp: authSignUp, isAuthenticated, isLoading: authLoading } = useAuth();
  const t = useT();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [selectedRole, setSelectedRole] = useState<"customer" | "mechanic">("customer");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!authLoading && isAuthenticated) {
    return <Redirect href="/(tabs)" />;
  }

  const validateForm = (): boolean => {
    setError(null);
    if (!email.trim()) {
      setError("Email is required");
      return false;
    }
    if (!password || password.length < 8) {
      setError("Password must be at least 8 characters");
      return false;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return false;
    }
    return true;
  };

  const handleSignUp = async () => {
    console.log("✅ Sign Up button pressed"); // Debug

    if (!validateForm()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      console.log("Calling authSignUp with:", email, selectedRole);

      const authUser = await authSignUp(email, password, selectedRole);

      console.log("✅ Sign up successful!", authUser.email);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Go to profile completion
      router.replace("/auth/profile-complete");

    } catch (err: any) {
      console.error("[SignUpScreen] Error:", err);
      const message = err?.message || "Sign up failed. Please try again.";
      setError(message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer className="bg-background">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="px-6 py-8">
        <View className="mb-8">
          <Text className="text-4xl font-bold text-foreground mb-2">Create Account</Text>
          <Text className="text-base text-muted">Join WrenchUp and get your car fixed fast</Text>
        </View>

        {/* Role Selection */}
        <View className="mb-8">
          <Text className="text-lg font-semibold text-foreground mb-4">I am a...</Text>
          <View className="flex-row gap-4">
            <Pressable
              onPress={() => setSelectedRole("customer")}
              className={`flex-1 p-4 rounded-lg border-2 ${selectedRole === "customer" ? "border-primary bg-primary/10" : "border-border bg-surface"}`}
            >
              <Text className={`text-center font-semibold ${selectedRole === "customer" ? "text-primary" : "text-foreground"}`}>Customer</Text>
            </Pressable>

            <Pressable
              onPress={() => setSelectedRole("mechanic")}
              className={`flex-1 p-4 rounded-lg border-2 ${selectedRole === "mechanic" ? "border-primary bg-primary/10" : "border-border bg-surface"}`}
            >
              <Text className={`text-center font-semibold ${selectedRole === "mechanic" ? "text-primary" : "text-foreground"}`}>Mechanic</Text>
            </Pressable>
          </View>
        </View>

        {error && (
          <View className="mb-6 p-4 bg-red-500/10 border border-red-500 rounded-lg">
            <Text className="text-red-500 font-medium">{error}</Text>
          </View>
        )}

        <View className="mb-5">
          <Text className="text-sm font-semibold text-foreground mb-2">Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="your@email.com"
            keyboardType="email-address"
            autoCapitalize="none"
            editable={!loading}
            className="px-4 py-3 bg-surface border border-border rounded-lg text-foreground"
          />
        </View>

        <View className="mb-5">
          <Text className="text-sm font-semibold text-foreground mb-2">Password</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Minimum 8 characters"
            secureTextEntry={!showPassword}
            editable={!loading}
            className="px-4 py-3 bg-surface border border-border rounded-lg text-foreground"
          />
        </View>

        <View className="mb-8">
          <Text className="text-sm font-semibold text-foreground mb-2">Confirm Password</Text>
          <TextInput
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Confirm password"
            secureTextEntry={!showPassword}
            editable={!loading}
            className="px-4 py-3 bg-surface border border-border rounded-lg text-foreground"
          />
        </View>

        <Pressable
          onPress={handleSignUp}
          disabled={loading}
          className={`py-4 rounded-xl flex-row items-center justify-center ${loading ? "bg-primary/50" : "bg-primary"}`}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text className="text-white font-bold text-lg">Create Account</Text>
          )}
        </Pressable>

        <View className="mt-6 flex-row justify-center gap-2">
          <Text className="text-muted">Already have an account?</Text>
          <Pressable onPress={() => router.push("/auth/signin")}>
            <Text className="text-primary font-semibold">Sign in</Text>
          </Pressable>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}