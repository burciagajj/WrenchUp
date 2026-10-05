import Constants from "expo-constants";
import { Platform } from "react-native";
import { shouldUseMockPayments } from "./mock-payments";

/** Runtime wrapper used by the app to infer mock-payment mode from Expo/Web state. */
export function shouldUseMockPaymentsRuntime(): boolean {
  return shouldUseMockPayments({
    isDev: __DEV__,
    appOwnership: Constants.appOwnership ?? null,
    platform: Platform.OS,
    mockPaymentsFlag: process.env.EXPO_PUBLIC_ENABLE_MOCK_PAYMENTS ?? "",
  });
}
