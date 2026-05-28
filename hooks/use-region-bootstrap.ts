/**
 * Detects MX vs US for locale + pricing.
 * - Instant: device locale (no permission)
 * - Eager: requests GPS on sign-in / sign-up to refine country + service address
 */

import { useEffect, useRef } from "react";
import { useStore } from "@/lib/store";
import {
  detectRegionFromLocation,
  getDeviceRegionHint,
  isLocationDetectionInFlight,
} from "@/lib/region-detection";

type Options = {
  /** Request location permission and reverse-geocode (auth screens). */
  eager?: boolean;
};

export function useRegionBootstrap(options: Options = {}) {
  const { eager = false } = options;
  const { state, dispatch } = useStore();
  const localeHintApplied = useRef(false);
  const locationStarted = useRef(false);

  // Apply device locale as soon as store is hydrated (before GPS)
  useEffect(() => {
    if (!state.hydrated) return;
    if (localeHintApplied.current) return;

    const hint = getDeviceRegionHint();
    localeHintApplied.current = true;

    // Recovery path for stale cached US preference while device is clearly in MX.
    if (hint === "MX" && state.regionPreference === "US") {
      console.log("[useRegionBootstrap] Forcing auto region because device hint is MX");
      dispatch({ type: "SET_REGION_PREFERENCE", payload: "auto" });
      dispatch({ type: "SET_DETECTED_COUNTRY", payload: "MX" });
      return;
    }

    if (state.regionPreference !== "auto") return;

    if (hint && state.detectedCountry !== hint) {
      console.log("[useRegionBootstrap] Device locale region:", hint);
      dispatch({ type: "SET_DETECTED_COUNTRY", payload: hint });
    }
  }, [state.hydrated, state.regionPreference, state.detectedCountry, dispatch]);

  // GPS refinement + default service address (sign-in / sign-up / root)
  useEffect(() => {
    if (!state.hydrated) return;
    if (!eager) return;
    if (locationStarted.current || isLocationDetectionInFlight()) return;
    if (state.locationStatus === "granted" && state.userCoords && state.detectedCountry) {
      return;
    }

    locationStarted.current = true;

    dispatch({
      type: "SET_USER_COORDS",
      payload: { coords: state.userCoords, status: "requesting" },
    });

    detectRegionFromLocation()
      .then((result) => {
        if (!result) {
          dispatch({
            type: "SET_USER_COORDS",
            payload: { coords: state.userCoords, status: state.locationStatus === "idle" ? "denied" : state.locationStatus },
          });
          return;
        }

        if (result.status === "granted" && result.coords) {
          dispatch({
            type: "SET_USER_COORDS",
            payload: {
              coords: result.coords,
              status: "granted",
              address: result.address,
            },
          });
        } else {
          dispatch({
            type: "SET_USER_COORDS",
            payload: { coords: state.userCoords, status: "denied" },
          });
        }

        console.log("[useRegionBootstrap] Location region:", result.countryCode);
        dispatch({ type: "SET_DETECTED_COUNTRY", payload: result.countryCode });

        // If GPS says Mexico, force auto region so locale/currency switch to es-MX + MXN.
        if (result.countryCode === "MX" && state.regionPreference !== "auto") {
          dispatch({ type: "SET_REGION_PREFERENCE", payload: "auto" });
        }
      })
      .catch((err) => {
        console.error("[useRegionBootstrap] Region detection failed:", err);
        dispatch({
          type: "SET_USER_COORDS",
          payload: { coords: state.userCoords, status: "denied" },
        });
      });
  }, [
    state.hydrated,
    state.regionPreference,
    eager,
    dispatch,
    state.userCoords,
    state.locationStatus,
    state.detectedCountry,
  ]);
}
