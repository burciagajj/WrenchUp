const BUCKET_ID = "mechanic-documents";

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
  await fetch(`${supabaseUrl}/storage/v1/bucket`, {
    method: "POST",
    headers,
    body: JSON.stringify({ id: BUCKET_ID, name: BUCKET_ID, public: false }),
  });
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
    if (docType !== "license" && docType !== "certification") {
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
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

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
      const err = await uploadRes.json().catch(() => ({}));
      return Response.json({ error: err.message || "Upload failed" }, { status: 500 });
    }

    return Response.json({ path });
  } catch (error) {
    console.error("[api/mechanic-doc] Error:", error);
    return Response.json({ error: "Upload failed" }, { status: 500 });
  }
}
