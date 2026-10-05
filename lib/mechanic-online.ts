import { Alert } from "react-native";
import type { AuthUser } from "@/lib/auth-context";
import type { AppState } from "@/lib/types";
import { resolveAuthSession } from "@/lib/resolve-auth-session";
import { supabaseUserData } from "@/lib/_core/supabase-user-data";
import { setMechanicPresence } from "@/lib/live-dispatch";
import { haptic } from "@/lib/haptics";
import { fetchLocationAndAddress } from "@/lib/location";

type DispatchFn = (action: { type: "SET_MECHANIC_ONLINE"; payload: boolean }) => void;
const MECHANIC_ONLINE_TIMEOUT_MS = 12_000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([
    promise.finally(() => {
      if (timeoutId) clearTimeout(timeoutId);
    }),
    timeoutPromise,
  ]) as Promise<T>;
}

export async function setMechanicOnlineState(input: {
  user: AuthUser | null;
  state: AppState;
  dispatch: DispatchFn;
  nextOnline: boolean;
  region: "US" | "MX";
  labels?: {
    verificationRequired: string;
    verificationRequiredBody: string;
    vehicleRequired: string;
    vehicleRequiredBody: string;
    suspended: string;
    suspendedBody: string;
    connectionIssue: string;
    verifyFailed: string;
    locationRequired?: string;
    locationRequiredBody?: string;
  };
}): Promise<boolean> {
  const { user, state, dispatch, nextOnline, region } = input;
  let alertShown = false;
  const showWarning = (title: string, body: string) => {
    alertShown = true;
    haptic.warning();
    Alert.alert(title, body);
  };

  if (nextOnline) {
    const resolved = await withTimeout(
      resolveAuthSession(user, (err) => {
        showWarning(input.labels?.verificationRequired ?? "Verification required", err.message);
      }),
      MECHANIC_ONLINE_TIMEOUT_MS,
      "Session lookup timed out",
    );
    if (!resolved || !user?.id) {
      if (!alertShown) {
        showWarning(
          input.labels?.verifyFailed ?? "Could not verify account",
          "Please sign in again to continue.",
        );
      }
      return false;
    }

    try {
      const profile = await withTimeout(
        supabaseUserData.getOrCreateProfile(user.id, "mechanic", resolved.sessionToken),
        MECHANIC_ONLINE_TIMEOUT_MS,
        "Profile lookup timed out",
      );
      if (profile.verification_status !== "approved") {
        showWarning(
          input.labels?.verificationRequired ?? "Verification pending",
          input.labels?.verificationRequiredBody ??
            "Your account is pending manual review. Upload your documents and wait for approval before going online.",
        );
        dispatch({ type: "SET_MECHANIC_ONLINE", payload: false });
        return false;
      }
    } catch (error) {
      console.error("[mechanic-online] Verification check failed:", error);
      showWarning(
        input.labels?.verifyFailed ?? "Could not verify account",
        "Please try again in a moment.",
      );
      return false;
    }

    const rated = state.jobs.filter((j) => j.mechanicId === user?.id && typeof j.rating === "number");
    if (rated.length >= 5) {
      const avg = rated.reduce((sum, j) => sum + (j.rating ?? 0), 0) / rated.length;
      if (avg < 4.2) {
        showWarning(
          input.labels?.suspended ?? "Account suspended",
          input.labels?.suspendedBody ??
            "Your average rating is below 4.2. Your mechanic account is temporarily suspended pending review.",
        );
        dispatch({ type: "SET_MECHANIC_ONLINE", payload: false });
        return false;
      }
    }

    const hasVehicleDocuments = state.vehicles.some(
      (v) =>
        !!v.insuranceDocUri &&
        !!v.registrationStickerUri &&
        v.approvalStatus !== "rejected",
    );
    if (!hasVehicleDocuments) {
      showWarning(
        input.labels?.vehicleRequired ?? "Vehicle documents required",
        input.labels?.vehicleRequiredBody ??
          "Upload insurance and registration sticker for at least one vehicle before going online.",
      );
      dispatch({ type: "SET_MECHANIC_ONLINE", payload: false });
      return false;
    }

    // Going online with no location access means customers can't be matched
    // to this mechanic (routing/ETA relies on live coords) — block rather
    // than silently going online with no way to receive real requests.
    try {
      const location = await withTimeout(
        fetchLocationAndAddress(),
        MECHANIC_ONLINE_TIMEOUT_MS,
        "Location permission check timed out",
      );
      if (location.status !== "granted") {
        showWarning(
          input.labels?.locationRequired ?? "Location access required",
          input.labels?.locationRequiredBody ??
            "Turn on location access so customers can be matched to you and see an accurate ETA. Enable it in your device settings, then try again.",
        );
        dispatch({ type: "SET_MECHANIC_ONLINE", payload: false });
        return false;
      }
    } catch (error) {
      console.error("[mechanic-online] Location permission check failed:", error);
      showWarning(
        input.labels?.locationRequired ?? "Location access required",
        "Could not verify location access. Please try again.",
      );
      return false;
    }
  }

  if (user?.id) {
    try {
      const resolved = await withTimeout(
        resolveAuthSession(user),
        MECHANIC_ONLINE_TIMEOUT_MS,
        "Session lookup timed out",
      );
      if (resolved) {
        const ok = await setMechanicPresence(
          resolved.sessionToken,
          user.id,
          state.userName || "Mechanic",
          nextOnline,
          region,
        );
        if (!ok) {
          showWarning(
            input.labels?.connectionIssue ?? "Connection issue",
            "Could not sync your online status. Please try again.",
          );
          return false;
        }
      }
    } catch (error) {
      console.error("[mechanic-online] Presence update failed:", error);
      showWarning(
        input.labels?.connectionIssue ?? "Connection issue",
        "Could not sync your online status. Please try again.",
      );
      return false;
    }
  }

  await haptic.medium();
  dispatch({ type: "SET_MECHANIC_ONLINE", payload: nextOnline });
  return true;
}
