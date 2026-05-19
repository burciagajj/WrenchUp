import { ScrollView, View, Text, Pressable, Alert } from "react-native";
import { useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { ScreenContainer } from "@/components/screen-container";
import { PrimaryButton } from "@/components/primary-button";
import { PaymentMethodCard } from "@/components/payment-method-card";
import { useStore } from "@/lib/store";
import { useColors } from "@/hooks/use-colors";
import { useT } from "@/hooks/use-locale";
import { cn } from "@/lib/utils";

export default function PaymentMethodsScreen() {
  const router = useRouter();
  const colors = useColors();
  const { state, dispatch } = useStore();
  const t = useT();

  const handleSelectDefault = (methodId: string) => {
    dispatch({
      type: "SET_DEFAULT_PAYMENT_METHOD",
      payload: methodId,
    });
  };

  const handleDeleteMethod = (methodId: string) => {
    Alert.alert(t("payment.delete_confirm_title"), t("payment.delete_confirm_msg"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: () => {
          dispatch({
            type: "DELETE_PAYMENT_METHOD",
            payload: methodId,
          });
        },
      },
    ]);
  };

  const handleAddCard = () => {
    // TODO: Open Stripe card input sheet
    Alert.alert("Coming Soon", "Card input integration with Stripe coming soon");
  };

  return (
    <ScreenContainer className="p-4">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        {/* Header */}
        <View className="flex-row items-center justify-between mb-6">
          <View>
            <Text className="text-2xl font-bold text-foreground">{t("payment.methods_title")}</Text>
            <Text className="text-sm text-muted mt-1">{t("payment.methods_subtitle")}</Text>
          </View>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
          >
            <MaterialIcons name="close" size={24} color={colors.foreground} />
          </Pressable>
        </View>

        {/* Payment Methods List */}
        {state.paymentMethods.length > 0 ? (
          <View className="mb-6">
            {state.paymentMethods.map((method) => (
              <PaymentMethodCard
                key={method.id}
                method={method}
                isDefault={state.defaultPaymentMethodId === method.id}
                onSelect={() => handleSelectDefault(method.id)}
                onDelete={() => handleDeleteMethod(method.id)}
              />
            ))}
          </View>
        ) : (
          <View className="flex-1 items-center justify-center py-12">
            <MaterialIcons name="credit-card" size={48} color={colors.muted} />
            <Text className="text-center text-muted mt-4 text-base">{t("payment.no_methods")}</Text>
          </View>
        )}

        {/* Add Card Button */}
        <View className="mt-auto pt-6 border-t border-border">
          <PrimaryButton title={t("payment.add_card")} onPress={handleAddCard} />
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
