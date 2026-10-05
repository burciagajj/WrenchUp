import { base64ToBytes } from "@/lib/_core/base64";
import { SERVICE_CAPABILITY_REQUIREMENTS } from "@/lib/service-capabilities";

// Uploads the proof photo for a service-capability unlock (e.g. the gas
// container photo required to unlock fuel_delivery jobs) and upserts the
// mechanic_service_capabilities row, resetting it to pending_review so an
// admin has to look at every new/re-submitted photo — a mechanic can never
// unlock a service just by uploading, only by getting approved.

const BUCKET_ID = "mechanic-documents";
const ALLOWED_CAPABILITY_CODES = new Set(SERVICE_CAPABILITY_REQUIREMENTS.map((r) => r.capabilityCode));

function getConfig() {
  return {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL || "",
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "",
  };
}

async function verifySession(
  supabaseUrl: string,
  anonKey: string,
  sessionToken: string,
  userId: string
): Promise<boolean> {
  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${sessionToken}` },
  });
  if (!res.ok) return false;
  const user = await res.json();
  return user?.id === userId;
}

async function ensureBucket(supabaseUrl: string, serviceKey: string) {
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };
  const check = await fetch(`${supabaseUrl}/storage/v1/bucket/${BUCKET_ID}`, { headers });
  if (check.ok) return;
  const create = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
    method: "POST",
    headers,
    body: JSON.stringify({ id: BUCKET_ID, name: BUCKET_ID, public: false }),
  });
  if (!create.ok) {
    const text = await create.text();
    throw new Error(text || `Could not create storage bucket ${BUCKET_ID}`);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId, sessionToken, base64, mimeType, capabilityCode } = body ?? {};

    if (!userId || !sessionToken || !base64 || !capabilityCode) {
      return Response.json(
        { error: "userId, sessionToken, base64, and capabilityCode are required" },
        { status: 400 }
      );
    }
    if (!ALLOWED_CAPABILITY_CODES.has(capabilityCode)) {
      return Response.json({ error: "Invalid capabilityCode" }, { status: 400 });
    }

    const { supabaseUrl, serviceKey, anonKey } = getConfig();
    if (!serviceKey) {
      return Response.json(
        { code: "storage_not_configured", error: "SUPABASE_SERVICE_ROLE_KEY not set" },
        { status: 503 }
      );
    }

    const valid = await verifySession(supabaseUrl, anonKey, sessionToken, userId);
    if (!valid) return Response.json({ error: "Invalid session" }, { status: 401 });

    await ensureBucket(supabaseUrl, serviceKey);

    const extension = mimeType === "application/pdf" ? "pdf" : "jpg";
    const path = `${userId}/capability_${capabilityCode}_${Date.now()}.${extension}`;
    const bytes = base64ToBytes(base64);

    const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/${BUCKET_ID}/${path}`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": mimeType || "image/jpeg",
        "x-upsert": "true",
      },
      body: bytes,
    });

    if (!uploadRes.ok) {
      const text = await uploadRes.text();
      let message = text || "Upload failed";
      try {
        const parsed = text ? JSON.parse(text) : null;
        message = parsed?.message || parsed?.error || message;
      } catch {
        // keep raw text
      }
      return Response.json({ error: message }, { status: 500 });
    }

    const upsertRes = await fetch(
      `${supabaseUrl}/rest/v1/mechanic_service_capabilities?on_conflict=mechanic_user_id,capability_code`,
      {
        method: "POST",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=representation",
        },
        body: JSON.stringify({
          mechanic_user_id: userId,
          capability_code: capabilityCode,
          document_url: path,
          status: "pending_review",
          rejection_reason: null,
          submitted_at: new Date().toISOString(),
          reviewed_at: null,
          reviewed_by: null,
          updated_at: new Date().toISOString(),
        }),
      }
    );

    if (!upsertRes.ok) {
      const text = await upsertRes.text();
      console.error("[api/mechanic-capability-doc] Upsert failed:", upsertRes.status, text);
      return Response.json({ error: "Could not save capability submission" }, { status: 500 });
    }

    return Response.json({ path });
  } catch (error) {
    console.error("[api/mechanic-capability-doc] Error:", error);
    return Response.json({ error: "Upload failed" }, { status: 500 });
  }
}
