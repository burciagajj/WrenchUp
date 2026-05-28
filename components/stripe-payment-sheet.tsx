import { useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useColors } from "@/hooks/use-colors";
import { useT } from "@/hooks/use-locale";
import { PaymentMethodCard } from "./payment-method-card";
import { PrimaryButton } from "./primary-button";
import type { PaymentMethod } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface StripePaymentSheetProps {
  amount: number;
  currency: "usd" | "mxn";
  savedMethods: PaymentMethod[];
  defaultMethodId: string | null;
  selectedMethodId: string | null;
  onSelectMethod: (methodId: string) => void;
  onAddNewCard: () => void;
  onAddTestCard?: () => void;
  onConfirmPayment: (methodId: string) => Promise<void>;
  loading?: boolean;
  error?: string | null;
}

export function StripePaymentSheet({
  amount,
  currency,
  savedMethods,
  defaultMethodId,
  selectedMethodId,
  onSelectMethod,
  onAddNewCard,
  onAddTestCard,
  onConfirmPayment,
  loading = false,
  error = null,
}: StripePaymentSheetProps) {
  const colors = useColors();
  const t = useT();
  const [processing, setProcessing] = useState(false);
  const isBusy = processing || loading;

  const selectedMethod = savedMethods.find((m) => m.id === selectedMethodId);
  const currencySymbol = currency === "mxn" ? "$" : "$";
  const currencyCode = currency === "mxn" ? "MXN" : "USD";

  const handleConfirm = async () => {
    if (isBusy) return;
    if (!selectedMethodId) return;
    setProcessing(true);
    try {
      await onConfirmPayment(selectedMethodId);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <View className="gap-4">
      {/* Amount Summary */}
      <View
        className="p-4 rounded-lg"
        style={{ backgroundColor: colors.surface }}
      >
        <Text className="text-sm text-muted mb-1">{t("confirm.fare_estimate" as any)}</Text>
        <View className="flex-row items-baseline justify-between">
          <Text className="text-3xl font-bold text-foreground">
            {currencySymbol}
            {(amount / 100).toFixed(2)}
          </Text>
          <Text className="text-sm font-semibold text-muted">{currencyCode}</Text>
        </View>
      </View>

      {/* Error Message */}
      {error && (
        <View className="p-3 bg-error/10 rounded-lg border border-error">
          <Text className="text-sm text-error">{error}</Text>
        </View>
      )}

      {/* Saved Payment Methods */}
      {savedMethods.length > 0 && (
        <View>
          <Text className="text-sm font-semibold text-foreground mb-3">
            {t("confirm.payment_card" as any)}
          </Text>
          {savedMethods.map((method) => (
            <Pressable
              key={method.id}
              onPress={() => onSelectMethod(method.id)}
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
            >
              <View
                className={cn(
                  "border-2 rounded-lg p-3 mb-2",
                  selectedMethodId === method.id
                    ? "border-primary"
                    : "border-border"
                )}
              >
                <View className="flex-row items-center gap-3">
                  <View
                    className={cn(
                      "w-5 h-5 rounded-full border-2 items-center justify-center",
                      selectedMethodId === method.id
                        ? "border-primary bg-primary"
                        : "border-border"
                    )}
                  >
                    {selectedMethodId === method.id && (
                      <MaterialIcons
                        name="check"
                        size={14}
                        color={colors.background}
                      />
                    )}
                  </View>
                  <View className="flex-1">
                    <Text className="font-semibold text-foreground">
                      {method.card.brand.toUpperCase()} •••• {method.card.last4}
                    </Text>
                    <Text className="text-xs text-muted">
                      Expires {method.card.expMonth}/{method.card.expYear}
                    </Text>
                  </View>
                </View>
              </View>
            </Pressable>
          ))}
        </View>
      )}

      {/* Add New Card Button */}
      <View className="gap-2">
        <Pressable
          onPress={onAddNewCard}
          style={({ pressed }) => [
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderWidth: 1,
              borderRadius: 8,
              padding: 12,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <View className="flex-row items-center justify-center gap-2">
            <MaterialIcons name="add" size={20} color={colors.primary} />
            <Text className="font-semibold text-primary">
              {t("payment.add_card" as any)}
            </Text>
          </View>
        </Pressable>
        {onAddTestCard ? (
          <Pressable
            onPress={onAddTestCard}
            style={({ pressed }) => [
              {
                backgroundColor: colors.surface,
                borderColor: "#F97316",
                borderWidth: 1,
                borderRadius: 8,
                padding: 12,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <View className="flex-row items-center justify-center gap-2">
              <MaterialIcons name="science" size={18} color="#F97316" />
              <Text className="font-semibold" style={{ color: "#F97316" }}>
                Use Test Card (4242)
              </Text>
            </View>
          </Pressable>
        ) : null}
      </View>

      {/* Confirm Payment Button */}
      <PrimaryButton
        title={
          isBusy
            ? t("common.searching" as any)
            : `${t("common.confirm" as any)} Payment`
        }
        onPress={handleConfirm}
        disabled={!selectedMethodId || isBusy}
        loading={isBusy}
      />
    </View>
  );
}
