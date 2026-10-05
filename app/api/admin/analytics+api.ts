import {
  normalizeAnalyticsRegionFilter,
} from "@/lib/analytics-core";
import { requireAdmin } from "@/lib/admin-auth";
import { buildAnalyticsReport } from "@/lib/analytics-service";

export async function GET(request: Request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin.ok) return admin.response;

    const url = new URL(request.url);
    const region = normalizeAnalyticsRegionFilter(url.searchParams.get("region"));

    const dashboard = await buildAnalyticsReport(region);
    return Response.json({ data: dashboard });
  } catch (error) {
    console.error("[admin/analytics] Error:", error);
    return Response.json({ error: "Analytics dashboard request failed" }, { status: 500 });
  }
}
