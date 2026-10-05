import { getApiUrl } from "@/lib/api-base-url";
import {
  ANALYTICS_EVENT_NAMES,
  type AnalyticsEventName,
  type AnalyticsRole,
} from "@/lib/analytics-core";

type AnalyticsTrackInput = {
  eventName: AnalyticsEventName;
  userId?: string | null;
  role?: AnalyticsRole;
  properties?: Record<string, unknown>;
  sessionToken?: string | null;
};

export async function trackAnalyticsEvent(input: AnalyticsTrackInput): Promise<boolean> {
  if (!ANALYTICS_EVENT_NAMES.includes(input.eventName)) return false;

  try {
    const res = await fetch(getApiUrl("/api/analytics"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(input.sessionToken ? { Authorization: `Bearer ${input.sessionToken}` } : {}),
      },
      body: JSON.stringify({
        eventName: input.eventName,
        userId: input.userId ?? null,
        role: input.role ?? null,
        properties: input.properties ?? {},
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn("[analytics] Event request failed:", text || res.statusText);
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[analytics] Event request failed:", error);
    return false;
  }
}

