import React from "react";
import { Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

type Props = {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  label?: string;
  labelClassName?: string;
};

export function RingGauge({
  percentage,
  size = 48,
  strokeWidth = 5,
  color = "#FF6A39",
  trackColor = "rgba(255,255,255,0.08)",
  label,
  labelClassName = "text-wrench-text",
}: Props) {
  const safePercentage = Math.max(0, Math.min(100, percentage));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - safePercentage / 100);

  return (
    <View style={{ width: size, height: size }} className="items-center justify-center">
      <Svg width={size} height={size} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </Svg>
      {label ? <Text className={`font-display text-[11px] ${labelClassName}`}>{label}</Text> : null}
    </View>
  );
}
