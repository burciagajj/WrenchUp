import { requireAdmin } from "@/lib/admin-auth";
import { supabaseRest } from "@/lib/notification-service";

type QueueAction = "list" | "update_dispute" | "update_safety_report" | "update_safety_flag";
type DisputeStatus = "open" | "reviewing" | "resolved" | "rejected";
type SafetyReportStatus = "open" | "reviewing" | "resolved";
type SafetyFlagStatus = "open" | "reviewing" | "resolved" | "dismissed";

type ServiceRequestRow = {
  id: string;
  customer_user_id: string;
  customer_name: string | null;
  assigned_mechanic_user_id: string | null;
  assigned_mechanic_name: string | null;
  service_code: string | null;
  vehicle_label: string | null;
  location_label: string | null;
  status: string | null;
  payment_state: string | null;
  offered_price: number | null;
  currency: string | null;
  before_photo_url: string | null;
  after_photo_url: string | null;
  mechanic_accepted_at: string | null;
  customer_accepted_quote_at: string | null;
  mechanic_enroute_at: string | null;
  mechanic_arrived_at: string | null;
  job_started_at: string | null;
  job_completed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type QueueRow = {
  id: string;
  request_id: string | null;
  photo_urls?: string[] | null;
  [key: string]: unknown;
};

const EVIDENCE_BUCKET_ID = "service-evidence";
const DISPUTE_STATUSES: DisputeStatus[] = ["open", "reviewing", "resolved", "rejected"];
const REPORT_STATUSES: SafetyReportStatus[] = ["open", "reviewing", "resolved"];
const FLAG_STATUSES: SafetyFlagStatus[] = ["open", "reviewing", "resolved", "dismissed"];

function normalizeText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function createEvidenceSignedUrl(
  supabaseUrl: string,
  serviceKey: string,
  path: string | null,
): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const res = await fetch(
    `${supabaseUrl}/storage/v1/object/sign/${EVIDENCE_BUCKET_ID}/${encodeURI(path)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ expiresIn: 300 }),
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.signedURL) return null;
  const signedPath = String(data.signedURL);
  return signedPath.startsWith("http") ? signedPath : `${supabaseUrl}/storage/v1${signedPath}`;
}

async function listQueue(admin: { serviceKey: string; supabaseUrl: string }) {
  const [disputes, reports, flags] = await Promise.all([
    supabaseRest<QueueRow[]>(
      "/service_disputes?select=*&order=created_at.desc&limit=100",
      "GET",
      admin.serviceKey,
    ),
    supabaseRest<QueueRow[]>(
      "/safety_reports?select=*&order=created_at.desc&limit=100",
      "GET",
      admin.serviceKey,
    ),
    supabaseRest<QueueRow[]>(
      "/safety_flags?select=*&order=created_at.desc&limit=100",
      "GET",
      admin.serviceKey,
    ),
  ]);

  const requestIds = Array.from(
    new Set(
      [...(disputes ?? []), ...(reports ?? []), ...(flags ?? [])]
        .map((row) => row.request_id)
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    ),
  );
  const encodedIds = requestIds.map((id) => encodeURIComponent(id)).join(",");
  const requests = encodedIds
    ? await supabaseRest<ServiceRequestRow[]>(
        `/service_requests?id=in.(${encodedIds})&select=id,customer_user_id,customer_name,assigned_mechanic_user_id,assigned_mechanic_name,service_code,vehicle_label,location_label,status,payment_state,offered_price,currency,before_photo_url,after_photo_url,mechanic_accepted_at,customer_accepted_quote_at,mechanic_enroute_at,mechanic_arrived_at,job_started_at,job_completed_at,created_at,updated_at`,
        "GET",
        admin.serviceKey,
      )
    : [];

  const requestsWithEvidence = await Promise.all(
    (requests ?? []).map(async (row) => ({
      ...row,
      before_photo_signed_url: await createEvidenceSignedUrl(admin.supabaseUrl, admin.serviceKey, row.before_photo_url),
      after_photo_signed_url: await createEvidenceSignedUrl(admin.supabaseUrl, admin.serviceKey, row.after_photo_url),
    })),
  );

  return {
    disputes: disputes ?? [],
    safetyReports: reports ?? [],
    safetyFlags: flags ?? [],
    requests: requestsWithEvidence,
  };
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin.ok) return admin.response;

    const body = await request.json().catch(() => ({}));
    const action = body?.action as QueueAction | undefined;

    if (action === "list") {
      return Response.json({ data: await listQueue(admin) });
    }

    if (action === "update_dispute") {
      const id = normalizeText(body?.id);
      const status = body?.status as DisputeStatus;
      const adminNotes = normalizeText(body?.adminNotes);
      if (!id || !DISPUTE_STATUSES.includes(status)) {
        return Response.json({ error: "id and valid dispute status are required" }, { status: 400 });
      }
      const data = await supabaseRest<QueueRow[]>(
        `/service_disputes?id=eq.${encodeURIComponent(id)}`,
        "PATCH",
        admin.serviceKey,
        {
          status,
          admin_notes: adminNotes,
          reviewed_at: new Date().toISOString(),
          reviewed_by: admin.userId,
        },
      );
      const updated = Array.isArray(data) ? data[0] : null;
      if (updated?.request_id && (status === "open" || status === "reviewing")) {
        await supabaseRest(
          `/service_requests?id=eq.${encodeURIComponent(updated.request_id)}`,
          "PATCH",
          admin.serviceKey,
          { payment_state: "dispute_hold", funds_release_at: null, updated_at: new Date().toISOString() },
        );
      }
      return Response.json({ data });
    }

    if (action === "update_safety_report") {
      const id = normalizeText(body?.id);
      const status = body?.status as SafetyReportStatus;
      const adminNotes = normalizeText(body?.adminNotes);
      if (!id || !REPORT_STATUSES.includes(status)) {
        return Response.json({ error: "id and valid safety report status are required" }, { status: 400 });
      }
      const data = await supabaseRest(
        `/safety_reports?id=eq.${encodeURIComponent(id)}`,
        "PATCH",
        admin.serviceKey,
        {
          status,
          admin_notes: adminNotes,
          reviewed_at: new Date().toISOString(),
          reviewed_by: admin.userId,
        },
      );
      return Response.json({ data });
    }

    if (action === "update_safety_flag") {
      const id = normalizeText(body?.id);
      const status = body?.status as SafetyFlagStatus;
      const adminNotes = normalizeText(body?.adminNotes);
      if (!id || !FLAG_STATUSES.includes(status)) {
        return Response.json({ error: "id and valid safety flag status are required" }, { status: 400 });
      }
      const data = await supabaseRest(
        `/safety_flags?id=eq.${encodeURIComponent(id)}`,
        "PATCH",
        admin.serviceKey,
        {
          status,
          admin_notes: adminNotes,
          reviewed_at: new Date().toISOString(),
          reviewed_by: admin.userId,
        },
      );
      return Response.json({ data });
    }

    return Response.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("[admin/safety] Error:", error);
    return Response.json({ error: "Admin safety request failed" }, { status: 500 });
  }
}
