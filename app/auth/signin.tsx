/**
 * Sign-in Screen (v1.5)
 * Email/password login with forgot password flow
 */

import { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/lib/auth-context";
import { supabaseAuth } from "@/lib/_core/supabase-auth";
import { useStore } from "@/lib/store";
import * as Haptics from "expo-haptics";

export default function SignInScreen() {
  const { dispatch } = useStore();
  const { signIn: authSignIn, user } = useAuth();

  // Form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState(false);

  const validateForm = (): boolean => {
    setError(null);

    if (!email.trim()) {
      setError("Email is required");
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError("Please enter a valid email address");
      return false;
    }

    if (!password) {
      setError("Password is required");
      return false;
    }

    return true;
  };

  const handleSignIn = async () => {
    if (!validateForm()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      // Use auth context to sign in (this handles session persistence)
      await authSignIn(email, password);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Auth context will have user set, navigate based on profile completion
      // Note: user state updates async, so we'll check after a short delay
      setTimeout(() => {
        if (user?.profileCompleted) {
          router.replace("/(tabs)");
        } else {
          router.replace("/auth/profile-complete");
        }
      }, 100);
    } catch (err: any) {
      console.error("[SignIn] Error:", err);

      // User-friendly error messages
      let message = "Sign-in failed. Please try again.";
      const errorCode = err?.code || "";
      const errorMsg = err?.message || "";
      if (errorCode === "signin_failed" || errorCode === "invalid_credentials") {
        message = "Invalid email or password. Please try again.";
      } else if (errorCode === "user_not_found") {
        message = "No account found with this email. Please sign up first.";
      } else if (errorMsg) {
        message = errorMsg;
      }

      setError(message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!forgotEmail.trim()) {
      setError("Please enter your email address");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(forgotEmail)) {
      setError("Please enter a valid email address");
      return;
    }

    setForgotLoading(true);
    setError(null);

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await supabaseAuth.resetPassword(forgotEmail);
      setForgotSuccess(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      console.error("[ForgotPassword] Error:", err);
      setError("Failed to send reset email. Please try again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setForgotLoading(false);
    }
  };

  // Forgot Password Modal
  if (showForgotPassword) {
    return (
      <ScreenContainer className="bg-background">
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="px-6 py-8">
          {/* Header */}
          <View className="mb-8">
            <Text className="text-3xl font-bold text-foreground mb-2">Reset Password</Text>
            <Text className="text-base text-muted">Enter your email to receive a password reset link</Text>
          </View>

          {/* Success Message */}
          {forgotSuccess && (
            <View className="mb-6 p-4 bg-success/10 rounded-lg border border-success">
              <Text className="text-success font-medium">
                Check your email for a password reset link. It may take a few minutes to arrive.
              </Text>
            </View>
          )}

          {/* Error Message */}
          {error && !forgotSuccess && (
            <View className="mb-6 p-4 bg-error/10 rounded-lg border border-error">
              <Text className="text-error font-medium">{error}</Text>
            </View>
          )}

          {/* Email Input */}
          {!forgotSuccess && (
            <>
              <View className="mb-8">
                <Text className="text-sm font-semibold text-foreground mb-2">Email</Text>
                <TextInput
                  value={forgotEmail}
                  onChangeText={setForgotEmail}
                  placeholder="your@email.com"
                  placeholderTextColor="#999"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  editable={!forgotLoading}
                  className="px-4 py-3 bg-surface border border-border rounded-lg text-foreground"
                />
              </View>

              {/* Send Button */}
              <Pressable
                onPress={handleForgotPassword}
                disabled={forgotLoading}
                className={`py-4 rounded-lg flex-row items-center justify-center ${
                  forgotLoading ? "bg-primary/50" : "bg-primary"
                }`}
              >
                {forgotLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text className="text-white font-bold text-lg">Send Reset Link</Text>
                )}
              </Pressable>
            </>
          )}

          {/* Back Button */}
          <Pressable onPress={() => setShowForgotPassword(false)} className="mt-6">
            <Text className="text-center text-primary font-semibold">Back to Sign In</Text>
          </Pressable>
        </ScrollView>
      </ScreenContainer>
    );
  }

  // Sign In Form
  return (
    <ScreenContainer className="bg-background">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="px-6 py-8">
        {/* Header */}
        <View className="mb-8">
          <Text className="text-4xl font-bold text-foreground mb-2">Welcome Back</Text>
          <Text className="text-base text-muted">Sign in to your WrenchUp account</Text>
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
        <View className="mb-3">
          <Text className="text-sm font-semibold text-foreground mb-2">Password</Text>
          <View className="flex-row items-center">
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Enter your password"
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

        {/* Forgot Password Link */}
        <Pressable onPress={() => setShowForgotPassword(true)} className="mb-8">
          <Text className="text-right text-primary font-semibold text-sm">Forgot password?</Text>
        </Pressable>

        {/* Sign In Button */}
        <Pressable
          onPress={handleSignIn}
          disabled={loading}
          className={`py-4 rounded-lg flex-row items-center justify-center ${
            loading ? "bg-primary/50" : "bg-primary"
          }`}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text className="text-white font-bold text-lg">Sign In</Text>
          )}
        </Pressable>

        {/* Sign Up Link */}
        <View className="mt-6 flex-row justify-center gap-2">
          <Text className="text-muted">Don't have an account?</Text>
          <Pressable onPress={() => router.push("/auth/signup")}>
            <Text className="text-primary font-semibold">Sign Up</Text>
          </Pressable>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
