import { useEffect, useMemo, useRef } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import MapView from "react-native-maps";
import { useStore } from "@/lib/store";
import { regionFor } from "@/lib/geo";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { haptic } from "@/lib/haptics";

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
type HomeMapProps = {
  locateBottomOffset?: number;
};

export function HomeMap({ locateBottomOffset = 118 }: HomeMapProps) {
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
  const handleLocateMe = () => {
    if (!state.userCoords || !mapRef.current) return;
    haptic.light();
    mapRef.current.animateToRegion(regionFor([state.userCoords], 1.25), 350);
  };

  if (!state.hydrated) {
    return (
      <View style={styles.fallback}>
        <ActivityIndicator size="large" color="#F97316" />
      </View>
    );
  }

  // Dark map style (black background with dark green roads like Lyft driver app)
  const darkMapStyle = [
    { elementType: "geometry", stylers: [{ color: "#1a1a1a" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#8a8a8a" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a1a" }] },
    { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#2a2a2a" }] },
    { featureType: "administrative.land_parcel", elementType: "labels.text.fill", stylers: [{ color: "#6a6a6a" }] },
    { featureType: "poi", elementType: "geometry", stylers: [{ color: "#2a2a2a" }] },
    { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#6a6a6a" }] },
    { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#1a3a1a" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#2a2a2a" }] },
    { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#1a1a1a" }] },
    { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#3a3a3a" }] },
    { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3a4a3a" }] },
    { featureType: "road.local", elementType: "geometry", stylers: [{ color: "#2a2a2a" }] },
    { featureType: "transit", elementType: "geometry", stylers: [{ color: "#2a2a2a" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#0a1a2a" }] },
    { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#4a6a8a" }] },
  ];

  return (
    <View style={styles.root}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={region}
        customMapStyle={darkMapStyle}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        loadingEnabled
      />
      <Pressable
        onPress={handleLocateMe}
        style={({ pressed }) => [styles.locateBtn, { bottom: locateBottomOffset }, pressed && { opacity: 0.8 }]}
        accessibilityRole="button"
        accessibilityLabel="Locate me"
      >
        <IconSymbol name="location.fill" size={20} color="#FFFFFF" />
      </Pressable>
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
  locateBtn: {
    position: "absolute",
    bottom: 118,
    right: 16,
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "rgba(15, 23, 42, 0.88)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
});
