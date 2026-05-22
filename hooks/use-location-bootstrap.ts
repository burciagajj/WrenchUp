import { useEffect, useRef } from "react";
import { useStore } from "@/lib/store";
import { detectRegionFromLocation, isLocationDetectionInFlight } from "@/lib/region-detection";

/**
 * Home screen: fetch coords/address if auth bootstrap did not already grant location.
 */
export function useLocationBootstrap() {
  const { state, dispatch } = useStore();
  const requestedRef = useRef(false);

  useEffect(() => {
    if (!state.hydrated) return;
    if (requestedRef.current) return;
    if (state.locationStatus === "granted" && state.userCoords) return;
    if (isLocationDetectionInFlight()) return;
    requestedRef.current = true;

    dispatch({
      type: "SET_USER_COORDS",
      payload: { coords: state.userCoords, status: "requesting" },
    });

    detectRegionFromLocation().then((result) => {
      if (result?.status === "granted" && result.coords) {
        dispatch({
          type: "SET_USER_COORDS",
          payload: { coords: result.coords, status: "granted", address: result.address },
        });
        if (state.regionPreference === "auto") {
          dispatch({ type: "SET_DETECTED_COUNTRY", payload: result.countryCode });
        }
      } else {
        dispatch({
          type: "SET_USER_COORDS",
          payload: { coords: state.userCoords, status: "denied" },
        });
      }
    });
  }, [state.hydrated, state.locationStatus, state.userCoords, state.regionPreference, dispatch]);
}
