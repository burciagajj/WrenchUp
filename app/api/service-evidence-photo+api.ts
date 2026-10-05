import { base64ToBytes } from "@/lib/_core/base64";

const BUCKET_ID = "service-evidence";

function getConfig() {
  return {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL || "",
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  };
}

async function getCurrentUser(supabaseUrl: string, serviceKey: string, sessionToken: string): Promise<string | null> {
  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${sessionToken}` },
  });
  if (!res.ok) return null;
  const user = await res.json().catch(() => null);
  return user?.id ? String(user.id) : null;
}

async function assertParticipant(
  supabaseUrl: string,
  serviceKey: string,
  requestId: string,
  userId: string,
): Promise<boolean> {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/service_requests?id=eq.${encodeURIComponent(requestId)}&select=customer_user_id,assigned_mechanic_user_id`,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    },
  );
  if (!res.ok) return false;
  const rows = await res.json().catch(() => []);
  const row = Array.isArray(rows) ? rows[0] : null;
  return row?.customer_user_id === userId || row?.assigned_mechanic_user_id === userId;
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
    const { requestId, sessionToken, base64, mimeType, kind } = body ?? {};

    if (!requestId || !sessionToken || !base64 || (kind !== "before" && kind !== "after")) {
      return Response.json(
        { error: "requestId, sessionToken, base64, and valid kind are required" },
        { status: 400 },
      );
    }

    const { supabaseUrl, serviceKey } = getConfig();
    if (!serviceKey) {
      return Response.json(
        { code: "storage_not_configured", error: "SUPABASE_SERVICE_ROLE_KEY not set" },
        { status: 503 },
      );
    }

    const userId = await getCurrentUser(supabaseUrl, serviceKey, sessionToken);
    if (!userId) return Response.json({ error: "Invalid session" }, { status: 401 });
    const participant = await assertParticipant(supabaseUrl, serviceKey, requestId, userId);
    if (!participant) return Response.json({ error: "Forbidden" }, { status: 403 });

    await ensureBucket(supabaseUrl, serviceKey);

    const extension = mimeType === "image/png" ? "png" : "jpg";
    const path = `${requestId}/${kind}_${Date.now()}.${extension}`;
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
      return Response.json({ error: text || "Upload failed" }, { status: 500 });
    }

    return Response.json({ path });
  } catch (error) {
    console.error("[api/service-evidence-photo] Error:", error);
    return Response.json({ error: "Upload failed" }, { status: 500 });
  }
}
