import { View, Text, Pressable } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useColors } from "@/hooks/use-colors";
import { cn } from "@/lib/utils";
import type { PaymentMethod } from "@/lib/types";
import { formatCardBrand, maskCardNumber } from "@/lib/stripe";

export function PaymentMethodCard({
  method,
  isDefault,
  onSelect,
  onDelete,
}: {
  method: PaymentMethod;
  isDefault: boolean;
  onSelect?: () => void;
  onDelete?: () => void;
}) {
  const colors = useColors();

  return (
    <Pressable
      onPress={onSelect}
      style={({ pressed }) => [
        {
          backgroundColor: isDefault ? colors.primary : colors.surface,
          borderColor: isDefault ? colors.primary : colors.border,
          borderWidth: 1,
          borderRadius: 12,
          padding: 16,
          marginBottom: 12,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-1">
          <View className="flex-row items-center gap-2 mb-2">
            <MaterialIcons
              name="credit-card"
              size={20}
              color={isDefault ? colors.background : colors.foreground}
            />
            <Text
              className={cn(
                "text-sm font-semibold",
                isDefault ? "text-background" : "text-foreground"
              )}
            >
              {formatCardBrand(method.card.brand)}
            </Text>
            {isDefault && (
              <View className="ml-auto bg-background px-2 py-1 rounded">
                <Text className="text-xs font-semibold text-primary">Default</Text>
              </View>
            )}
          </View>

          <Text
            className={cn(
              "text-base font-mono tracking-wider",
              isDefault ? "text-background opacity-90" : "text-foreground"
            )}
          >
            {maskCardNumber(method.card.last4)}
          </Text>

          <Text
            className={cn(
              "text-xs mt-2",
              isDefault ? "text-background opacity-75" : "text-muted"
            )}
          >
            Expires {method.card.expMonth}/{method.card.expYear}
          </Text>
        </View>

        {onDelete && (
          <Pressable
            onPress={onDelete}
            style={({ pressed }) => [
              {
                opacity: pressed ? 0.6 : 1,
                marginLeft: 12,
              },
            ]}
          >
            <MaterialIcons
              name="delete-outline"
              size={24}
              color={isDefault ? colors.background : colors.error}
            />
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}
