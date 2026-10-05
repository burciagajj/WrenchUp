import { getCurrentUserAuth, getNotificationServiceConfig, supabaseRest } from "@/lib/notification-service";

type SafetyRole = "customer" | "mechanic";
type SafetyAction = "create_dispute" | "create_safety_report";

function getSessionToken(request: Request): string | null {
  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return token.length > 0 ? token : null;
}

function normalizeRole(value: unknown): SafetyRole | null {
  return value === "customer" || value === "mechanic" ? value : null;
}

function normalizeText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

async function getRequestForParticipant(
  requestId: string,
  serviceKey: string,
): Promise<{ id: string; customer_user_id: string; assigned_mechanic_user_id: string | null } | null> {
  const rows = await supabaseRest<{ id: string; customer_user_id: string; assigned_mechanic_user_id: string | null }[]>(
    `/service_requests?id=eq.${encodeURIComponent(requestId)}&select=id,customer_user_id,assigned_mechanic_user_id`,
    "GET",
    serviceKey,
  );
  return Array.isArray(rows) ? rows[0] ?? null : null;
}

function isParticipant(
  userId: string,
  request: { customer_user_id: string; assigned_mechanic_user_id: string | null },
): boolean {
  return userId === request.customer_user_id || userId === request.assigned_mechanic_user_id;
}

export async function POST(request: Request) {
  try {
    const { supabaseUrl, serviceKey } = getNotificationServiceConfig();
    if (!serviceKey) {
      return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY not set" }, { status: 503 });
    }

    const sessionToken = getSessionToken(request);
    if (!sessionToken) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const currentUser = await getCurrentUserAuth(supabaseUrl, serviceKey, sessionToken);
    if (!currentUser?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const action = body?.action as SafetyAction | undefined;
    const role = normalizeRole(body?.role);
    const requestId = normalizeText(body?.requestId);
    const message = normalizeText(body?.message);
    const photoUrls = Array.isArray(body?.photoUrls)
      ? body.photoUrls.filter((item: unknown) => typeof item === "string")
      : [];

    if (!action || !role) {
      return Response.json({ error: "action and role are required" }, { status: 400 });
    }

    if (action === "create_dispute") {
      const reason = normalizeText(body?.reason, "service_dispute");
      if (!requestId || !reason) {
        return Response.json({ error: "requestId and reason are required" }, { status: 400 });
      }
      const serviceRequest = await getRequestForParticipant(requestId, serviceKey);
      if (!serviceRequest || !isParticipant(currentUser.id, serviceRequest)) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }

      const dispute = await supabaseRest(
        "/service_disputes",
        "POST",
        serviceKey,
        {
          request_id: requestId,
          user_id: currentUser.id,
          role,
          reason,
          message: message || null,
          photo_urls: photoUrls,
          status: "open",
        },
      );
      await supabaseRest(
        `/service_requests?id=eq.${encodeURIComponent(requestId)}`,
        "PATCH",
        serviceKey,
        {
          payment_state: "dispute_hold",
          dispute_opened_at: new Date().toISOString(),
          funds_release_at: null,
          updated_at: new Date().toISOString(),
        },
      );
      return Response.json({ data: dispute });
    }

    if (action === "create_safety_report") {
      const reportType = normalizeText(body?.reportType, "safety_issue");
      if (
        reportType !== "emergency" &&
        reportType !== "safety_issue" &&
        reportType !== "unsafe_situation" &&
        reportType !== "customer_no_show" &&
        reportType !== "safety_cancellation"
      ) {
        return Response.json({ error: "Invalid reportType" }, { status: 400 });
      }

      if (requestId) {
        const serviceRequest = await getRequestForParticipant(requestId, serviceKey);
        if (!serviceRequest || !isParticipant(currentUser.id, serviceRequest)) {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }
      }

      const report = await supabaseRest(
        "/safety_reports",
        "POST",
        serviceKey,
        {
          request_id: requestId || null,
          user_id: currentUser.id,
          role,
          report_type: reportType,
          message: message || null,
          photo_urls: photoUrls,
          status: "open",
          admin_flag: true,
        },
      );
      if (requestId) {
        await supabaseRest(
          `/service_requests?id=eq.${encodeURIComponent(requestId)}`,
          "PATCH",
          serviceKey,
          {
            safety_flag_count: 1,
            updated_at: new Date().toISOString(),
          },
        ).catch(() => null);
      }
      await supabaseRest(
        "/safety_flags",
        "POST",
        serviceKey,
        {
          user_id: currentUser.id,
          request_id: requestId || null,
          flag_type: "safety_report",
          severity: reportType === "emergency" ? "critical" : "high",
          status: "open",
          details: {
            role,
            report_type: reportType,
            message,
          },
        },
      ).catch(() => null);
      return Response.json({ data: report });
    }

    return Response.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("[api/safety] Error:", error);
    return Response.json({ error: "Safety request failed" }, { status: 500 });
  }
}
