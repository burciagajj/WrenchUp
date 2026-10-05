import type { Role } from "@/lib/types";

export const ANALYTICS_EVENT_NAMES = [
  "signup_started",
  "signup_completed",
  "request_created",
  "mechanic_matched",
  "mechanic_offer_sent",
  "mechanic_accepted_request",
  "customer_accepted_quote",
  "chat_opened",
  "job_completed",
  "review_submitted",
  "signup_failed",
  "request_failed",
  "match_failed",
  "chat_send_failed",
  "notification_failed",
  "auth_failed",
  "supabase_error",
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];

export const AUTHENTICATED_ANALYTICS_EVENTS = new Set<AnalyticsEventName>([
  "request_created",
  "mechanic_matched",
  "mechanic_offer_sent",
  "mechanic_accepted_request",
  "customer_accepted_quote",
  "chat_opened",
  "job_completed",
  "review_submitted",
]);

export const PUBLIC_ANALYTICS_EVENTS = new Set<AnalyticsEventName>([
  "signup_started",
  "signup_completed",
  "signup_failed",
  "request_failed",
  "match_failed",
  "chat_send_failed",
  "notification_failed",
  "auth_failed",
  "supabase_error",
]);

export const ANALYTICS_REGION_FILTERS = ["all", "el_paso", "juarez"] as const;

export type AnalyticsRegionFilter = (typeof ANALYTICS_REGION_FILTERS)[number];
export type AnalyticsRegionCode = "US" | "MX";
export type AnalyticsRole = Role | null;

export type AnalyticsRow = {
  id: string;
  created_at: string;
  user_id: string | null;
  role: AnalyticsRole;
  event_name: AnalyticsEventName | string;
  properties: Record<string, unknown> | null;
};

export type AnalyticsSeriesPoint = {
  date: string;
  label: string;
  requests: number;
  matches: number;
  completed: number;
  revenue: number;
};

export type AnalyticsDashboardSummary = {
  requestsToday: number;
  matchesToday: number;
  completedJobsToday: number;
  matchRate: number;
  completionRate: number;
  averageEtaMinutes: number | null;
  averageResponseTimeMinutes: number | null;
  revenue: number;
  activeMechanics: number;
  activeCustomers: number;
};

export type AnalyticsDashboardResponse = {
  region: AnalyticsRegionFilter;
  summary: AnalyticsDashboardSummary;
  series7: AnalyticsSeriesPoint[];
  series30: AnalyticsSeriesPoint[];
  updatedAt: string;
};

const ANALYTICS_TIME_ZONE = "America/Denver";
function getDayKey(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: ANALYTICS_TIME_ZONE });
}

