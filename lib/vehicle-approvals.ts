import AsyncStorage from "@react-native-async-storage/async-storage";

type VehicleApproval = {
  insuranceDocUri?: string | null;
  registrationStickerUri?: string | null;
  approvalStatus?: "pending" | "approved" | "rejected";
};

const keyFor = (userId: string) => `wrenchup_vehicle_approvals_v1:${userId}`;

export async function loadVehicleApprovals(userId: string): Promise<Record<string, VehicleApproval>> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, VehicleApproval>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    console.error("[vehicle-approvals] load failed:", error);
    return {};
  }
}

export async function upsertVehicleApproval(
  userId: string,
  vehicleId: string,
  patch: VehicleApproval,
): Promise<void> {
  const all = await loadVehicleApprovals(userId);
  all[vehicleId] = {
    ...(all[vehicleId] ?? {}),
    ...patch,
  };
  await AsyncStorage.setItem(keyFor(userId), JSON.stringify(all));
}

export async function deleteVehicleApproval(userId: string, vehicleId: string): Promise<void> {
  const all = await loadVehicleApprovals(userId);
  delete all[vehicleId];
  await AsyncStorage.setItem(keyFor(userId), JSON.stringify(all));
}
