// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolWeight } from "expo-symbols";
import { ComponentProps } from "react";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";

type IconMapping = Record<string, ComponentProps<typeof MaterialIcons>["name"]>;
type IconSymbolName = keyof typeof MAPPING;

/**
 * SF Symbols -> Material Icons mappings.
 */
const MAPPING = {
  "house.fill": "home",
  "list.bullet": "list",
  "car.fill": "directions-car",
  "person.fill": "person",
  "wrench.fill": "build",
  "wrench.and.screwdriver.fill": "build",
  "paperplane.fill": "send",
  mail: "mail",
  "lock.fill": "lock",
  "chevron.left.forwardslash.chevron.right": "code",
  "chevron.right": "chevron-right",
  "chevron.left": "chevron-left",
  "chevron.down": "expand-more",
  "chevron.up": "expand-less",
  "xmark": "close",
  "checkmark": "check",
  "checkmark.circle.fill": "check-circle",
  "star.fill": "star",
  "star": "star-outline",
  "phone.fill": "phone",
  "message.fill": "chat",
  "location.fill": "place",
  "mappin.and.ellipse": "place",
  "clock.fill": "schedule",
  "clock": "schedule",
  "creditcard.fill": "credit-card",
  "plus": "add",
  "plus.circle.fill": "add-circle",
  "minus": "remove",
  "magnifyingglass": "search",
  "gearshape.fill": "settings",
  "bell.fill": "notifications",
  "bell.badge.fill": "notifications-active",
  // "questionmark.circle.fill" intentionally removed. Never use generic "?" help icons.
  // Replace with context-specific icons:
  // - Information / tips → "info.circle.fill" or "lightbulb.fill"
  // - Warnings / important → "exclamationmark.triangle.fill"
  // - Help & FAQ → "questionmark" replaced with "chatbubble.ellipsis" or "person.2.fill"
  "arrow.right": "arrow-forward",
  "arrow.left": "arrow-back",
  "arrow.clockwise": "refresh",
  "bolt.fill": "bolt",
  "key.fill": "vpn-key",
  "wheel.circle.fill": "trip-origin",
  "drop.fill": "opacity",
  "drop.circle.fill": "bubble-chart",
  "soap.fill": "soap",
  "obd.scanner.fill": "qr-code-scanner",
  checklist: "fact-check",
  "thermometer": "thermostat",
  "engine.combustion.fill": "build",
  "exclamationmark.triangle.fill": "warning",
  "info.circle.fill": "info",
  "trash.fill": "delete",
  "pencil": "edit",
  "ellipsis": "more-horiz",
  "shield.fill": "verified-user",
  "tag.fill": "local-offer",
  "doc.text.fill": "receipt",
  "snowflake": "ac-unit",
  "car.side.fill": "directions-car",
  "fuelpump.fill": "local-gas-station",
  sparkles: "auto-awesome",
  "line.3.horizontal": "menu",
  "chart.bar.fill": "bar-chart",
  "camera.fill": "photo-camera",
} as IconMapping;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName | string;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  const mapped = MAPPING[name as string] ?? ("info" as ComponentProps<typeof MaterialIcons>["name"]); // Better fallback than generic "?" help icon
  return <MaterialIcons color={color} size={size} name={mapped} style={style} />;
}
