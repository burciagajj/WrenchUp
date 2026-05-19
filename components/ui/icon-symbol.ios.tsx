// On iOS, prefer SF Symbols. We import the shared mapping to ensure every name we use has a
// fallback to MaterialIcons if the SF Symbol is unavailable.
import { SymbolView, SymbolViewProps, SymbolWeight } from "expo-symbols";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ComponentProps } from "react";
import { StyleProp, ViewStyle } from "react-native";

// Subset of names guaranteed to be valid SF Symbols. Anything outside this list falls back to MaterialIcons.
const NATIVE_SF_SYMBOLS = new Set<string>([
  "house.fill",
  "list.bullet",
  "car.fill",
  "person.fill",
  "wrench.fill",
  "wrench.and.screwdriver.fill",
  "paperplane.fill",
  "chevron.right",
  "chevron.left",
  "chevron.down",
  "chevron.up",
  "xmark",
  "checkmark",
  "checkmark.circle.fill",
  "star.fill",
  "star",
  "phone.fill",
  "message.fill",
  "location.fill",
  "mappin.and.ellipse",
  "clock.fill",
  "clock",
  "creditcard.fill",
  "plus",
  "plus.circle.fill",
  "minus",
  "magnifyingglass",
  "gearshape.fill",
  "questionmark.circle.fill",
  "arrow.right",
  "arrow.left",
  "bolt.fill",
  "drop.fill",
  "thermometer",
  "exclamationmark.triangle.fill",
  "info.circle.fill",
  "trash.fill",
  "pencil",
  "ellipsis",
  "shield.fill",
  "tag.fill",
  "doc.text.fill",
  "snowflake",
  "fuelpump.fill",
]);

const FALLBACK_MAPPING: Record<string, ComponentProps<typeof MaterialIcons>["name"]> = {
  "engine.combustion.fill": "build",
  "car.side.fill": "directions-car",
};

export function IconSymbol({
  name,
  size = 24,
  color,
  style,
  weight = "regular",
}: {
  name: SymbolViewProps["name"] | string;
  size?: number;
  color: string;
  style?: StyleProp<ViewStyle>;
  weight?: SymbolWeight;
}) {
  if (!NATIVE_SF_SYMBOLS.has(name as string)) {
    const fallback = FALLBACK_MAPPING[name as string] ?? "build";
    return <MaterialIcons name={fallback} color={color} size={size} style={style as never} />;
  }
  return (
    <SymbolView
      weight={weight}
      tintColor={color}
      resizeMode="scaleAspectFit"
      name={name as SymbolViewProps["name"]}
      style={[
        {
          width: size,
          height: size,
        },
        style,
      ]}
    />
  );
}
