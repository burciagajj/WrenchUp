import { StyleSheet, View } from "react-native";
import { IconSymbol } from "@/components/ui/icon-symbol";

/**
 * Web fallback for the home screen map — react-native-maps has no web
 * codegen support, so importing it here would break
 * `npx expo export --platform web` / EAS Hosting deploys. Same reasoning as
 * components/live-map.web.tsx and components/service-map-hero.web.tsx.
 */
type HomeMapProps = {
  locateBottomOffset?: number;
};

export function HomeMap(_props: HomeMapProps) {
  return (
    <View style={styles.root}>
      <IconSymbol name="location.fill" size={28} color="#F97316" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#1a1a2e",
    alignItems: "center",
    justifyContent: "center",
  },
});