function getDayLabel(date: Date): string {
  return date.toLocaleDateString("en-US", {
    timeZone: ANALYTICS_TIME_ZONE,
    month: "short",
    day: "numeric",
  });
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeAnalyticsRegionFilter(value: string | null | undefined): AnalyticsRegionFilter {
  const normalized = (value ?? "").trim().toLowerCase();
  if (
    normalized === "el_paso" ||
    normalized === "el paso" ||
    normalized === "elpaso" ||
    normalized === "us"
  ) return "el_paso";
  if (normalized === "juarez" || normalized === "juárez" || normalized === "mx") return "juarez";
  return "all";
}

export function regionCodeFromFilter(filter: AnalyticsRegionFilter): AnalyticsRegionCode | null {
  if (filter === "el_paso") return "US";
  if (filter === "juarez") return "MX";
  return null;
}

export function labelForRegionFilter(filter: AnalyticsRegionFilter): string {
  if (filter === "el_paso") return "El Paso";
  if (filter === "juarez") return "Juarez";
  return "All";
}

export function normalizeAnalyticsProperties(value: unknown): Record<string, unknown> {
  if (!isPlainObject(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  );
}

export function getAnalyticsRegionCode(properties: Record<string, unknown> | null | undefined): AnalyticsRegionCode | null {
  const raw =
    normalizeString(properties?.region_code) ??
    normalizeString(properties?.regionCode) ??
    normalizeString(properties?.region) ??
    normalizeString(properties?.region_filter);

  if (!raw) return null;
  const normalized = raw.toUpperCase();
  if (normalized === "US" || normalized === "MX") return normalized;
  if (normalized === "EL PASO" || normalized === "EL_PASO" || normalized === "ELPASO") return "US";
  if (normalized === "JUAREZ" || normalized === "JUÁREZ") return "MX";
  return null;
}

function buildDayBuckets(count: number, now: Date): Array<{ key: string; label: string }> {
  const buckets: Array<{ key: string; label: string }> = [];
  const anchor = new Date(now);
  for (let index = count - 1; index >= 0; index -= 1) {
    const day = new Date(anchor);
    day.setDate(anchor.getDate() - index);
    buckets.push({ key: getDayKey(day), label: getDayLabel(day) });
  }
  return buckets;
}

function toSeriesPoint(key: string, label: string): AnalyticsSeriesPoint {
  return {
    date: key,
    label,
    requests: 0,
    matches: 0,
    completed: 0,
    revenue: 0,
  };
}

export function buildAnalyticsDashboard(
  rows: AnalyticsRow[],
  regionFilter: AnalyticsRegionFilter = "all",
  now: Date = new Date(),
): AnalyticsDashboardResponse {
  const targetRegion = regionCodeFromFilter(regionFilter);
  const filteredRows = targetRegion
    ? rows.filter((row) => getAnalyticsRegionCode(row.properties) === targetRegion)
    : rows;

  const dayNow = new Date(now);
  const todayKey = getDayKey(dayNow);
  const dayBuckets7 = buildDayBuckets(7, dayNow);
  const dayBuckets30 = buildDayBuckets(30, dayNow);
  const byDay7 = new Map(dayBuckets7.map(({ key, label }) => [key, toSeriesPoint(key, label)]));
  const byDay30 = new Map(dayBuckets30.map(({ key, label }) => [key, toSeriesPoint(key, label)]));

  const todayRows = filteredRows.filter((row) => getDayKey(new Date(row.created_at)) === todayKey);

  const requestsToday = todayRows.filter((row) => row.event_name === "request_created").length;
  const matchesToday = todayRows.filter((row) => row.event_name === "mechanic_matched").length;
  const acceptedToday = todayRows.filter((row) => row.event_name === "mechanic_accepted_request").length;
  const completedJobsToday = todayRows.filter((row) => row.event_name === "job_completed").length;

  const revenue = todayRows.reduce((sum, row) => {
    if (row.event_name !== "job_completed") return sum;
    const props = row.properties ?? {};
    const value =
      normalizeNumber(props.revenue_amount) ??
      normalizeNumber(props.platform_fee_amount) ??
      normalizeNumber(props.platform_fee) ??
      0;
    return sum + value;
  }, 0);

  const etaValues = todayRows
    .filter((row) => row.event_name === "mechanic_accepted_request")
    .map((row) => normalizeNumber(row.properties?.eta_minutes))
    .filter((value): value is number => value !== null);

  const responseTimeValues: number[] = [];
  const requestTimes = new Map<string, number>();
  for (const row of todayRows) {
    const requestId = normalizeString(row.properties?.request_id ?? row.properties?.requestId ?? row.properties?.service_request_id);
    if (!requestId) continue;
    if (row.event_name === "request_created" && !requestTimes.has(requestId)) {
      requestTimes.set(requestId, new Date(row.created_at).getTime());
      continue;
    }
    if (row.event_name !== "mechanic_matched") continue;
    const start = requestTimes.get(requestId);
    if (!start) continue;
    const deltaMinutes = (new Date(row.created_at).getTime() - start) / (60 * 1000);
    if (Number.isFinite(deltaMinutes) && deltaMinutes >= 0) {
      responseTimeValues.push(deltaMinutes);
    }
  }

  const activeMechanics = new Set<string>();
  const activeCustomers = new Set<string>();
  for (const row of todayRows) {
    if (!row.user_id) continue;
    if (row.role === "mechanic" && ["mechanic_matched", "mechanic_accepted_request", "job_completed", "chat_opened"].includes(row.event_name)) {
      activeMechanics.add(row.user_id);
    }
    if (row.role === "customer" && ["request_created", "review_submitted", "chat_opened"].includes(row.event_name)) {
      activeCustomers.add(row.user_id);
    }
  }

  for (const row of filteredRows) {
    const dayKey = getDayKey(new Date(row.created_at));
    const seriesPoint7 = byDay7.get(dayKey);
    const seriesPoint30 = byDay30.get(dayKey);
    if (!seriesPoint7 && !seriesPoint30) continue;

    if (row.event_name === "request_created") {
      if (seriesPoint7) seriesPoint7.requests += 1;
      if (seriesPoint30) seriesPoint30.requests += 1;
    }
    if (row.event_name === "mechanic_matched") {
      if (seriesPoint7) seriesPoint7.matches += 1;
      if (seriesPoint30) seriesPoint30.matches += 1;
    }
    if (row.event_name === "mechanic_accepted_request") {
      // accepted counts are internally useful when rendering funnel views later
      // but are not required in the current dashboard surface.
    }
    if (row.event_name === "job_completed") {
      if (seriesPoint7) seriesPoint7.completed += 1;
      if (seriesPoint30) seriesPoint30.completed += 1;
      const props = row.properties ?? {};
      const revenue = normalizeNumber(props.revenue_amount) ?? normalizeNumber(props.platform_fee_amount) ?? normalizeNumber(props.platform_fee) ?? 0;
      if (seriesPoint7) seriesPoint7.revenue += revenue;
      if (seriesPoint30) seriesPoint30.revenue += revenue;
    }
  }

  const matchRate = requestsToday > 0 ? matchesToday / requestsToday : 0;
  const completionRate = acceptedToday > 0 ? completedJobsToday / acceptedToday : 0;
  const averageEtaMinutes = etaValues.length > 0
    ? etaValues.reduce((sum, value) => sum + value, 0) / etaValues.length
    : null;
  const averageResponseTimeMinutes = responseTimeValues.length > 0
    ? responseTimeValues.reduce((sum, value) => sum + value, 0) / responseTimeValues.length
    : null;

  return {
    region: regionFilter,
    summary: {
      requestsToday,
      matchesToday,
      completedJobsToday,
      matchRate,
      completionRate,
      averageEtaMinutes,
      averageResponseTimeMinutes,
      revenue,
      activeMechanics: activeMechanics.size,
      activeCustomers: activeCustomers.size,
    },
    series7: dayBuckets7.map(({ key, label }) => byDay7.get(key) ?? toSeriesPoint(key, label)),
    series30: dayBuckets30.map(({ key, label }) => byDay30.get(key) ?? toSeriesPoint(key, label)),
    updatedAt: now.toISOString(),
  };
}

export function formatAnalyticsPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatAnalyticsNumber(value: number, fractionDigits = 1): string {
  return value.toFixed(fractionDigits);
}
