import { StyleSheet, View } from "react-native";
import { IconSymbol } from "@/components/ui/icon-symbol";

/**
 * Web fallback: react-native-maps has no web support, so this renders a
 * simple stylized placeholder instead of a real map. The parent
 * (book-service.tsx) already overlays the address as a location chip, so
 * nothing here depends on interactive map data — see service-map-hero.tsx
 * for the native version and the file header there for why this split
 * exists.
 */
type ServiceMapHeroWebProps = {
  markerStyle?: unknown;
};

export function ServiceMapHero(_props: ServiceMapHeroWebProps) {
  return (
    <View style={styles.fallback}>
      <IconSymbol name="mappin.circle.fill" size={36} color="#FF5F0F" />
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#1A1A2E",
    alignItems: "center",
    justifyContent: "center",
  },
});
