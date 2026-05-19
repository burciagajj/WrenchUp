import { View, Text } from "react-native";
import { Image } from "expo-image";

interface AvatarProps {
  name: string;
  url?: string;
  size?: number;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const PALETTE = ["#F97316", "#10B981", "#3B82F6", "#A855F7", "#EAB308", "#EF4444"];

function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function Avatar({ name, url, size = 48 }: AvatarProps) {
  const bg = colorFor(name);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {url ? (
        <Image
          source={{ uri: url }}
          style={{ width: size, height: size }}
          contentFit="cover"
          transition={150}
        />
      ) : null}
      {!url ? (
        <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: size * 0.4 }}>
          {initials(name)}
        </Text>
      ) : null}
    </View>
  );
}
