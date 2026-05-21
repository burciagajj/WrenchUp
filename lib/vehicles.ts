import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabaseUserData } from "@/lib/_core/supabase-user-data";
import type { UserVehicle } from "@/lib/_core/supabase-user-data";

const SESSION_TOKEN_KEY = "wrenchup_session_token";

async function getSessionToken(): Promise<string | null> {
  try {
    if (Platform.OS === "web") {
      return await AsyncStorage.getItem(SESSION_TOKEN_KEY);
    }
    return await SecureStore.getItemAsync(SESSION_TOKEN_KEY);
  } catch (err) {
    console.error("[vehicles] Failed to get session token:", err);
    return null;
  }
}

/**
 * Returns true if the user has at least one row in user_vehicles.
 * Requires a valid Supabase session (RLS).
 */
export async function userHasVehicles(
  userId: string,
  sessionToken?: string
): Promise<boolean> {
  const token = sessionToken ?? (await getSessionToken());
  if (!token) {
    console.warn("[vehicles] No session token — cannot check vehicles");
    return false;
  }

  try {
    const vehicles = await supabaseUserData.getUserVehicles(userId, token);
    return vehicles.length > 0;
  } catch (err) {
    console.error("[vehicles] Error checking vehicles:", err);
    return false;
  }
}

/** Fetch all vehicles for a user from Supabase. */
export async function fetchUserVehicles(
  userId: string,
  sessionToken?: string
): Promise<UserVehicle[]> {
  const token = sessionToken ?? (await getSessionToken());
  if (!token) {
    throw new Error("Not authenticated");
  }
  return supabaseUserData.getUserVehicles(userId, token);
}
