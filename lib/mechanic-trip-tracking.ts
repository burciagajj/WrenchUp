/**
 * Background GPS for a mechanic's active trip.
 *
 * Foreground-only tracking (watchPositionAsync on app/mechanic/active.tsx)
 * stops the moment the mechanic switches to Google Maps / Waze or locks the
 * phone, which is how most real trips are driven — so driven distance froze
 * and a customer cancelling during that gap was never charged the
 * cancellation fee. This runs the location task through expo-task-manager,
 * with an Android foreground-service notification, while a job is active.
 *
 * The task stops itself when the server says the job is no longer active
 * (updateMechanicLocation matches no row), when the mechanic is signed out,
 * or after MAX_TRIP_TRACKING_MS, so it can't outlive the trip even if the
 * screen that started it is gone.
 *
 * Importing this module registers the task; it must be imported at app
 * start (app/_layout.tsx) so the OS can wake it with the app closed.
 */
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { getSessionToken } from "@/lib/session-tokens";
import { updateMechanicLocation } from "@/lib/live-dispatch";
import {
  isTripTrackingExpired,
  latestLocation,
  parseTripTrackingContext,
  shouldReaskBackgroundPermission,
  type TripTrackingContext,
} from "@/lib/mechanic-trip-tracking-core";

export const MECHANIC_TRIP_TASK = "wrenchup-mechanic-trip-location";
const CONTEXT_KEY = "wrenchup_mechanic_trip_context";
const DECLINED_AT_KEY = "wrenchup_background_location_declined_at";

const isNative = Platform.OS === "ios" || Platform.OS === "android";

async function readContext(): Promise<TripTrackingContext | null> {
  return parseTripTrackingContext(await AsyncStorage.getItem(CONTEXT_KEY).catch(() => null));
}

if (isNative && !TaskManager.isTaskDefined(MECHANIC_TRIP_TASK)) {
  TaskManager.defineTask<{ locations?: Location.LocationObject[] }>(MECHANIC_TRIP_TASK, async ({ data, error }) => {
    if (error) {
      console.warn("[mechanic-trip-tracking] Location task error:", error.message);
      return;
    }
    const latest = latestLocation(data?.locations);
    if (!latest) return;

    const context = await readContext();
    if (!context || isTripTrackingExpired(context, Date.now())) {
      await stopMechanicTripTracking();
      return;
    }
    const token = await getSessionToken().catch(() => null);
    if (!token) {
      // Signed out: nothing can be sent, so don't keep the service running.
      await stopMechanicTripTracking();
      return;
    }
    try {
      const { active } = await updateMechanicLocation(token, context.requestId, context.mechanicUserId, latest.coords);
      if (!active) await stopMechanicTripTracking();
    } catch (err) {
      // Network blips: keep tracking, the next fix will retry.
      console.warn("[mechanic-trip-tracking] Location sync failed:", err);
    }
  });
}

export async function hasBackgroundLocationPermission(): Promise<boolean> {
  if (!isNative) return false;
  const perm = await Location.getBackgroundPermissionsAsync().catch(() => null);
  return perm?.status === "granted";
}

/** Whether to show the background-location disclosure before this trip. */
export async function shouldOfferBackgroundLocation(): Promise<boolean> {
  if (!isNative || (await hasBackgroundLocationPermission())) return false;
  const raw = await AsyncStorage.getItem(DECLINED_AT_KEY).catch(() => null);
  const declinedAt = raw ? Number(raw) : null;
  return shouldReaskBackgroundPermission(Number.isFinite(declinedAt) ? declinedAt : null, Date.now());
}

/**
 * Asks for "Allow all the time". Must only be called after the in-app
 * disclosure (Google Play's prominent-disclosure requirement).
 */
export async function requestBackgroundLocationPermission(): Promise<boolean> {
  if (!isNative) return false;
  const foreground = await Location.requestForegroundPermissionsAsync().catch(() => null);
  if (foreground?.status !== "granted") return false;
  const background = await Location.requestBackgroundPermissionsAsync().catch(() => null);
  const granted = background?.status === "granted";
  if (granted) {
    await AsyncStorage.removeItem(DECLINED_AT_KEY).catch(() => {});
  } else {
    await recordBackgroundLocationDeclined();
  }
  return granted;
}

export async function recordBackgroundLocationDeclined(): Promise<void> {
  await AsyncStorage.setItem(DECLINED_AT_KEY, String(Date.now())).catch(() => {});
}

/**
 * Starts (or retargets) background tracking for a trip. Returns "background"
 * when the OS task is running, "foreground_only" when background permission
 * isn't granted — the screen's own watch then has to send fixes.
 */
export async function startMechanicTripTracking(
  requestId: string,
  mechanicUserId: string,
): Promise<"background" | "foreground_only"> {
  if (!isNative) return "foreground_only";

  const existing = await readContext();
  const context: TripTrackingContext =
    existing && existing.requestId === requestId && existing.mechanicUserId === mechanicUserId
      ? existing
      : { requestId, mechanicUserId, startedAt: Date.now() };
  await AsyncStorage.setItem(CONTEXT_KEY, JSON.stringify(context));

  if (!(await hasBackgroundLocationPermission())) return "foreground_only";

  const running = await Location.hasStartedLocationUpdatesAsync(MECHANIC_TRIP_TASK).catch(() => false);
  if (running) return "background";

  try {
    await Location.startLocationUpdatesAsync(MECHANIC_TRIP_TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: 5000,
      distanceInterval: 10,
      pausesUpdatesAutomatically: false,
      activityType: Location.ActivityType.AutomotiveNavigation,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "WrenchUp trip in progress",
        notificationBody: "Sharing your location with the customer until this job ends.",
        notificationColor: "#F97316",
        killServiceOnDestroy: false,
      },
    });
    return "background";
  } catch (err) {
    console.warn("[mechanic-trip-tracking] Could not start background updates:", err);
    return "foreground_only";
  }
}

export async function stopMechanicTripTracking(): Promise<void> {
  await AsyncStorage.removeItem(CONTEXT_KEY).catch(() => {});
  if (!isNative) return;
  const running = await Location.hasStartedLocationUpdatesAsync(MECHANIC_TRIP_TASK).catch(() => false);
  if (running) {
    await Location.stopLocationUpdatesAsync(MECHANIC_TRIP_TASK).catch((err) => {
      console.warn("[mechanic-trip-tracking] Could not stop background updates:", err);
    });
  }
}
