/**
 * Expo API route — same logic as server/_core/profilePhoto.ts for web/Metro.
 * Set SUPABASE_SERVICE_ROLE_KEY in .env for Storage uploads; otherwise the app uses data-URL fallback.
 */

import { base64ToBytes } from "@/lib/_core/base64";

const BUCKET_ID = "profile-photos";

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
  // Private, matching every other document/photo bucket in this app
  // (mechanic-documents, vehicle-documents, service-evidence) — this bucket
  // holds the mandatory admin-reviewed face-verification photo, which
  // shouldn't be fetchable by anyone who obtains the URL with no auth at
  // all. Access is via a signed URL (see createSignedUrl below) instead.
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

// 1 year — long enough that avatar_url behaves like a normal stable URL for
// every existing display call site (tab bar, approval-pending screen, admin
// review), but it's a real signed token that only this server (holding
// SUPABASE_SERVICE_ROLE_KEY) can mint, not a permanently-guessable public
// path. Re-signed automatically on every re-upload; see
// scripts/resign-profile-photos.mjs for one-time migration of older rows.
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 365;

async function createSignedUrl(supabaseUrl: string, serviceKey: string, path: string): Promise<string> {
  const res = await fetch(`${supabaseUrl}/storage/v1/object/sign/${BUCKET_ID}/${encodeURI(path)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ expiresIn: SIGNED_URL_TTL_SECONDS }),
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
    const body = await request.json();
    const { userId, sessionToken, base64, mimeType } = body ?? {};

    if (!userId || !sessionToken || !base64) {
      return Response.json(
        { error: "userId, sessionToken, and base64 are required" },
        { status: 400 }
      );
    }

    const { supabaseUrl, serviceKey, anonKey } = getConfig();

    if (!serviceKey) {
      return Response.json(
        { code: "storage_not_configured", error: "SUPABASE_SERVICE_ROLE_KEY not set" },
        { status: 503 }
      );
    }

    const valid = await verifySession(supabaseUrl, anonKey, sessionToken, userId);
    if (!valid) {
      return Response.json({ error: "Invalid session" }, { status: 401 });
    }

    await ensureBucket(supabaseUrl, serviceKey);

    const path = `${userId}/${userId}_${Date.now()}.jpg`;
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

    const publicUrl = await createSignedUrl(supabaseUrl, serviceKey, path);
    return Response.json({ publicUrl, path });
  } catch (error) {
    console.error("[api/profile-photo] Error:", error);
    return Response.json({ error: "Upload failed" }, { status: 500 });
  }
}
