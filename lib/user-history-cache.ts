import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Job, MechanicJob, PaymentMethod } from "@/lib/types";

type UserHistorySnapshot = {
  jobs: Job[];
  activeJobId: string | null;
  mechanicJobs: MechanicJob[];
  mechanicActiveJobId: string | null;
  paymentMethods: PaymentMethod[];
  defaultPaymentMethodId: string | null;
};

const keyFor = (userId: string) => `wrenchup_user_history_v1:${userId}`;

export async function loadUserHistory(userId: string): Promise<UserHistorySnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UserHistorySnapshot;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
      activeJobId: parsed.activeJobId ?? null,
      mechanicJobs: Array.isArray(parsed.mechanicJobs) ? parsed.mechanicJobs : [],
      mechanicActiveJobId: parsed.mechanicActiveJobId ?? null,
      paymentMethods: Array.isArray(parsed.paymentMethods) ? parsed.paymentMethods : [],
      defaultPaymentMethodId: parsed.defaultPaymentMethodId ?? null,
    };
  } catch (error) {
    console.error("[user-history-cache] load failed:", error);
    return null;
  }
}

export async function saveUserHistory(userId: string, snapshot: UserHistorySnapshot): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(userId), JSON.stringify(snapshot));
  } catch (error) {
    console.error("[user-history-cache] save failed:", error);
  }
}
