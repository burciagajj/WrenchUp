import { View, Text } from "react-native";
import { IconSymbol } from "@/components/ui/icon-symbol";

interface RatingStarsProps {
  rating: number; // 0..5
  size?: number;
  showNumber?: boolean;
  color?: string;
}

export function RatingStars({ rating, size = 14, showNumber = true, color = "#F59E0B" }: RatingStarsProps) {
  const stars = [1, 2, 3, 4, 5];
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
      {stars.map((s) => (
        <IconSymbol
          key={s}
          name={s <= Math.round(rating) ? "star.fill" : "star"}
          size={size}
          color={color}
        />
      ))}
      {showNumber ? (
        <Text style={{ marginLeft: 4, fontSize: size - 1, fontWeight: "600", color: "#475569" }}>
          {rating.toFixed(1)}
        </Text>
      ) : null}
    </View>
  );
}
