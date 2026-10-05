import { requireAdmin } from "@/lib/admin-auth";
import { supabaseRest } from "@/lib/notification-service";
import { SERVICE_CAPABILITY_REQUIREMENTS } from "@/lib/service-capabilities";

// Generic admin review for mechanic_service_capabilities rows — currently
// just the fuel-delivery gas container photo, but works for any capability
// added to lib/service-capabilities.ts with no changes needed here.

type CapabilityStatus = "pending_review" | "approved" | "rejected";

type CapabilityReviewRow = {
  id: string;
  mechanic_user_id: string;
  capability_code: string;
  document_url: string | null;
  status: CapabilityStatus;
  rejection_reason: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
};

const BUCKET_ID = "mechanic-documents";
const ALLOWED_STATUSES: CapabilityStatus[] = ["pending_review", "approved", "rejected"];
const ALLOWED_CAPABILITY_CODES = new Set(SERVICE_CAPABILITY_REQUIREMENTS.map((r) => r.capabilityCode));

function normalizeText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function createSignedUrl(supabaseUrl: string, serviceKey: string, path: string): Promise<string> {
  const res = await fetch(`${supabaseUrl}/storage/v1/object/sign/${BUCKET_ID}/${encodeURI(path)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ expiresIn: 300 }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.signedURL) {
    throw new Error(data?.message || data?.error || "Could not create signed URL");
  }
  const signedPath = String(data.signedURL);
  return signedPath.startsWith("http") ? signedPath : `${supabaseUrl}/storage/v1${signedPath}`;
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin.ok) return admin.response;

    const body = await request.json().catch(() => ({}));
    const action = body?.action;

    if (action === "list") {
      const rows = await supabaseRest<CapabilityReviewRow[]>(
        "/mechanic_service_capabilities?status=in.(pending_review,rejected,approved)&select=id,mechanic_user_id,capability_code,document_url,status,rejection_reason,submitted_at,reviewed_at,reviewed_by&order=submitted_at.desc",
        "GET",
        admin.serviceKey,
      );
      const list = Array.isArray(rows) ? rows : [];
      if (list.length === 0) return Response.json({ data: [] });

      const mechanicIds = Array.from(new Set(list.map((row) => row.mechanic_user_id)));
      const profileRows = await supabaseRest<{ user_id: string; email: string | null; full_name: string | null; display_name: string | null }[]>(
        `/user_profiles?user_id=in.(${mechanicIds.map((id) => encodeURIComponent(id)).join(",")})&select=user_id,email,full_name,display_name`,
        "GET",
        admin.serviceKey,
      );
      const profileByUserId = new Map(
        (Array.isArray(profileRows) ? profileRows : []).map((row) => [row.user_id, row]),
      );

      const data = list.map((row) => ({
        ...row,
        mechanic_email: profileByUserId.get(row.mechanic_user_id)?.email ?? null,
        mechanic_name:
          profileByUserId.get(row.mechanic_user_id)?.display_name ??
          profileByUserId.get(row.mechanic_user_id)?.full_name ??
          null,
      }));
      return Response.json({ data });
    }

    if (action === "signed_url") {
      const path = normalizeText(body?.path);
      if (!path) return Response.json({ error: "path is required" }, { status: 400 });

      const rows = await supabaseRest<CapabilityReviewRow[]>(
        `/mechanic_service_capabilities?document_url=eq.${encodeURIComponent(path)}&select=document_url&limit=1`,
        "GET",
        admin.serviceKey,
      );
      const authorized = Array.isArray(rows) && rows.length > 0;
      if (!authorized) return Response.json({ error: "Document path not found" }, { status: 404 });

      const signedUrl = await createSignedUrl(admin.supabaseUrl, admin.serviceKey, path);
      return Response.json({ data: { signedUrl, expiresIn: 300 } });
    }

    if (action === "update") {
      const id = normalizeText(body?.id);
      const status = body?.status as CapabilityStatus;
      const rejectionReason = normalizeText(body?.rejectionReason);

      if (!id || !ALLOWED_STATUSES.includes(status)) {
        return Response.json({ error: "id and valid status are required" }, { status: 400 });
      }
      if (status === "rejected" && !rejectionReason) {
        return Response.json({ error: "Rejection reason is required" }, { status: 400 });
      }

      const existingRows = await supabaseRest<CapabilityReviewRow[]>(
        `/mechanic_service_capabilities?id=eq.${encodeURIComponent(id)}&select=id,capability_code,document_url&limit=1`,
        "GET",
        admin.serviceKey,
      );
      const existing = Array.isArray(existingRows) ? existingRows[0] : null;
      if (!existing) return Response.json({ error: "Capability submission not found" }, { status: 404 });
      if (!ALLOWED_CAPABILITY_CODES.has(existing.capability_code)) {
        return Response.json({ error: "Unknown capability_code" }, { status: 400 });
      }
      if (status === "approved" && !existing.document_url) {
        return Response.json({ error: "A photo is required before approval" }, { status: 400 });
      }

      const data = await supabaseRest(
        `/mechanic_service_capabilities?id=eq.${encodeURIComponent(id)}`,
        "PATCH",
        admin.serviceKey,
        {
          status,
          reviewed_at: new Date().toISOString(),
          reviewed_by: admin.userId,
          rejection_reason: status === "rejected" ? rejectionReason : null,
          updated_at: new Date().toISOString(),
        },
      );
      return Response.json({ data });
    }

    return Response.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("[admin/service-capabilities] Error:", error);
    return Response.json({ error: "Admin capability review request failed" }, { status: 500 });
  }
}
