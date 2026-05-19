/**
 * Supabase User Data API (v1.6)
 * Handles per-user profile and vehicle data with proper isolation
 * Uses PostgREST API for CRUD operations on user_profiles and user_vehicles tables
 */

import type { Vehicle } from "../types";

export type UserProfile = {
  id: string;
  userId: string;
  name: string | null;
  bio: string | null;
  photoUrl: string | null;
  role: "customer" | "mechanic";
  completedAt: string;
  createdAt: string;
  updatedAt: string;
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
  createdAt: string;
  updatedAt: string;
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
      console.error("[SupabaseUserData] API call failed:", error);
      throw error;
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
          name: null,
          bio: null,
        },
        sessionToken
      );

      return newProfile[0] || { userId, role, name: null, bio: null };
    } catch (error) {
      console.error("[SupabaseUserData] Failed to get/create profile:", error);
      throw error;
    }
  }

  /**
   * Update user profile
   */
  async updateProfile(
    userId: string,
    updates: Partial<Omit<UserProfile, "id" | "userId" | "createdAt">>,
    sessionToken: string
  ): Promise<UserProfile> {
    try {
      const result = await this.apiCall(
        `/user_profiles?user_id=eq.${userId}`,
        "PATCH",
        updates,
        sessionToken
      );

      return result[0] || {};
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
   */
  async addVehicle(
    userId: string,
    vehicle: Omit<Vehicle, "id">,
    sessionToken: string
  ): Promise<UserVehicle> {
    try {
      const result = await this.apiCall(
        "/user_vehicles",
        "POST",
        {
          user_id: userId,
          nickname: vehicle.nickname,
          year: vehicle.year,
          make: vehicle.make,
          model: vehicle.model,
          color: vehicle.color,
          plate: vehicle.plate,
          is_active: false,
        },
        sessionToken
      );

      return result[0] || {};
    } catch (error) {
      console.error("[SupabaseUserData] Failed to add vehicle:", error);
      throw error;
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

      return result[0] || {};
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
    photoUrl: string,
    sessionToken: string
  ): Promise<UserProfile> {
    try {
      const result = await this.apiCall(
        `/user_profiles?user_id=eq.${userId}`,
        "PATCH",
        { photo_url: photoUrl },
        sessionToken
      );

      return result[0] || {};
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
