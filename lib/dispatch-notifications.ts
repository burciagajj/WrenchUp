import { getApiUrl } from "@/lib/api-base-url";
import type { DispatchNotificationEvent } from "@/lib/dispatch-notifications-core";

export type DispatchPushRequest = {
  sessionToken: string;
  requestId: string;
  event: DispatchNotificationEvent;
  initiatorUserId: string;
  actorUserId?: string | null;
};

export async function notifyDispatchEvent(input: DispatchPushRequest): Promise<boolean> {
  if (!input.sessionToken || !input.requestId || !input.event || !input.initiatorUserId) {
    return false;
  }
  try {
    const res = await fetch(getApiUrl("/api/dispatch-notify"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.sessionToken}`,
      },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const text = await res.text();
      console.warn("[dispatch-notifications] Push notification request failed:", text || res.statusText);
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[dispatch-notifications] Push notification request failed:", error);
    return false;
  }
}
