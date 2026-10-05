import { requireAdmin } from "@/lib/admin-auth";
import { supabaseRest } from "@/lib/notification-service";

type VerificationStatus = "pending_review" | "approved" | "rejected";

type MechanicReviewRow = {
  user_id: string;
  id_document_url: string | null;
  insurance_document_url: string | null;
  certification_document_url: string | null;
  business_license_document_url: string | null;
};

const BUCKET_ID = "mechanic-documents";
const ALLOWED_STATUSES: VerificationStatus[] = ["pending_review", "approved", "rejected"];

function normalizeText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeDate(value: unknown): string | null {
  const text = normalizeText(value);
  if (!text) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function isExpired(dateValue: string | null): boolean {
  if (!dateValue) return false;
  const expiresAt = new Date(`${dateValue}T23:59:59.999Z`).getTime();
  return Number.isFinite(expiresAt) && expiresAt < Date.now();
}

function rowDocumentPaths(row: MechanicReviewRow): string[] {
  return [
    row.id_document_url,
    row.insurance_document_url,
    row.certification_document_url,
    row.business_license_document_url,
  ].filter((value): value is string => typeof value === "string" && value.length > 0);
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
      const data = await supabaseRest(
        "/user_profiles?role=eq.mechanic&verification_status=in.(pending_review,rejected,approved)&select=id,user_id,email,full_name,display_name,phone_number,phone_verified_at,verification_status,id_document_url,insurance_document_url,certification_document_url,business_license_document_url,license_expires_at,insurance_expires_at,reviewed_at,reviewed_by,rejection_reason,mechanic_attested_no_criminal_record,mechanic_attested_at,updated_at&order=updated_at.desc",
        "GET",
        admin.serviceKey,
      );
      return Response.json({ data });
    }

    if (action === "signed_url") {
      const path = normalizeText(body?.path);
      if (!path) return Response.json({ error: "path is required" }, { status: 400 });

      const rows = await supabaseRest<MechanicReviewRow[]>(
        `/user_profiles?role=eq.mechanic&select=user_id,id_document_url,insurance_document_url,certification_document_url,business_license_document_url`,
        "GET",
        admin.serviceKey,
      );
      const authorized = Array.isArray(rows) && rows.some((row) => rowDocumentPaths(row).includes(path));
      if (!authorized) return Response.json({ error: "Document path not found" }, { status: 404 });

      const signedUrl = await createSignedUrl(admin.supabaseUrl, admin.serviceKey, path);
      return Response.json({ data: { signedUrl, expiresIn: 300 } });
    }

    if (action === "update") {
      const userId = normalizeText(body?.userId);
      const status = body?.status as VerificationStatus;
      const rejectionReason = normalizeText(body?.rejectionReason);
      const licenseExpiresAt = normalizeDate(body?.licenseExpiresAt);
      const insuranceExpiresAt = normalizeDate(body?.insuranceExpiresAt);

      if (!userId || !ALLOWED_STATUSES.includes(status)) {
        return Response.json({ error: "userId and valid status are required" }, { status: 400 });
      }
      if (status === "rejected" && !rejectionReason) {
        return Response.json({ error: "Rejection reason is required" }, { status: 400 });
      }

      const existingRows = await supabaseRest<
        (MechanicReviewRow & { license_expires_at: string | null; insurance_expires_at: string | null })[]
      >(
        `/user_profiles?user_id=eq.${encodeURIComponent(userId)}&role=eq.mechanic&select=user_id,id_document_url,insurance_document_url,certification_document_url,business_license_document_url,license_expires_at,insurance_expires_at&limit=1`,
        "GET",
        admin.serviceKey,
      );
      const existing = Array.isArray(existingRows) ? existingRows[0] : null;
      if (!existing) return Response.json({ error: "Mechanic profile not found" }, { status: 404 });

      const nextLicenseExpiration = licenseExpiresAt ?? existing.license_expires_at ?? null;
      const nextInsuranceExpiration = insuranceExpiresAt ?? existing.insurance_expires_at ?? null;
      if (status === "approved") {
        if (!existing.id_document_url || !existing.insurance_document_url) {
          return Response.json({ error: "Driver license and insurance are required before approval" }, { status: 400 });
        }
        if (isExpired(nextLicenseExpiration) || isExpired(nextInsuranceExpiration)) {
          return Response.json({ error: "Expired license or insurance cannot be approved" }, { status: 400 });
        }
      }

      const data = await supabaseRest(
        `/user_profiles?user_id=eq.${encodeURIComponent(userId)}`,
        "PATCH",
        admin.serviceKey,
        {
          verification_status: status,
          reviewed_at: new Date().toISOString(),
          reviewed_by: admin.userId,
          rejection_reason: status === "rejected" ? rejectionReason : null,
          license_expires_at: nextLicenseExpiration,
          insurance_expires_at: nextInsuranceExpiration,
        },
      );
      return Response.json({ data });
    }

    return Response.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("[admin/mechanic-verifications] Error:", error);
    return Response.json({ error: "Admin verification request failed" }, { status: 500 });
  }
}
