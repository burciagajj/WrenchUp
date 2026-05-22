import { useEffect, useMemo, useRef } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import MapView from "react-native-maps";
import { useStore } from "@/lib/store";
import { regionFor } from "@/lib/geo";

/** Default map center (El Paso) when GPS is not ready yet. */
const FALLBACK_REGION = {
  latitude: 31.7619,
  longitude: -106.485,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

/**
 * Full-screen home map — reads coords from the global store (useLocationBootstrap).
 * Does not request permissions on its own.
 */
export function HomeMap() {
  const { state } = useStore();
  const mapRef = useRef<MapView>(null);

  const region = useMemo(() => {
    if (state.userCoords) {
      return regionFor([state.userCoords], 1.25);
    }
    return FALLBACK_REGION;
  }, [state.userCoords?.latitude, state.userCoords?.longitude]);

  useEffect(() => {
    if (!state.userCoords || !mapRef.current) return;
    mapRef.current.animateToRegion(regionFor([state.userCoords], 1.25), 450);
  }, [state.userCoords?.latitude, state.userCoords?.longitude]);

  const locating = state.locationStatus === "requesting" && !state.userCoords;

  if (!state.hydrated) {
    return (
      <View style={styles.fallback}>
        <ActivityIndicator size="large" color="#F97316" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={region}
        showsUserLocation={state.locationStatus === "granted"}
        showsMyLocationButton={false}
        showsCompass={false}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        loadingEnabled
      />
      {locating ? (
        <View style={styles.locatingOverlay} pointerEvents="none">
          <ActivityIndicator size="small" color="#F97316" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#1a1a2e",
  },
  fallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#1a1a2e",
    alignItems: "center",
    justifyContent: "center",
  },
  locatingOverlay: {
    position: "absolute",
    top: 56,
    right: 16,
    backgroundColor: "rgba(15, 23, 42, 0.85)",
    borderRadius: 20,
    padding: 10,
  },
});
