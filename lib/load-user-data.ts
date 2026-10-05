/**
 * Loads Supabase profile + vehicles into the global store.
 * Used after login, session restore, and profile-complete.
 */

import type { Dispatch } from "react";
import { ensureValidAccessToken } from "@/lib/profile-session";
import { supabaseUserData, type UserVehicle } from "@/lib/_core/supabase-user-data";
import type { Action } from "@/lib/store-reducer";
import type { Vehicle } from "@/lib/types";

/** Minimal user fields required to load Supabase data (avoids circular import with auth-context). */
export type SyncAuthUser = {
  id: string;
  email: string;
  role: "customer" | "mechanic";
  fullName?: string | null;
  displayName?: string | null;
};

function mapDbVehicleToApp(v: UserVehicle & { is_active?: boolean }): Vehicle {
  return {
    id: v.id,
    nickname: v.nickname,
    year: v.year,
    make: v.make,
    model: v.model,
    trim: (v as UserVehicle & { trim?: string | null }).trim ?? undefined,
    engineSize: (v as UserVehicle & { engine_size?: string | null }).engine_size ?? undefined,
    transmissionType:
      ((v as UserVehicle & { transmission_type?: Vehicle["transmissionType"] | null }).transmission_type ?? undefined),
    drivetrain:
      ((v as UserVehicle & { drivetrain?: Vehicle["drivetrain"] | null }).drivetrain ?? undefined),
    color: v.color || "",
    plate: v.plate || "",
    insuranceDocUri: v.insurance_doc_url ?? null,
    registrationStickerUri: v.registration_sticker_url ?? null,
    approvalStatus: (v.approval_status as Vehicle["approvalStatus"]) ?? undefined,
  };
}

function pickSelectedVehicleId(dbVehicles: (UserVehicle & { is_active?: boolean })[]): string | null {
  const active = dbVehicles.find((v) => v.isActive === true || v.is_active === true);
  if (active?.id) return active.id;
  return dbVehicles[0]?.id ?? null;
}

function firstName(value?: string | null): string | null {
  const clean = value?.trim();
  if (!clean) return null;
  return clean.split(/\s+/)[0] ?? clean;
}

/**
 * Fetch profile and vehicles from Supabase and dispatch LOAD_USER_DATA.
 * Pass explicit authUser + sessionToken so this works immediately after sign-in
 * (before React state updates) and on cold start after session restore.
 */
export async function syncUserDataToStore(
  dispatch: Dispatch<Action>,
  authUser: SyncAuthUser,
  sessionToken: string
): Promise<{ hasVehicleApprovalFields: boolean; vehicles: Vehicle[] }> {
  if (!authUser.id) {
    console.warn("[syncUserDataToStore] Missing user id, skipping");
    return { hasVehicleApprovalFields: false, vehicles: [] };
  }
  if (!sessionToken) {
    console.warn("[syncUserDataToStore] Missing session token, skipping");
    return { hasVehicleApprovalFields: false, vehicles: [] };
  }

  console.log("[syncUserDataToStore] Loading data for user:", authUser.id);

  const freshToken = await ensureValidAccessToken(sessionToken);

  let profile = await supabaseUserData.getOrCreateProfile(
    authUser.id,
    authUser.role,
    freshToken
  );

  const missingProfileFields: Record<string, string> = {};
  if (!profile.email && authUser.email) {
    missingProfileFields.email = authUser.email;
  }
  if (!profile.role && authUser.role) {
    missingProfileFields.role = authUser.role;
  }
  if (!profile.full_name && authUser.fullName) {
    missingProfileFields.full_name = authUser.fullName;
  }
  if (!profile.display_name && (authUser.displayName || authUser.fullName)) {
    missingProfileFields.display_name = authUser.displayName || authUser.fullName || "";
  }

  if (Object.keys(missingProfileFields).length > 0) {
    profile = await supabaseUserData.updateProfile(
      authUser.id,
      missingProfileFields,
      freshToken,
      authUser.email
    );
  }

  const dbVehicles = await supabaseUserData.getUserVehicles(authUser.id, freshToken);
  const hasVehicleApprovalFields = dbVehicles.some((v) =>
    Object.prototype.hasOwnProperty.call(v as object, "approval_status") ||
    Object.prototype.hasOwnProperty.call(v as object, "insurance_doc_url") ||
    Object.prototype.hasOwnProperty.call(v as object, "registration_sticker_url")
  );
  const vehicles = dbVehicles.map(mapDbVehicleToApp);
  const selectedVehicleId = pickSelectedVehicleId(dbVehicles);

  const photoUrl = profile.avatar_url ?? null;

  dispatch({ type: "SET_USER_DATA_STATUS", payload: "loading" });

  dispatch({
    type: "LOAD_USER_DATA",
    payload: {
      userName:
        firstName(profile.display_name) ||
        firstName(profile.full_name) ||
        firstName(authUser.displayName) ||
        firstName(authUser.fullName) ||
        authUser.email,
      vehicles,
      selectedVehicleId,
      photoUrl,
      phoneNumber: profile.phone_number,
    },
  });

  console.log(`[syncUserDataToStore] Profile loaded: name="${profile.full_name ?? ""}", avatar=${photoUrl ? "yes" : "no"}`);
  console.log(`[syncUserDataToStore] Vehicles loaded: ${vehicles.length} items`);
  return { hasVehicleApprovalFields, vehicles };
}
