import { ScrollView, View, Text, Pressable, Alert } from "react-native";
import { useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { ScreenContainer } from "@/components/screen-container";
import { PrimaryButton } from "@/components/primary-button";
import { PaymentMethodCard } from "@/components/payment-method-card";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth-context";
import { useColors } from "@/hooks/use-colors";
import { useT } from "@/hooks/use-locale";
import { cn } from "@/lib/utils";

export default function PaymentMethodsScreen() {
  const router = useRouter();
  const colors = useColors();
  const { state, dispatch } = useStore();
  const { user } = useAuth();
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
    const testCard = {
      id: `pm_test_4242_${Date.now()}`,
      type: "card" as const,
      card: {
        brand: "visa",
        last4: "4242",
        expMonth: 12,
        expYear: 2034,
      },
      billingDetails: {
        name: state.userName,
        email: user?.email?.trim() || "customer.test@wrenchup.app",
      },
    };

    dispatch({ type: "ADD_PAYMENT_METHOD", payload: testCard });
    dispatch({ type: "SET_DEFAULT_PAYMENT_METHOD", payload: testCard.id });
    Alert.alert("Test card added", "Visa •••• 4242 is now your default payment method.");
  };

  return (
    <ScreenContainer className="p-4">
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 120 }}>
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

      </ScrollView>
      <View className="absolute left-4 right-4 bottom-6">
        <PrimaryButton title="Use Test Card (4242)" onPress={handleAddCard} />
      </View>
    </ScreenContainer>
  );
}
