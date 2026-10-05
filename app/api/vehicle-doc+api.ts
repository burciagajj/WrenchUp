// Mirrors app/api/mechanic-doc+api.ts, but for vehicle insurance/registration
// documents. Previously vehicle-form.tsx stored the *local device file URI*
// returned by the image picker directly as insurance_doc_url/
// registration_sticker_url — never actually uploaded anywhere, so an admin
// (on a different device) had no way to ever view what a customer/mechanic
// submitted. This route uploads to Supabase Storage and returns a real,
// admin-fetchable storage path, matching how mechanic profile docs work.
import { base64ToBytes } from "@/lib/_core/base64";

const BUCKET_ID = "vehicle-documents";

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
    const { userId, sessionToken, base64, mimeType, docType } = body ?? {};

    if (!userId || !sessionToken || !base64 || !docType) {
      return Response.json(
        { error: "userId, sessionToken, base64, and docType are required" },
        { status: 400 }
      );
    }
    if (docType !== "insurance" && docType !== "registration") {
      return Response.json({ error: "Invalid docType" }, { status: 400 });
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
    const path = `${userId}/${docType}_${Date.now()}.${extension}`;
    const bytes = base64ToBytes(base64);

    const uploadRes = await fetch(
      `${supabaseUrl}/storage/v1/object/${BUCKET_ID}/${path}`,
      {
        method: "POST",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": mimeType || "image/jpeg",
          "x-upsert": "true",
        },
        body: bytes,
      }
    );

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

    return Response.json({ path });
  } catch (error) {
    console.error("[api/vehicle-doc] Error:", error);
    return Response.json({ error: "Upload failed" }, { status: 500 });
  }
}
