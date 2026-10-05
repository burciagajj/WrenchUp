import { StyleSheet, Text, View } from "react-native";
import { useEffect, useMemo, useRef } from "react";
import MapView, { Marker, Polyline, type Region } from "react-native-maps";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { regionFor } from "@/lib/geo";
import type { LiveMapProps } from "./live-map-types";
import { useL } from "@/hooks/use-locale";

/**
 * Real-map version using react-native-maps. Shows the pickup pin, mechanic puck,
 * a connecting polyline, and any nearby mechanics. Renders Apple Maps on iOS,
 * Google Maps on Android by default.
 */
export function LiveMap({
  status,
  pickup,
  mechanic,
  nearby,
  etaMinutes,
  height = 220,
}: LiveMapProps) {
  const mapRef = useRef<MapView>(null);
  const L = useL();

  const points = useMemo(() => {
    const pts = [];
    if (pickup) pts.push(pickup);
    if (mechanic) pts.push(mechanic);
    if (nearby) for (const n of nearby) pts.push(n.coord);
    return pts;
  }, [pickup, mechanic, nearby]);

  const region: Region | undefined = useMemo(() => {
    if (points.length === 0) return undefined;
    return regionFor(points);
  }, [points]);

  // Animate to fit when points change
  useEffect(() => {
    if (!region || !mapRef.current) return;
    mapRef.current.animateToRegion(region, 600);
  }, [region]);

  const showRoute = !!(pickup && mechanic);

  return (
    <View style={[styles.container, { height }]}>
      {region ? (
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={region}
          showsUserLocation={false}
          showsCompass={false}
          showsMyLocationButton={false}
          toolbarEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
        >
          {nearby?.map((n) => (
            <Marker key={n.id} coordinate={n.coord} title={n.name ?? L("Mechanic", "Mecánico")}>
              <View style={styles.nearbyMarker}>
                <IconSymbol name="wrench.fill" size={12} color="#FFFFFF" />
              </View>
            </Marker>
          ))}
          {pickup ? (
            <Marker coordinate={pickup} title={L("Pickup", "Recogida")}>
              <View style={styles.pickupMarker}>
                <View style={styles.pickupInner} />
              </View>
            </Marker>
          ) : null}
          {mechanic ? (
            <Marker coordinate={mechanic} title={L("Mechanic", "Mecánico")} anchor={{ x: 0.5, y: 0.5 }}>
              <View style={styles.mechanicMarker}>
                <IconSymbol name="wrench.fill" size={16} color="#FFFFFF" />
              </View>
            </Marker>
          ) : null}
          {showRoute ? (
            <Polyline
              coordinates={[mechanic!, pickup!]}
              strokeColor="#F97316"
              strokeWidth={4}
              lineDashPattern={[6, 8]}
            />
          ) : null}
        </MapView>
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{L("Map unavailable", "Mapa no disponible")}</Text>
        </View>
      )}

      <View pointerEvents="none" style={styles.statusChipWrap}>
        <View style={styles.statusChip}>
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor:
                  status === "idle" ? "#94A3B8" : status === "searching" ? "#F59E0B" : "#F97316", // Orange tint for active map states
              },
            ]}
          />
          <Text style={styles.statusText}>{statusLabel(status, etaMinutes, L)}</Text>
        </View>
      </View>
    </View>
  );
}

function statusLabel(
  status: LiveMapProps["status"],
  eta: number | undefined,
  L: (en: string, es: string) => string,
): string {
  switch (status) {
    case "searching":
      return L("Searching for a nearby mechanic…", "Buscando mecánico cercano…");
    case "accepted":
    case "enroute":
    case "heading_there":
      return typeof eta === "number"
        ? L(`Mechanic in ${eta} min`, `Mecánico a ${eta} min`)
        : L("Mechanic on the way", "Mecánico en camino");
    case "arrived":
      return L("The mechanic has arrived", "El mecánico llegó");
    case "in_progress":
      return L("Service in progress", "Servicio en curso");
    case "completed":
      return L("Service completed", "Servicio completado");
    default:
      return L("Ready whenever you are", "Listo cuando tú lo estés");
  }
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    overflow: "hidden",
    borderRadius: 20,
    backgroundColor: "#0F172A",
    position: "relative",
  },
  empty: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: { color: "#F8FAFC", fontWeight: "800" },
  pickupMarker: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#F97316",
  },
  pickupInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#F97316",
  },
  mechanicMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  nearbyMarker: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#0F172A",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  statusChipWrap: {
    position: "absolute",
    top: 12,
    left: 12,
  },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(2, 6, 23, 0.94)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: { color: "#F8FAFC", fontSize: 12, fontWeight: "800" },
});
