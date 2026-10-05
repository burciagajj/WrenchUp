export type SafetyDispatchVisibilityInput = {
  status: string;
  assignedMechanicUserId?: string | null;
  mechanicAcceptedAt?: string | number | null;
};

export function canMechanicSeeExactCustomerLocation(
  request: SafetyDispatchVisibilityInput,
  mechanicUserId: string | null | undefined,
): boolean {
  if (!mechanicUserId) return false;
  if (request.assignedMechanicUserId !== mechanicUserId) return false;
  return (
    !!request.mechanicAcceptedAt ||
    request.status === "accepted" ||
    request.status === "enroute" ||
    request.status === "arrived" ||
    request.status === "in_progress" ||
    request.status === "completed"
  );
}

export function toLocationArea(location: string): string {
  const parts = location.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) return parts.slice(-2).join(", ");
  return parts[0]?.replace(/^\d+\s+/, "") || "Service area";
}

export function paymentStateAfterDisputeCheck(
  requestedState: "escrow_hold" | "ready_for_release" | "released" | "dispute_hold" | undefined,
  hasOpenDispute: boolean,
): "escrow_hold" | "ready_for_release" | "released" | "dispute_hold" | undefined {
  if (requestedState === "ready_for_release" && hasOpenDispute) return "dispute_hold";
  return requestedState;
}
