import { requireAdmin } from "@/lib/admin-auth";
import { supabaseRest } from "@/lib/notification-service";

type PhotoStatus = "pending_review" | "approved" | "rejected";

const ALLOWED_STATUSES: PhotoStatus[] = ["pending_review", "approved", "rejected"];

function normalizeText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

// The photo lives in the public `profile-photos` bucket (see migration 034 —
// it reuses the existing unmoderated avatar_url column/bucket rather than a
// separate private one), so admins can load avatar_url directly with no
// signed-URL step, unlike the private mechanic-documents review flow.
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin.ok) return admin.response;

    const body = await request.json().catch(() => ({}));
    const action = body?.action;

    if (action === "list") {
      const data = await supabaseRest(
        "/user_profiles?avatar_url=not.is.null&select=id,user_id,email,full_name,display_name,role,phone_number,avatar_url,avatar_status,avatar_submitted_at,avatar_reviewed_at,avatar_reviewed_by,avatar_rejection_reason,updated_at&order=avatar_submitted_at.desc.nullslast",
        "GET",
        admin.serviceKey,
      );
      return Response.json({ data });
    }

    if (action === "update") {
      const userId = normalizeText(body?.userId);
      const status = body?.status as PhotoStatus;
      const rejectionReason = normalizeText(body?.rejectionReason);

      if (!userId || !ALLOWED_STATUSES.includes(status)) {
        return Response.json({ error: "userId and valid status are required" }, { status: 400 });
      }
      if (status === "rejected" && !rejectionReason) {
        return Response.json({ error: "Rejection reason is required" }, { status: 400 });
      }

      const existingRows = await supabaseRest<{ user_id: string; avatar_url: string | null }[]>(
        `/user_profiles?user_id=eq.${encodeURIComponent(userId)}&select=user_id,avatar_url&limit=1`,
        "GET",
        admin.serviceKey,
      );
      const existing = Array.isArray(existingRows) ? existingRows[0] : null;
      if (!existing) return Response.json({ error: "Profile not found" }, { status: 404 });
      if (status === "approved" && !existing.avatar_url) {
        return Response.json({ error: "No photo on file to approve" }, { status: 400 });
      }

      const data = await supabaseRest(
        `/user_profiles?user_id=eq.${encodeURIComponent(userId)}`,
        "PATCH",
        admin.serviceKey,
        {
          avatar_status: status,
          avatar_reviewed_at: new Date().toISOString(),
          avatar_reviewed_by: admin.userId,
          avatar_rejection_reason: status === "rejected" ? rejectionReason : null,
        },
      );
      return Response.json({ data });
    }

    return Response.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("[admin/photo-verifications] Error:", error);
    return Response.json({ error: "Admin photo review request failed" }, { status: 500 });
  }
}
