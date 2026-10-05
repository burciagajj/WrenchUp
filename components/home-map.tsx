import { useEffect, useMemo, useRef } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import MapView from "react-native-maps";
import { useStoreSelector } from "@/lib/store";
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

// Dark map style with teal tint on roads and parks (instead of green).
// Kept at module scope (not recreated per render) — customMapStyle getting a
// new array identity on every render (e.g. from userCoords updating as GPS
// refines) makes react-native-maps re-trigger Android's native setMapStyle()
// repeatedly, which can interrupt tile loading before it ever completes.
const DARK_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#1a1a1a" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8a8a8a" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a1a" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#2a2a2a" }] },
  { featureType: "administrative.land_parcel", elementType: "labels.text.fill", stylers: [{ color: "#6a6a6a" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#2a2a2a" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#6a6a6a" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#0f3d3a" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2a2a2a" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#1a1a1a" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#2f3f3c" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#2a3f3c" }] },
  { featureType: "road.local", elementType: "geometry", stylers: [{ color: "#2a2a2a" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#2a2a2a" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0a1a2a" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#4a6a8a" }] },
];

/**
 * Full-screen home map — reads coords from the global store (useLocationBootstrap).
 * Does not request permissions on its own.
 */
type HomeMapProps = {
  locateBottomOffset?: number;
};

export function HomeMap({ locateBottomOffset = 118 }: HomeMapProps) {
  const userCoords = useStoreSelector(s => s.userCoords);
  const locationStatus = useStoreSelector(s => s.locationStatus);
  const mapRef = useRef<MapView>(null);

  const region = useMemo(() => {
    if (userCoords) {
      return regionFor([userCoords], 1.25);
    }
    return FALLBACK_REGION;
  }, [userCoords?.latitude, userCoords?.longitude]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!userCoords || !mapRef.current) return;
    mapRef.current.animateToRegion(regionFor([userCoords], 1.25), 450);
  }, [userCoords?.latitude, userCoords?.longitude]); // eslint-disable-line react-hooks/exhaustive-deps

  const locating = locationStatus === "requesting" && !userCoords;
  const handleLocateMe = () => {
    if (!userCoords || !mapRef.current) return;
    haptic.light();
    mapRef.current.animateToRegion(regionFor([userCoords], 1.25), 350);
  };

  // Do not block rendering on !hydrated here (outer AppBootstrapGate + force-ready
  // handles initial wait; keeping map mounted allows graceful population of coords
  // and prevents permanent buffering spinner in the map area if gate forces early).

  return (
    <View style={styles.root}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={region}
        customMapStyle={DARK_MAP_STYLE}
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
