/**
 * Supabase User Data API (v1.6)
 * Handles per-user profile and vehicle data with proper isolation
 * Uses PostgREST API for CRUD operations on user_profiles and user_vehicles tables
 */

import type { Vehicle } from "../types";
import {
  ensureValidAccessToken,
  isJwtExpiredError,
  refreshAccessToken,
} from "../profile-session";

export type UserProfile = {
  id: string;
  userId: string;
  email: string | null;
  full_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  role: "customer" | "mechanic" | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Read profile — supports full_name/avatar_url (live DB) or legacy name/photo_url */
function mapDbRowToProfile(row: Record<string, unknown>): UserProfile {
  return {
    id: String(row.id ?? ""),
    userId: String(row.user_id ?? row.userId ?? ""),
    email: (row.email as string) ?? null,
    full_name: (row.full_name as string) ?? (row.name as string) ?? null,
    bio: (row.bio as string) ?? null,
    avatar_url: (row.avatar_url as string) ?? (row.photo_url as string) ?? null,
    role: (row.role as UserProfile["role"]) ?? null,
    completed_at: (row.completed_at as string) ?? null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

function mapAppUpdatesToDb(
  updates: Partial<Omit<UserProfile, "id" | "userId" | "createdAt">>
): Record<string, unknown> {
  const db: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates)) {
    const v = value === "" ? null : value;
    // Live Supabase schema uses full_name + avatar_url (not name / photo_url)
    if (
      key === "full_name" ||
      key === "avatar_url" ||
      key === "bio" ||
      key === "role" ||
      key === "email" ||
      key === "completed_at"
    ) {
      db[key] = v;
    }
  }
  return db;
}

export type UserVehicle = {
  id: string;
  userId: string;
  nickname: string;
  year: number;
  make: string;
  model: string;
  color: string | null;
  plate: string | null;
  isActive: boolean;
  created_at: string;
  updated_at: string;
};

class SupabaseUserDataClient {
  private supabaseUrl: string;
  private supabaseKey: string;

  constructor() {
    this.supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || "";
    this.supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";

    if (!this.supabaseUrl || !this.supabaseKey) {
      console.error("[SupabaseUserData] CRITICAL: Missing Supabase credentials!");
    }
  }

  /**
   * Make authenticated PostgREST API call
   */
  private async apiCall(
    endpoint: string,
    method: "GET" | "POST" | "PATCH" | "DELETE" = "GET",
    body?: Record<string, unknown>,
    sessionToken?: string,
    retriedAfterRefresh = false
  ): Promise<any> {
    const url = `${this.supabaseUrl}/rest/v1${endpoint}`;
    const headers: Record<string, string> = {
  "Content-Type": "application/json",
  "Prefer": "return=representation",
  apikey: this.supabaseKey,
};

    // Add authorization header if session token provided
    if (sessionToken) {
      headers["Authorization"] = `Bearer ${sessionToken}`;
    }

    try {
      console.log(`[SupabaseUserData] ${method} ${endpoint}`);

      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const error = await response.json();
        console.error(`[SupabaseUserData] API Error: ${response.status}`, error);

        const wrapped = {
          code: error.code || `http_${response.status}`,
          message: error.message || `HTTP ${response.status}`,
          details: error,
        };

        if (error.code === "PGRST205") {
          throw {
            code: "TABLE_NOT_FOUND",
            message:
              "Database table not found. Please run SUPABASE_SETUP.sql in Supabase SQL Editor to create required tables.",
          };
        }

        if (sessionToken && !retriedAfterRefresh && isJwtExpiredError(wrapped)) {
          console.log("[SupabaseUserData] JWT expired — refreshing and retrying...");
          try {
            const newToken = await refreshAccessToken();
            return this.apiCall(endpoint, method, body, newToken, true);
          } catch (refreshErr) {
            console.error("[SupabaseUserData] Retry after refresh failed:", refreshErr);
          }
        }

        throw wrapped;
      }

      // GET requests return array or single object
      if (method === "GET") {
        return await response.json();
      }

      // POST/PATCH/DELETE return empty or modified rows
      const text = await response.text();
      return text ? JSON.parse(text) : null;
    } catch (error: any) {
      const errorCode = error?.code || 'unknown';
      const errorMsg = error?.message || 'Unknown error';
      
      // Log detailed error info for debugging
      console.error(`[SupabaseUserData] API call failed (${errorCode}):`, errorMsg);
      
      // Re-throw with enhanced context
      throw {
        code: errorCode,
        message: errorMsg,
        details: error,
      };
    }
  }

  /**
   * Get user profile (or create if doesn't exist)
   */
  async getOrCreateProfile(
    userId: string,
    role: "customer" | "mechanic",
    sessionToken: string
  ): Promise<UserProfile> {
    try {
      const currentToken = await ensureValidAccessToken(sessionToken);

      // Try to fetch existing profile
      const profiles = await this.apiCall(
        `/user_profiles?user_id=eq.${userId}`,
        "GET",
        undefined,
        currentToken
      );

      if (profiles && profiles.length > 0) {
        return mapDbRowToProfile(profiles[0]);
      }

      const newProfile = await this.apiCall(
        "/user_profiles",
        "POST",
        {
          user_id: userId,
          role,
          full_name: null,
          bio: null,
          avatar_url: null,
        },
        currentToken
      );

      const row = Array.isArray(newProfile) ? newProfile[0] : newProfile;
      return row ? mapDbRowToProfile(row) : mapDbRowToProfile({ user_id: userId, role });
    } catch (error) {
      console.error("[SupabaseUserData] Failed to get/create profile:", error);
      throw error;
    }
  }

  /**
   * Update user profile (or create if doesn't exist)
   * Uses upsert pattern: try to update first, if no rows affected then insert
   * Always includes email from auth session
   */
  async updateProfile(
    userId: string,
    updates: Partial<Omit<UserProfile, "id" | "userId" | "createdAt">>,
    sessionToken: string,
    userEmail?: string
  ): Promise<UserProfile> {
    try {
      if (!userId) throw new Error("userId is required");
      if (!sessionToken) throw new Error("sessionToken is required");

      const currentToken = await ensureValidAccessToken(sessionToken);

      const cleanUpdates = mapAppUpdatesToDb(updates);
      if (userEmail) {
        cleanUpdates.email = userEmail;
      }

      console.log("[SupabaseUserData] Updating profile for user:", userId, "with updates:", cleanUpdates);
      
      // Try to update existing profile
      const updateResult = await this.apiCall(
        `/user_profiles?user_id=eq.${userId}`,
        "PATCH",
        cleanUpdates,
        currentToken
      );

      // If update returned rows, return the updated profile
      if (updateResult && updateResult.length > 0) {
        console.log("[SupabaseUserData] Profile updated successfully");
        return mapDbRowToProfile(updateResult[0]);
      }
      
      // If update returned no rows, profile doesn't exist - create it
      console.log("[SupabaseUserData] Profile doesn't exist, creating new one");
      const createResult = await this.apiCall(
        "/user_profiles",
        "POST",
        {
          user_id: userId,
          ...cleanUpdates,
        },
        currentToken
      );

      // Handle various response formats from Supabase
      if (createResult && createResult.length > 0) {
        console.log("[SupabaseUserData] Profile created successfully (array response)");
        return mapDbRowToProfile(createResult[0]);
      }
      if (createResult && typeof createResult === "object" && !Array.isArray(createResult)) {
        console.log("[SupabaseUserData] Profile created successfully (object response)");
        return mapDbRowToProfile(createResult as Record<string, unknown>);
      }
      
      // If we get here, something went wrong
      console.error("[SupabaseUserData] Unexpected response from profile creation:", createResult);
      throw new Error("Failed to create user profile: invalid response from server");
    } catch (error) {
      console.error("[SupabaseUserData] Failed to update profile:", error);
      throw error;
    }
  }

  /**
   * Get all vehicles for user
   */
  async getUserVehicles(userId: string, sessionToken: string): Promise<UserVehicle[]> {
    try {
      const currentToken = await ensureValidAccessToken(sessionToken);
      const vehicles = await this.apiCall(
        `/user_vehicles?user_id=eq.${userId}&order=created_at.desc`,
        "GET",
        undefined,
        currentToken
      );

      return vehicles || [];
    } catch (error) {
      console.error("[SupabaseUserData] Failed to fetch vehicles:", error);
      throw error;
    }
  }

  /**
   * Add new vehicle for user
   * Uses user_vehicles table with exact column names: user_id, nickname, year, make, model, color, plate, is_active
   */
  async addVehicle(
    userId: string,
    vehicle: Omit<Vehicle, "id">,
    sessionToken: string
  ): Promise<UserVehicle> {
    try {
      if (!userId) throw new Error("userId is required");
      if (!sessionToken) throw new Error("sessionToken is required");
      if (!vehicle.nickname) throw new Error("Vehicle nickname is required");
      if (!vehicle.make) throw new Error("Vehicle make is required");
      if (!vehicle.model) throw new Error("Vehicle model is required");
      if (!vehicle.year) throw new Error("Vehicle year is required");

      const currentToken = await ensureValidAccessToken(sessionToken);

      // Build payload with EXACT column names matching Supabase user_vehicles table
      const payload = {
        user_id: userId,
        nickname: vehicle.nickname,
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
        color: vehicle.color || null,
        plate: vehicle.plate || null,
        is_active: false,
      };

      console.log("[SupabaseUserData] ➤ Adding vehicle to user_vehicles table");
      console.log("[SupabaseUserData] Payload:", JSON.stringify(payload, null, 2));

      const result = await this.apiCall(
        "/user_vehicles",
        "POST",
        payload,
        currentToken
      );

      console.log("[SupabaseUserData] Response received:", JSON.stringify(result, null, 2));
      console.log("[SupabaseUserData] Response type:", typeof result, "IsArray:", Array.isArray(result));

      // Handle array response (most common from Supabase)
      if (result && Array.isArray(result) && result.length > 0) {
        console.log("[SupabaseUserData] ✓ Vehicle added successfully");
        return result[0];
      }

      // Handle object response
      if (result && typeof result === 'object' && !Array.isArray(result)) {
        console.log("[SupabaseUserData] ✓ Vehicle added successfully (object response)");
        return result;
      }

      // Handle empty array response - likely RLS or permissions issue
      if (Array.isArray(result) && result.length === 0) {
        const msg = "Server returned empty array. Verify: (1) user_vehicles table exists, (2) RLS INSERT policy allows this user, (3) user_id is valid";
        console.error("[SupabaseUserData] ✗", msg);
        throw new Error(msg);
      }

      // Handle null/undefined response
      if (!result) {
        const msg = "Server returned null/undefined. Check if user_vehicles table exists and RLS policies are configured correctly.";
        console.error("[SupabaseUserData] ✗", msg);
        throw new Error(msg);
      }

      throw new Error(`Invalid response format: ${JSON.stringify(result)}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const fullError = error instanceof Error ? error : new Error(String(error));
      console.error("[SupabaseUserData] ✗ Failed to add vehicle:", errorMsg);
      console.error("[SupabaseUserData] Full error details:", fullError);
      throw new Error(`Failed to add vehicle: ${errorMsg}`);
    }
  }

  /**
   * Update vehicle
   */
  async updateVehicle(
    vehicleId: string,
    userId: string,
    updates: Partial<Omit<Vehicle, "id">>,
    sessionToken: string
  ): Promise<UserVehicle> {
    try {
      const currentToken = await ensureValidAccessToken(sessionToken);
      const result = await this.apiCall(
        `/user_vehicles?id=eq.${vehicleId}&user_id=eq.${userId}`,
        "PATCH",
        updates,
        currentToken
      );

      if (result && result.length > 0) {
        return result[0];
      }
      if (result && typeof result === "object" && !Array.isArray(result)) {
        return result;
      }
      throw new Error("Failed to update vehicle: invalid response");
    } catch (error) {
      console.error("[SupabaseUserData] Failed to update vehicle:", error);
      throw error;
    }
  }

  /**
   * Delete vehicle
   */
  async deleteVehicle(vehicleId: string, userId: string, sessionToken: string): Promise<void> {
    try {
      const currentToken = await ensureValidAccessToken(sessionToken);
      await this.apiCall(
        `/user_vehicles?id=eq.${vehicleId}&user_id=eq.${userId}`,
        "DELETE",
        undefined,
        currentToken
      );
    } catch (error) {
      console.error("[SupabaseUserData] Failed to delete vehicle:", error);
      throw error;
    }
  }

  /**
   * Set active vehicle (only one per user)
   */
  async setActiveVehicle(
    vehicleId: string,
    userId: string,
    sessionToken: string
  ): Promise<void> {
    try {
      const currentToken = await ensureValidAccessToken(sessionToken);
      // Clear all active vehicles for this user
      await this.apiCall(
        `/user_vehicles?user_id=eq.${userId}`,
        "PATCH",
        { is_active: false },
        currentToken
      );

      // Set the selected vehicle as active
      await this.apiCall(
        `/user_vehicles?id=eq.${vehicleId}&user_id=eq.${userId}`,
        "PATCH",
        { is_active: true },
        currentToken
      );
    } catch (error) {
      console.error("[SupabaseUserData] Failed to set active vehicle:", error);
      throw error;
    }
  }

  /**
   * Update profile photo URL
   */
  async updateProfilePhoto(
    userId: string,
    avatar_url: string,
    sessionToken: string
  ): Promise<UserProfile> {
    try {
      const currentToken = await ensureValidAccessToken(sessionToken);
      const dbPatch = mapAppUpdatesToDb({ avatar_url });
      const result = await this.apiCall(
        `/user_profiles?user_id=eq.${userId}`,
        "PATCH",
        dbPatch,
        currentToken
      );

      if (result && result.length > 0) {
        return mapDbRowToProfile(result[0]);
      }
      if (result && typeof result === "object" && !Array.isArray(result)) {
        return mapDbRowToProfile(result as Record<string, unknown>);
      }
      throw new Error("Failed to update profile photo: invalid response");
    } catch (error) {
      console.error("[SupabaseUserData] Failed to update profile photo:", error);
      throw error;
    }
  }

  /**
   * Change password via Supabase Auth
   */
  async changePassword(
    newPassword: string,
    sessionToken: string
  ): Promise<void> {
    try {
      const currentToken = await ensureValidAccessToken(sessionToken);
      const url = `${this.supabaseUrl}/auth/v1/user`;
      const response = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          apikey: this.supabaseKey,
          Authorization: `Bearer ${currentToken}`,
        },
        body: JSON.stringify({ password: newPassword }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error("[SupabaseUserData] Password change error:", error);
        throw {
          code: error.error_code || "password_change_failed",
          message: error.message || "Failed to change password",
        };
      }

      console.log("[SupabaseUserData] Password changed successfully");
    } catch (error) {
      console.error("[SupabaseUserData] Failed to change password:", error);
      throw error;
    }
  }
}

export const supabaseUserData = new SupabaseUserDataClient();
