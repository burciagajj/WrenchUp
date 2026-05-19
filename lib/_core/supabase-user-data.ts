/**
 * Supabase User Data API (v1.6)
 * Handles per-user profile and vehicle data with proper isolation
 * Uses PostgREST API for CRUD operations on user_profiles and user_vehicles tables
 */

import type { Vehicle } from "../types";
import { supabaseAuth } from "./supabase-auth";
import { getRefreshToken, updateSessionToken } from "../auth-context";

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
    sessionToken?: string
  ): Promise<any> {
    const url = `${this.supabaseUrl}/rest/v1${endpoint}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
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
        
        // Handle specific Supabase errors
        if (error.code === 'PGRST205') {
          throw {
            code: 'TABLE_NOT_FOUND',
            message: `Database table not found. Please run SUPABASE_SETUP.sql in Supabase SQL Editor to create required tables.`,
          };
        }
        
        throw {
          code: error.code || `http_${response.status}`,
          message: error.message || `HTTP ${response.status}`,
        };
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
      // Try to fetch existing profile
      const profiles = await this.apiCall(
        `/user_profiles?user_id=eq.${userId}`,
        "GET",
        undefined,
        sessionToken
      );

      if (profiles && profiles.length > 0) {
        return profiles[0];
      }

      // Create new profile if doesn't exist
      const newProfile = await this.apiCall(
        "/user_profiles",
        "POST",
        {
          user_id: userId,
          role,
          full_name: null,
          bio: null,
        },
        sessionToken
      );

      return newProfile[0] || { userId, role, full_name: null, bio: null };
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

      // Attempt to refresh session if it might be expired
      let currentToken = sessionToken;
      try {
        const refreshToken = await getRefreshToken();
        if (refreshToken) {
          console.log("[SupabaseUserData] Refreshing session before updateProfile...");
          const refreshResult = await supabaseAuth.refreshSession(refreshToken);
          currentToken = refreshResult.access_token;
          await updateSessionToken(currentToken, refreshResult.refresh_token);
          console.log("[SupabaseUserData] Session refreshed successfully");
        }
      } catch (refreshErr) {
        console.warn("[SupabaseUserData] Session refresh failed, continuing with existing token:", refreshErr);
        // Continue with original token
      }
      
      // Clean updates: convert empty strings to null
      const cleanUpdates: Record<string, any> = {};
      for (const [key, value] of Object.entries(updates)) {
        cleanUpdates[key] = value === '' ? null : value;
      }
      
      // ALWAYS include email from auth session
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
        return updateResult[0];
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
        return createResult[0];
      }
      if (createResult && typeof createResult === 'object' && !Array.isArray(createResult)) {
        console.log("[SupabaseUserData] Profile created successfully (object response)");
        return createResult;
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
      const vehicles = await this.apiCall(
        `/user_vehicles?user_id=eq.${userId}&order=created_at.desc`,
        "GET",
        undefined,
        sessionToken
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

      // Attempt to refresh session if it might be expired
      let currentToken = sessionToken;
      try {
        const refreshToken = await getRefreshToken();
        if (refreshToken) {
          console.log("[SupabaseUserData] Refreshing session before addVehicle...");
          const refreshResult = await supabaseAuth.refreshSession(refreshToken);
          currentToken = refreshResult.access_token;
          await updateSessionToken(currentToken, refreshResult.refresh_token);
          console.log("[SupabaseUserData] Session refreshed successfully");
        }
      } catch (refreshErr) {
        console.warn("[SupabaseUserData] Session refresh failed, continuing with existing token:", refreshErr);
        // Continue with original token
      }

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
      const result = await this.apiCall(
        `/user_vehicles?id=eq.${vehicleId}&user_id=eq.${userId}`,
        "PATCH",
        updates,
        sessionToken
      );

      if (result && result.length > 0) {
        return result[0];
      }
      if (result && typeof result === 'object' && !Array.isArray(result)) {
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
      await this.apiCall(
        `/user_vehicles?id=eq.${vehicleId}&user_id=eq.${userId}`,
        "DELETE",
        undefined,
        sessionToken
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
      // Clear all active vehicles for this user
      await this.apiCall(
        `/user_vehicles?user_id=eq.${userId}`,
        "PATCH",
        { is_active: false },
        sessionToken
      );

      // Set the selected vehicle as active
      await this.apiCall(
        `/user_vehicles?id=eq.${vehicleId}&user_id=eq.${userId}`,
        "PATCH",
        { is_active: true },
        sessionToken
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
      const result = await this.apiCall(
        `/user_profiles?user_id=eq.${userId}`,
        "PATCH",
        { avatar_url: avatar_url },
        sessionToken
      );

      if (result && result.length > 0) {
        return result[0];
      }
      if (result && typeof result === 'object' && !Array.isArray(result)) {
        return result;
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
      const url = `${this.supabaseUrl}/auth/v1/user`;
      const response = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          apikey: this.supabaseKey,
          Authorization: `Bearer ${sessionToken}`,
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
