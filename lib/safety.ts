import { getApiUrl } from "@/lib/api-base-url";

export type SafetyRole = "customer" | "mechanic";
export type SafetyReportType =
  | "emergency"
  | "safety_issue"
  | "unsafe_situation"
  | "customer_no_show"
  | "safety_cancellation";

type SafetyBaseInput = {
  sessionToken: string;
  role: SafetyRole;
  requestId?: string | null;
  message?: string;
  photoUrls?: string[];
};

export async function createSafetyReport(
  input: SafetyBaseInput & { reportType: SafetyReportType },
): Promise<boolean> {
  if (!input.sessionToken || !input.role || !input.reportType) return false;
  try {
    const res = await fetch(getApiUrl("/api/safety"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.sessionToken}`,
      },
      body: JSON.stringify({
        action: "create_safety_report",
        role: input.role,
        requestId: input.requestId ?? null,
        reportType: input.reportType,
        message: input.message ?? "",
        photoUrls: input.photoUrls ?? [],
      }),
    });
    if (!res.ok) {
      console.warn("[safety] Safety report request failed:", await res.text());
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[safety] Safety report request failed:", error);
    return false;
  }
}

export async function createDispute(
  input: SafetyBaseInput & { reason: string },
): Promise<boolean> {
  if (!input.sessionToken || !input.role || !input.requestId || !input.reason.trim()) return false;
  try {
    const res = await fetch(getApiUrl("/api/safety"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.sessionToken}`,
      },
      body: JSON.stringify({
        action: "create_dispute",
        role: input.role,
        requestId: input.requestId,
        reason: input.reason,
        message: input.message ?? "",
        photoUrls: input.photoUrls ?? [],
      }),
    });
    if (!res.ok) {
      console.warn("[safety] Dispute request failed:", await res.text());
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[safety] Dispute request failed:", error);
    return false;
  }
}
