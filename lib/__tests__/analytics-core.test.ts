import { describe, expect, it } from "vitest";
import {
  buildAnalyticsDashboard,
  normalizeAnalyticsRegionFilter,
  type AnalyticsRow,
} from "../analytics-core";

function makeRow(overrides: Partial<AnalyticsRow> & Pick<AnalyticsRow, "id" | "created_at" | "event_name">): AnalyticsRow {
  return {
    id: overrides.id,
    created_at: overrides.created_at,
    user_id: overrides.user_id ?? null,
    role: overrides.role ?? null,
    event_name: overrides.event_name,
    properties: overrides.properties ?? {},
  };
}

describe("analytics core", () => {
  it("normalizes region filters", () => {
    expect(normalizeAnalyticsRegionFilter("El Paso")).toBe("el_paso");
    expect(normalizeAnalyticsRegionFilter("juarez")).toBe("juarez");
    expect(normalizeAnalyticsRegionFilter("All")).toBe("all");
  });

  it("builds dashboard metrics and series from event rows", () => {
    const rows: AnalyticsRow[] = [
      makeRow({
        id: "req-1",
        created_at: "2026-06-09T15:00:00.000Z",
        user_id: "customer-1",
        role: "customer",
        event_name: "request_created",
        properties: { request_id: "req-1", region_code: "US", platform_fee_amount: 12.5 },
      }),
      makeRow({
        id: "match-1",
        created_at: "2026-06-09T15:04:00.000Z",
        user_id: "mechanic-1",
        role: "mechanic",
        event_name: "mechanic_matched",
        properties: { request_id: "req-1", region_code: "US", mechanic_user_id: "mechanic-1" },
      }),
      makeRow({
        id: "accept-1",
        created_at: "2026-06-09T15:05:00.000Z",
        user_id: "mechanic-1",
        role: "mechanic",
        event_name: "mechanic_accepted_request",
        properties: { request_id: "req-1", region_code: "US", eta_minutes: 14 },
      }),
      makeRow({
        id: "complete-1",
        created_at: "2026-06-09T16:00:00.000Z",
        user_id: "mechanic-1",
        role: "mechanic",
        event_name: "job_completed",
        properties: { request_id: "req-1", region_code: "US", revenue_amount: 12.5 },
      }),
      makeRow({
        id: "review-1",
        created_at: "2026-06-09T16:05:00.000Z",
        user_id: "customer-1",
        role: "customer",
        event_name: "review_submitted",
        properties: { request_id: "req-1", region_code: "US", rating: 5 },
      }),
      makeRow({
        id: "req-2",
        created_at: "2026-06-08T15:00:00.000Z",
        user_id: "customer-2",
        role: "customer",
        event_name: "request_created",
        properties: { request_id: "req-2", region_code: "MX", platform_fee_amount: 8 },
      }),
      makeRow({
        id: "match-2",
        created_at: "2026-06-08T15:08:00.000Z",
        user_id: "mechanic-2",
        role: "mechanic",
        event_name: "mechanic_matched",
        properties: { request_id: "req-2", region_code: "MX", mechanic_user_id: "mechanic-2" },
      }),
    ];

    const dashboard = buildAnalyticsDashboard(rows, "all", new Date("2026-06-09T18:00:00.000Z"));

    expect(dashboard.summary.requestsToday).toBe(1);
    expect(dashboard.summary.matchesToday).toBe(1);
    expect(dashboard.summary.completedJobsToday).toBe(1);
    expect(dashboard.summary.matchRate).toBeCloseTo(1);
    expect(dashboard.summary.completionRate).toBeCloseTo(1);
    expect(dashboard.summary.averageEtaMinutes).toBeCloseTo(14);
    expect(dashboard.summary.averageResponseTimeMinutes).toBeCloseTo(4);
    expect(dashboard.summary.revenue).toBeCloseTo(12.5);
    expect(dashboard.summary.activeMechanics).toBe(1);
    expect(dashboard.summary.activeCustomers).toBe(1);
    expect(dashboard.series30).toHaveLength(30);
    expect(dashboard.series7).toHaveLength(7);
  });

  it("filters by region", () => {
    const rows: AnalyticsRow[] = [
      makeRow({
        id: "us-1",
        created_at: "2026-06-09T15:00:00.000Z",
        user_id: "customer-1",
        role: "customer",
        event_name: "request_created",
        properties: { request_id: "us-1", region_code: "US", platform_fee_amount: 12.5 },
      }),
      makeRow({
        id: "mx-1",
        created_at: "2026-06-09T15:00:00.000Z",
        user_id: "customer-2",
        role: "customer",
        event_name: "request_created",
        properties: { request_id: "mx-1", region_code: "MX", platform_fee_amount: 8 },
      }),
    ];

    const dashboard = buildAnalyticsDashboard(rows, "juarez", new Date("2026-06-09T18:00:00.000Z"));
    expect(dashboard.summary.requestsToday).toBe(1);
    expect(dashboard.summary.revenue).toBeCloseTo(0);
  });
});
