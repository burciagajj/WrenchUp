// Mirrors app/api/admin/mechanic-verifications+api.ts, but for vehicle
// insurance/registration document review (approval_status on user_vehicles
// previously never changed because no admin surface existed to change it).
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseRest } from "@/lib/notification-service";

type ApprovalStatus = "pending" | "approved" | "rejected";

type VehicleRow = {
  id: string;
  user_id: string;
  nickname: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  plate: string | null;
  insurance_doc_url: string | null;
  registration_sticker_url: string | null;
  approval_status: ApprovalStatus | null;
  rejection_reason: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  updated_at: string | null;
};

type OwnerProfile = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  display_name: string | null;
};

const BUCKET_ID = "vehicle-documents";
const ALLOWED_STATUSES: ApprovalStatus[] = ["pending", "approved", "rejected"];

function normalizeText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function createSignedUrl(supabaseUrl: string, serviceKey: string, path: string): Promise<string> {
  const res = await fetch(
    `${supabaseUrl}/storage/v1/object/sign/${BUCKET_ID}/${encodeURI(path)}`,
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
      const vehicles = await supabaseRest<VehicleRow[]>(
        "/user_vehicles?approval_status=in.(pending,rejected,approved)&select=id,user_id,nickname,year,make,model,plate,insurance_doc_url,registration_sticker_url,approval_status,rejection_reason,reviewed_at,reviewed_by,updated_at&order=updated_at.desc",
        "GET",
        admin.serviceKey,
      );
      const rows = Array.isArray(vehicles) ? vehicles : [];
      const ownerIds = Array.from(new Set(rows.map((row) => row.user_id).filter(Boolean)));
      let owners: OwnerProfile[] = [];
      if (ownerIds.length > 0) {
        const idList = ownerIds.map((id) => encodeURIComponent(id)).join(",");
        const ownerRows = await supabaseRest<OwnerProfile[]>(
          `/user_profiles?user_id=in.(${idList})&select=user_id,email,full_name,display_name`,
          "GET",
          admin.serviceKey,
        ).catch(() => null);
        owners = Array.isArray(ownerRows) ? ownerRows : [];
      }
      const ownerById = new Map(owners.map((o) => [o.user_id, o]));
      const data = rows.map((row) => ({
        ...row,
        owner_email: ownerById.get(row.user_id)?.email ?? null,
        owner_name: ownerById.get(row.user_id)?.display_name || ownerById.get(row.user_id)?.full_name || null,
      }));
      return Response.json({ data });
    }

    if (action === "signed_url") {
      const path = normalizeText(body?.path);
      if (!path) return Response.json({ error: "path is required" }, { status: 400 });

      const rows = await supabaseRest<VehicleRow[]>(
        `/user_vehicles?select=id,insurance_doc_url,registration_sticker_url`,
        "GET",
        admin.serviceKey,
      );
      const authorized =
        Array.isArray(rows) &&
        rows.some((row) => row.insurance_doc_url === path || row.registration_sticker_url === path);
      if (!authorized) return Response.json({ error: "Document path not found" }, { status: 404 });

      const signedUrl = await createSignedUrl(admin.supabaseUrl, admin.serviceKey, path);
      return Response.json({ data: { signedUrl, expiresIn: 300 } });
    }

    if (action === "update") {
      const vehicleId = normalizeText(body?.vehicleId);
      const status = body?.status as ApprovalStatus;
      const rejectionReason = normalizeText(body?.rejectionReason);

      if (!vehicleId || !ALLOWED_STATUSES.includes(status)) {
        return Response.json({ error: "vehicleId and valid status are required" }, { status: 400 });
      }
      if (status === "rejected" && !rejectionReason) {
        return Response.json({ error: "Rejection reason is required" }, { status: 400 });
      }

      const existingRows = await supabaseRest<VehicleRow[]>(
        `/user_vehicles?id=eq.${encodeURIComponent(vehicleId)}&select=id,insurance_doc_url,registration_sticker_url&limit=1`,
        "GET",
        admin.serviceKey,
      );
      const existing = Array.isArray(existingRows) ? existingRows[0] : null;
      if (!existing) return Response.json({ error: "Vehicle not found" }, { status: 404 });

      if (status === "approved" && (!existing.insurance_doc_url || !existing.registration_sticker_url)) {
        return Response.json({ error: "Insurance and registration documents are required before approval" }, { status: 400 });
      }

      const data = await supabaseRest(
        `/user_vehicles?id=eq.${encodeURIComponent(vehicleId)}`,
        "PATCH",
        admin.serviceKey,
        {
          approval_status: status,
          reviewed_at: new Date().toISOString(),
          reviewed_by: admin.userId,
          rejection_reason: status === "rejected" ? rejectionReason : null,
        },
      );
      return Response.json({ data });
    }

    return Response.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("[admin/vehicle-verifications] Error:", error);
    return Response.json({ error: "Admin vehicle verification request failed" }, { status: 500 });
  }
}
