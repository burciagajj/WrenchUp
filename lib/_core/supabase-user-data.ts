/**
 * Supabase User Data API (v1.6)
 * Handles per-user profile and vehicle data with proper isolation
 * Uses PostgREST API for CRUD operations on user_profiles and user_vehicles tables
 */

import type { Vehicle } from "../types";
import { trackAnalyticsEvent } from "@/lib/analytics";
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
  display_name: string | null;
  expo_push_token: string | null;
  chat_notifications_enabled: boolean | null;
  marketing_notifications_enabled: boolean | null;
  date_of_birth: string | null;
  bio: string | null;
  avatar_url: string | null;
  avatar_status: "pending_review" | "approved" | "rejected" | null;
  avatar_submitted_at: string | null;
  avatar_reviewed_at: string | null;
  avatar_reviewed_by: string | null;
  avatar_rejection_reason: string | null;
  verification_status: "pending_review" | "approved" | "rejected" | null;
  id_document_url: string | null;
  insurance_document_url: string | null;
  certification_document_url: string | null;
  business_license_document_url: string | null;
  license_expires_at: string | null;
  insurance_expires_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  rejection_reason: string | null;
  mechanic_attested_no_criminal_record: boolean | null;
  mechanic_attested_at: string | null;
  role: "customer" | "mechanic" | "admin" | null;
  completed_at: string | null;
  phone_number: string | null;
  phone_verified_at: string | null;
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
    display_name: (row.display_name as string) ?? null,
    expo_push_token: (row.expo_push_token as string) ?? null,
    chat_notifications_enabled: (row.chat_notifications_enabled as boolean) ?? true,
    marketing_notifications_enabled: (row.marketing_notifications_enabled as boolean) ?? true,
    date_of_birth: (row.date_of_birth as string) ?? null,
    bio: (row.bio as string) ?? null,
    avatar_url: (row.avatar_url as string) ?? (row.photo_url as string) ?? null,
    avatar_status: (row.avatar_status as UserProfile["avatar_status"]) ?? "pending_review",
    avatar_submitted_at: (row.avatar_submitted_at as string) ?? null,
    avatar_reviewed_at: (row.avatar_reviewed_at as string) ?? null,
    avatar_reviewed_by: (row.avatar_reviewed_by as string) ?? null,
    avatar_rejection_reason: (row.avatar_rejection_reason as string) ?? null,
    verification_status: (row.verification_status as UserProfile["verification_status"]) ?? null,
    id_document_url: (row.id_document_url as string) ?? null,
    insurance_document_url: (row.insurance_document_url as string) ?? null,
    certification_document_url: (row.certification_document_url as string) ?? null,
    business_license_document_url: (row.business_license_document_url as string) ?? null,
    license_expires_at: (row.license_expires_at as string) ?? null,
    insurance_expires_at: (row.insurance_expires_at as string) ?? null,
    reviewed_at: (row.reviewed_at as string) ?? null,
    reviewed_by: (row.reviewed_by as string) ?? null,
    rejection_reason: (row.rejection_reason as string) ?? null,
    mechanic_attested_no_criminal_record:
      (row.mechanic_attested_no_criminal_record as boolean) ?? null,
    mechanic_attested_at: (row.mechanic_attested_at as string) ?? null,
    role: (row.role as UserProfile["role"]) ?? null,
    completed_at: (row.completed_at as string) ?? null,
    phone_number: (row.phone_number as string) ?? null,
    phone_verified_at: (row.phone_verified_at as string) ?? null,
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
      key === "display_name" ||
      key === "expo_push_token" ||
      key === "chat_notifications_enabled" ||
      key === "marketing_notifications_enabled" ||
      key === "date_of_birth" ||
      key === "avatar_url" ||
      key === "avatar_status" ||
      key === "avatar_submitted_at" ||
      key === "avatar_reviewed_at" ||
      key === "avatar_reviewed_by" ||
      key === "avatar_rejection_reason" ||
      key === "bio" ||
      key === "role" ||
      key === "email" ||
      key === "completed_at" ||
      key === "verification_status" ||
      key === "id_document_url" ||
      key === "insurance_document_url" ||
      key === "certification_document_url" ||
      key === "business_license_document_url" ||
      key === "license_expires_at" ||
      key === "insurance_expires_at" ||
      key === "reviewed_at" ||
      key === "reviewed_by" ||
      key === "rejection_reason" ||
      key === "mechanic_attested_no_criminal_record" ||
      key === "mechanic_attested_at" ||
      key === "phone_number" ||
      key === "phone_verified_at"
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
  trim?: string | null;
  engine_size?: string | null;
  transmission_type?: "automatic" | "manual" | "cvt" | "dct" | "other" | null;
  drivetrain?: "AWD" | "FWD" | "RWD" | "4WD" | null;
  color: string | null;
  plate: string | null;
  isActive: boolean;
  insurance_doc_url?: string | null;
  registration_sticker_url?: string | null;
  approval_status?: "pending" | "approved" | "rejected" | null;
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

  private isOptionalVehicleColumnMissing(errorLike: { code?: string; message?: string; details?: unknown }): boolean {
    const code = String(errorLike?.code ?? "");
    if (code !== "PGRST204") return false;
    const msg = String(errorLike?.message ?? "").toLowerCase();
    const detailMsg = String(
      (errorLike?.details as { message?: string } | undefined)?.message ?? ""
    ).toLowerCase();
    const haystack = `${msg} ${detailMsg}`;
    return (
      haystack.includes("drivetrain") ||
      haystack.includes("engine_size") ||
      haystack.includes("transmission_type") ||
      haystack.includes("trim")
    );
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
        const text = await response.text();
        let error: any = {};
        if (text) {
          try {
            error = JSON.parse(text);
          } catch {
            error = { message: text };
          }
        }
        const expectedOptionalMissing = this.isOptionalVehicleColumnMissing({
          code: error?.code,
          message: error?.message,
          details: error,
        });
        if (expectedOptionalMissing) {
          console.warn(`[SupabaseUserData] Optional vehicle column missing (schema not migrated yet).`);
        } else {
          console.error(`[SupabaseUserData] API Error: ${response.status}`, error);
        }

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
        const text = await response.text();
        if (!text) return null;
        try {
          return JSON.parse(text);
        } catch {
          throw {
            code: "invalid_json",
            message: "Supabase returned an invalid JSON payload.",
            details: text,
          };
        }
      }

      // POST/PATCH/DELETE return empty or modified rows
      const text = await response.text();
      if (!text) return null;
      try {
        return JSON.parse(text);
      } catch {
        throw {
          code: "invalid_json",
          message: "Supabase returned an invalid JSON payload.",
          details: text,
        };
      }
    } catch (error: any) {
      const errorCode = error?.code || 'unknown';
      const errorMsg = error?.message || 'Unknown error';
      const shouldTrackSupabaseError = !this.isOptionalVehicleColumnMissing(error);
      
      // Avoid noisy RedBox for known optional-column fallback path.
      if (this.isOptionalVehicleColumnMissing(error)) {
        console.warn(`[SupabaseUserData] API call fallback: ${errorMsg}`);
      } else {
        console.error(`[SupabaseUserData] API call failed (${errorCode}):`, errorMsg);
      }

      if (shouldTrackSupabaseError) {
        void trackAnalyticsEvent({
          eventName: "supabase_error",
          properties: {
            endpoint,
            method,
            code: errorCode,
            message: errorMsg,
          },
        });
      }
      
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

      let newProfile: any;
      try {
        newProfile = await this.apiCall(
          "/user_profiles",
          "POST",
          {
            user_id: userId,
            role,
            full_name: null,
            display_name: null,
            bio: null,
            avatar_url: null,
            chat_notifications_enabled: true,
            marketing_notifications_enabled: true,
          },
          currentToken
        );
      } catch (createErr: any) {
        // Another in-flight request already created this profile.
        const code = createErr?.code ?? createErr?.details?.code;
        if (String(code) === "23505") {
          const retryProfiles = await this.apiCall(
            `/user_profiles?user_id=eq.${userId}`,
            "GET",
            undefined,
            currentToken
          );
          if (Array.isArray(retryProfiles) && retryProfiles.length > 0) {
            return mapDbRowToProfile(retryProfiles[0]);
          }
        }
        throw createErr;
      }

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
      let createResult: any;
      try {
        createResult = await this.apiCall(
          "/user_profiles",
          "POST",
          {
            user_id: userId,
            ...cleanUpdates,
          },
          currentToken
        );
      } catch (createErr: any) {
        // Another caller created profile first; refetch and continue.
        const code = createErr?.code ?? createErr?.details?.code;
        if (String(code) === "23505") {
          const retryProfiles = await this.apiCall(
            `/user_profiles?user_id=eq.${userId}`,
            "GET",
            undefined,
            currentToken
          );
          if (Array.isArray(retryProfiles) && retryProfiles.length > 0) {
            return mapDbRowToProfile(retryProfiles[0]);
          }
        }
        throw createErr;
      }

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
        trim: vehicle.trim || null,
        engine_size: vehicle.engineSize || null,
        transmission_type: vehicle.transmissionType || null,
        drivetrain: vehicle.drivetrain || null,
        color: vehicle.color || null,
        plate: vehicle.plate || null,
        is_active: false,
      };

      console.log("[SupabaseUserData] ➤ Adding vehicle to user_vehicles table");
      console.log("[SupabaseUserData] Payload:", JSON.stringify(payload, null, 2));

      let result: any;
      try {
        result = await this.apiCall(
          "/user_vehicles",
          "POST",
          payload,
          currentToken
        );
      } catch (err: any) {
        const msg = String(err?.message || "");
        const detail = String(err?.details?.message || "");
        const missingNewColumns =
          msg.includes("engine_size") ||
          msg.includes("transmission_type") ||
          msg.includes("drivetrain") ||
          msg.includes("trim") ||
          detail.includes("engine_size") ||
          detail.includes("transmission_type") ||
          detail.includes("drivetrain") ||
          detail.includes("trim");
        if (!missingNewColumns) throw err;
        // Backward-compatible retry for schemas without the new optional columns.
        result = await this.apiCall(
          "/user_vehicles",
          "POST",
          {
            user_id: userId,
            nickname: vehicle.nickname,
            year: vehicle.year,
            make: vehicle.make,
            model: vehicle.model,
            color: vehicle.color || null,
            plate: vehicle.plate || null,
            is_active: false,
          },
          currentToken
        );
      }

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
      const mappedUpdates: Record<string, unknown> = {
        nickname: updates.nickname,
        year: updates.year,
        make: updates.make,
        model: updates.model,
        trim: updates.trim,
        engine_size: updates.engineSize,
        transmission_type: updates.transmissionType,
        drivetrain: updates.drivetrain,
        color: updates.color,
        plate: updates.plate,
      };
      const compact = Object.fromEntries(Object.entries(mappedUpdates).filter(([, v]) => v !== undefined));
      let result: any;
      try {
        result = await this.apiCall(
          `/user_vehicles?id=eq.${vehicleId}&user_id=eq.${userId}`,
          "PATCH",
          compact,
          currentToken
        );
      } catch (err: any) {
        const msg = String(err?.message || "");
        const detail = String(err?.details?.message || "");
        const missingNewColumns =
          msg.includes("engine_size") ||
          msg.includes("transmission_type") ||
          msg.includes("drivetrain") ||
          msg.includes("trim") ||
          detail.includes("engine_size") ||
          detail.includes("transmission_type") ||
          detail.includes("drivetrain") ||
          detail.includes("trim");
        if (!missingNewColumns) throw err;
        result = await this.apiCall(
          `/user_vehicles?id=eq.${vehicleId}&user_id=eq.${userId}`,
          "PATCH",
          {
            nickname: updates.nickname,
            year: updates.year,
            make: updates.make,
            model: updates.model,
            color: updates.color,
            plate: updates.plate,
          },
          currentToken
        );
      }

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

  async updateVehicleApproval(
    vehicleId: string,
    userId: string,
    updates: {
      insurance_doc_url?: string | null;
      registration_sticker_url?: string | null;
      approval_status?: "pending" | "approved" | "rejected";
    },
    sessionToken: string
  ): Promise<void> {
    try {
      const currentToken = await ensureValidAccessToken(sessionToken);
      await this.apiCall(
        `/user_vehicles?id=eq.${vehicleId}&user_id=eq.${userId}`,
        "PATCH",
        updates,
        currentToken
      );
    } catch (error: any) {
      // If columns are not present yet, caller can gracefully fall back.
      const msg = String(error?.message || "");
      const detail = String(error?.details?.message || "");
      const missingColumn =
        msg.includes("column") ||
        detail.includes("column") ||
        msg.includes("approval_status") ||
        msg.includes("insurance_doc_url") ||
        msg.includes("registration_sticker_url");
      if (missingColumn) {
        throw { code: "VEHICLE_APPROVAL_COLUMNS_MISSING", message: msg || detail };
      }
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
      // Every new photo (signup or a later retake) re-enters admin review —
      // clear any prior decision so a stale "approved"/"rejected" status
      // never carries over to unreviewed content. See migration 034.
      const dbPatch = mapAppUpdatesToDb({
        avatar_url,
        avatar_status: "pending_review",
        avatar_submitted_at: new Date().toISOString(),
        avatar_reviewed_at: null,
        avatar_reviewed_by: null,
        avatar_rejection_reason: null,
      });
      let result: any;
      try {
        result = await this.apiCall(
          `/user_profiles?user_id=eq.${userId}`,
          "PATCH",
          dbPatch,
          currentToken
        );
      } catch (err: any) {
        const msg = String(err?.message || "").toLowerCase();
        const detail = String(err?.details?.message || "").toLowerCase();
        const missingAvatarUrl = msg.includes("avatar_url") || detail.includes("avatar_url");
        if (!missingAvatarUrl) throw err;
        // Legacy schema fallback
        result = await this.apiCall(
          `/user_profiles?user_id=eq.${userId}`,
          "PATCH",
          { photo_url: avatar_url },
          currentToken
        );
      }

      // If no existing row, create a minimal profile row with avatar_url.
      if (!result || (Array.isArray(result) && result.length === 0)) {
        try {
          result = await this.apiCall(
            "/user_profiles",
            "POST",
            { user_id: userId, ...dbPatch },
            currentToken
          );
        } catch (createErr: any) {
          const code = String(createErr?.code ?? createErr?.details?.code ?? "");
          if (code === "23505") {
            // Profile already exists (race). Retry PATCH once.
            try {
              result = await this.apiCall(
                `/user_profiles?user_id=eq.${userId}`,
                "PATCH",
                dbPatch,
                currentToken
              );
            } catch (retryErr: any) {
              const msg = String(retryErr?.message || "").toLowerCase();
              const detail = String(retryErr?.details?.message || "").toLowerCase();
              const missingAvatarUrl = msg.includes("avatar_url") || detail.includes("avatar_url");
              if (!missingAvatarUrl) throw retryErr;
              result = await this.apiCall(
                `/user_profiles?user_id=eq.${userId}`,
                "PATCH",
                { photo_url: avatar_url },
                currentToken
              );
            }
          } else {
            throw createErr;
          }
        }
      }

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
