import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import MapView, { Marker, type Region } from "react-native-maps";
import { IconSymbol } from "@/components/ui/icon-symbol";

/**
 * Native implementation of the small map preview at the top of the
 * book-service screen. Kept as its own file (with a .web.tsx sibling) so
 * app/(tabs)/book-service.tsx never imports react-native-maps directly —
 * that import fails Metro's web export (react-native-maps has no web
 * codegen support), which blocks `npx expo export --platform web` /
 * EAS Hosting deploys. Same pattern as components/live-map.tsx +
 * components/live-map.web.tsx.
 */
type ServiceMapHeroProps = {
  mapRef: React.RefObject<MapView | null>;
  region: Region;
  customMapStyle: Record<string, unknown>[];
  markerCoordinate: { latitude: number; longitude: number };
  markerStyle: StyleProp<ViewStyle>;
};

export function ServiceMapHero({ mapRef, region, customMapStyle, markerCoordinate, markerStyle }: ServiceMapHeroProps) {
  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      initialRegion={region}
      customMapStyle={customMapStyle}
      showsUserLocation
      showsMyLocationButton={false}
      showsCompass={false}
      rotateEnabled={false}
      pitchEnabled={false}
      toolbarEnabled={false}
    >
      <Marker coordinate={markerCoordinate}>
        <View style={markerStyle}>
          <IconSymbol name="mappin.circle.fill" size={30} color="#FF5F0F" />
        </View>
      </Marker>
    </MapView>
  );
}
