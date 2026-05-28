// lib/vehicles.ts
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { supabaseUserData } from "@/lib/_core/supabase-user-data";

/** Helper: Get session token */
async function getSessionTokenFromStorage(): Promise<string | null> {
  try {
    if (Platform.OS === "web") {
      return await AsyncStorage.getItem("wrenchup_session_token");
    } else {
      return await SecureStore.getItemAsync("wrenchup_session_token");
    }
  } catch (err) {
    console.error("[vehicles] Failed to get session token:", err);
    return null;
  }
}

/** Check if user has vehicles */
export async function userHasVehicles(
  userId: string,
  sessionToken?: string | null
): Promise<boolean> {
  if (!userId) {
    console.warn("[vehicles] No userId provided");
    return false;
  }

  try {
    let token: string | null = sessionToken ?? null;

    if (!token) {
      token = await getSessionTokenFromStorage();
    }

    if (!token) {
      console.warn("[vehicles] No session token available");
      return false;
    }

    const vehicles = await supabaseUserData.getUserVehicles(userId, token);

    console.log(`[vehicles] ✅ Found ${vehicles.length} vehicle(s) for user ${userId}`);
    return vehicles.length > 0;
  } catch (err) {
    console.error("[vehicles] ❌ Error checking vehicles:", err);
    return false;
  }
}
