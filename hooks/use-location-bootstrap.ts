import { useEffect, useRef } from "react";
import { useStore } from "@/lib/store";
import { fetchLocationAndAddress } from "@/lib/location";

/**
 * Bootstraps location once after app hydration. Subsequent re-renders won't trigger again.
 * Caller (typically the Home screen) owns the lifecycle.
 */
export function useLocationBootstrap() {
  const { state, dispatch } = useStore();
  const requestedRef = useRef(false);

  useEffect(() => {
    if (!state.hydrated) return;
    if (requestedRef.current) return;
    if (state.locationStatus === "granted" && state.userCoords) return;
    requestedRef.current = true;

    dispatch({
      type: "SET_USER_COORDS",
      payload: { coords: state.userCoords, status: "requesting" },
    });

    fetchLocationAndAddress().then((res) => {
      if (res.status === "granted" && res.coords) {
        dispatch({
          type: "SET_USER_COORDS",
          payload: { coords: res.coords, status: "granted", address: res.address },
        });
        if (res.countryCode === "MX" || res.countryCode === "US") {
          dispatch({ type: "SET_DETECTED_COUNTRY", payload: res.countryCode });
        }
      } else {
        dispatch({
          type: "SET_USER_COORDS",
          payload: { coords: state.userCoords, status: "denied" },
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.hydrated]);
}
