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
};

function mapDbVehicleToApp(v: UserVehicle & { is_active?: boolean }): Vehicle {
  return {
    id: v.id,
    nickname: v.nickname,
    year: v.year,
    make: v.make,
    model: v.model,
    color: v.color || "",
    plate: v.plate || "",
  };
}

function pickSelectedVehicleId(dbVehicles: (UserVehicle & { is_active?: boolean })[]): string | null {
  const active = dbVehicles.find((v) => v.isActive === true || v.is_active === true);
  if (active?.id) return active.id;
  return dbVehicles[0]?.id ?? null;
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
): Promise<void> {
  if (!authUser.id) {
    console.warn("[syncUserDataToStore] Missing user id, skipping");
    return;
  }
  if (!sessionToken) {
    console.warn("[syncUserDataToStore] Missing session token, skipping");
    return;
  }

  console.log("[syncUserDataToStore] Loading data for user:", authUser.id);

  const freshToken = await ensureValidAccessToken(sessionToken);

  const profile = await supabaseUserData.getOrCreateProfile(
    authUser.id,
    authUser.role,
    freshToken
  );

  const dbVehicles = await supabaseUserData.getUserVehicles(authUser.id, freshToken);
  const vehicles = dbVehicles.map(mapDbVehicleToApp);
  const selectedVehicleId = pickSelectedVehicleId(dbVehicles);

  const photoUrl = profile.avatar_url ?? null;

  dispatch({ type: "SET_USER_DATA_STATUS", payload: "loading" });

  dispatch({
    type: "LOAD_USER_DATA",
    payload: {
      userName: profile.full_name || authUser.email,
      vehicles,
      selectedVehicleId,
      photoUrl,
    },
  });

  console.log(`[syncUserDataToStore] Profile loaded: name="${profile.full_name ?? ""}", avatar=${photoUrl ? "yes" : "no"}`);
  console.log(`[syncUserDataToStore] Vehicles loaded: ${vehicles.length} items`);
}
