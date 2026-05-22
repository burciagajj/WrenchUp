/**
 * POST /api/profile-photo — upload with service role; auto-creates profile-photos bucket.
 */

import type { Express, Request, Response } from "express";

const BUCKET_ID = "profile-photos";

function getSupabaseConfig() {
  const supabaseUrl =
    process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const anonKey =
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";
  return { supabaseUrl, serviceKey, anonKey };
}

async function verifySessionUser(
  supabaseUrl: string,
  anonKey: string,
  sessionToken: string,
  expectedUserId: string
): Promise<boolean> {
  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${sessionToken}`,
    },
  });
  if (!res.ok) return false;
  const user = await res.json();
  return user?.id === expectedUserId;
}

async function ensureProfilePhotosBucket(
  supabaseUrl: string,
  serviceKey: string
): Promise<void> {
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
    body: JSON.stringify({
      id: BUCKET_ID,
      name: BUCKET_ID,
      public: true,
      file_size_limit: 5242880,
      allowed_mime_types: ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"],
    }),
  });

  if (!create.ok) {
    const err = await create.json().catch(() => ({}));
    throw new Error(err.message || `Failed to create bucket (${create.status})`);
  }
  console.log("[profile-photo] Created storage bucket:", BUCKET_ID);
}

export function registerProfilePhotoRoutes(app: Express): void {
  app.post("/api/profile-photo", async (req: Request, res: Response) => {
    try {
      const { userId, sessionToken, base64, mimeType } = req.body ?? {};

      if (!userId || !sessionToken || !base64) {
        res.status(400).json({ error: "userId, sessionToken, and base64 are required" });
        return;
      }

      const { supabaseUrl, serviceKey, anonKey } = getSupabaseConfig();

      if (!supabaseUrl || !anonKey) {
        res.status(503).json({
          code: "storage_not_configured",
          error: "Supabase URL/anon key missing on server",
        });
        return;
      }

      const valid = await verifySessionUser(supabaseUrl, anonKey, sessionToken, userId);
      if (!valid) {
        res.status(401).json({ error: "Invalid session" });
        return;
      }

      if (!serviceKey) {
        res.status(503).json({
          code: "storage_not_configured",
          error: "SUPABASE_SERVICE_ROLE_KEY not set on server",
        });
        return;
      }

      await ensureProfilePhotosBucket(supabaseUrl, serviceKey);

      const path = `${userId}/${userId}_${Date.now()}.jpg`;
      const binaryString = Buffer.from(base64, "base64");
      const contentType = mimeType || "image/jpeg";

      const uploadRes = await fetch(
        `${supabaseUrl}/storage/v1/object/${BUCKET_ID}/${path}`,
        {
          method: "POST",
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": contentType,
            "x-upsert": "true",
          },
          body: binaryString,
        }
      );

      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({}));
        console.error("[profile-photo] Upload failed:", uploadRes.status, err);
        res.status(500).json({
          error: err.message || err.error || "Storage upload failed",
        });
        return;
      }

      const publicUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET_ID}/${path}`;
      console.log("[profile-photo] Uploaded:", publicUrl);
      res.json({ publicUrl, path });
    } catch (err) {
      console.error("[profile-photo] Error:", err);
      res.status(500).json({
        error: err instanceof Error ? err.message : "Upload failed",
      });
    }
  });
}
