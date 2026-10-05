import { getCurrentUserId, getNotificationServiceConfig, supabaseRest } from "@/lib/notification-service";
import {
  ANALYTICS_EVENT_NAMES,
  type AnalyticsDashboardResponse,
  type AnalyticsEventName,
  type AnalyticsRegionFilter,
  type AnalyticsRow,
  normalizeAnalyticsProperties,
  buildAnalyticsDashboard,
} from "@/lib/analytics-core";

type AnalyticsInsertInput = {
  eventName: AnalyticsEventName;
  userId?: string | null;
  role?: "customer" | "mechanic" | null;
  properties?: Record<string, unknown>;
};

export function getAnalyticsServiceConfig() {
  return getNotificationServiceConfig();
}

export async function recordAnalyticsEvent(input: AnalyticsInsertInput): Promise<boolean> {
  if (!ANALYTICS_EVENT_NAMES.includes(input.eventName)) {
    return false;
  }

  const { supabaseUrl, serviceKey } = getAnalyticsServiceConfig();
  if (!supabaseUrl || !serviceKey) return false;

  try {
    await supabaseRest("/analytics_events", "POST", serviceKey, {
      user_id: input.userId ?? null,
      role: input.role ?? null,
      event_name: input.eventName,
      properties: normalizeAnalyticsProperties(input.properties ?? {}),
    });
    return true;
  } catch (error) {
    console.warn("[analytics-service] Failed to record event:", error);
    return false;
  }
}

export async function fetchAnalyticsRows(daysBack: number): Promise<AnalyticsRow[]> {
  const { supabaseUrl, serviceKey } = getAnalyticsServiceConfig();
  if (!supabaseUrl || !serviceKey) return [];

  const since = new Date();
  since.setDate(since.getDate() - Math.max(1, daysBack));

  try {
    const rows = await supabaseRest<AnalyticsRow[]>(
      `/analytics_events?created_at=gte.${encodeURIComponent(since.toISOString())}&order=created_at.asc&select=id,created_at,user_id,role,event_name,properties`,
      "GET",
      serviceKey,
    );
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    console.warn("[analytics-service] Failed to load analytics rows:", error);
    return [];
  }
}

export async function buildAnalyticsReport(region: AnalyticsRegionFilter): Promise<AnalyticsDashboardResponse> {
  const rows = await fetchAnalyticsRows(30);
  return buildAnalyticsDashboard(rows, region);
}

export { getCurrentUserId };

