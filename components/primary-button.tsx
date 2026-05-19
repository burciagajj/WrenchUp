import { Pressable, Text, ActivityIndicator, View, type PressableProps } from "react-native";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";

export interface PrimaryButtonProps extends Omit<PressableProps, "style"> {
  title: string;
  variant?: Variant;
  loading?: boolean;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
  fullWidth?: boolean;
  size?: "md" | "lg";
  hapticType?: "light" | "medium" | "success" | "error" | "none";
}

const VARIANT_STYLES: Record<Variant, { bg: string; text: string; border?: string }> = {
  primary: { bg: "#F97316", text: "#FFFFFF" },
  secondary: { bg: "transparent", text: "#0F172A", border: "#E2E8F0" },
  ghost: { bg: "transparent", text: "#F97316" },
  danger: { bg: "#EF4444", text: "#FFFFFF" },
};

export function PrimaryButton({
  title,
  variant = "primary",
  loading,
  disabled,
  iconLeft,
  iconRight,
  fullWidth = true,
  size = "lg",
  hapticType = "light",
  onPress,
  ...rest
}: PrimaryButtonProps) {
  const colors = VARIANT_STYLES[variant];
  const isDisabled = disabled || loading;

  const handlePress = (e: any) => {
    if (isDisabled) return;
    if (hapticType === "light") haptic.light();
    else if (hapticType === "medium") haptic.medium();
    else if (hapticType === "success") haptic.success();
    else if (hapticType === "error") haptic.error();
    onPress?.(e);
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={isDisabled}
      style={({ pressed }) => [
        {
          backgroundColor: colors.bg,
          borderColor: colors.border,
          borderWidth: colors.border ? 1 : 0,
          opacity: isDisabled ? 0.5 : pressed ? 0.92 : 1,
          transform: pressed && !isDisabled ? [{ scale: 0.97 }] : [{ scale: 1 }],
          paddingVertical: size === "lg" ? 16 : 12,
          paddingHorizontal: 20,
          borderRadius: 14,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          width: fullWidth ? "100%" : undefined,
        },
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={colors.text} />
      ) : (
        <View className={cn("flex-row items-center justify-center gap-2")}>
          {iconLeft}
          <Text style={{ color: colors.text, fontSize: size === "lg" ? 16 : 14, fontWeight: "700" }}>
            {title}
          </Text>
          {iconRight}
        </View>
      )}
    </Pressable>
  );
}
