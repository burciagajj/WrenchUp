/**
 * Profile photo upload — tries server (auto-creates bucket), then Storage, then data-URL fallback.
 */

import { getApiBaseUrl } from "@/constants/oauth";
import type { PickedImage } from "@/hooks/use-image-picker";
import { supabaseStorage } from "@/lib/_core/supabase-storage";
import { supabaseUserData } from "@/lib/_core/supabase-user-data";
import { refreshProfileSessionToken } from "@/lib/profile-session";

const MAX_DATA_URL_BASE64_CHARS = 1_400_000; // ~1 MB image as base64 in avatar_url

function isBucketMissingError(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  const msg = (e?.message ?? "").toLowerCase();
  return (
    e?.code === "bucket_not_found" ||
    msg.includes("bucket not found") ||
    msg.includes("storage is not set up") ||
    msg.includes("no buckets were found")
  );
}

/** Upload via Express / Expo API (service role creates bucket if needed). */
async function uploadViaServerApi(
  userId: string,
  image: PickedImage,
  sessionToken: string
): Promise<string | null> {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) return null;

  const url = `${baseUrl}/api/profile-photo`;
  console.log("[uploadProfilePhoto] Trying server upload:", url);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId,
      sessionToken,
      base64: image.base64,
      mimeType: image.mimeType,
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (res.status === 503 && data.code === "storage_not_configured") {
    console.log("[uploadProfilePhoto] Server storage not configured, trying next method");
    return null;
  }

  if (!res.ok) {
    throw new Error(data.message || data.error || `Upload failed (${res.status})`);
  }

  if (!data.publicUrl) {
    throw new Error("Upload succeeded but no publicUrl returned");
  }

  return data.publicUrl as string;
}

/** Store compressed image inline in user_profiles.avatar_url (no Storage bucket required). */
async function uploadAsDataUrl(
  userId: string,
  image: PickedImage,
  sessionToken: string
): Promise<string> {
  if (image.base64.length > MAX_DATA_URL_BASE64_CHARS) {
    throw new Error("Photo is too large. Please choose a smaller image or crop tighter.");
  }

  const dataUrl = `data:${image.mimeType};base64,${image.base64}`;
  console.log("[uploadProfilePhoto] Saving avatar as data URL (Storage bucket not available)");

  const token = await refreshProfileSessionToken(sessionToken);
  await supabaseUserData.updateProfilePhoto(userId, dataUrl, token);
  return dataUrl;
}

/**
 * Upload profile photo and return the URL saved on user_profiles.avatar_url.
 */
export async function uploadProfilePhoto(
  userId: string,
  image: PickedImage,
  sessionToken: string
): Promise<string> {
  const token = await refreshProfileSessionToken(sessionToken);

  // 1) Server API (auto-creates bucket when SUPABASE_SERVICE_ROLE_KEY is set on server)
  try {
    const serverUrl = await uploadViaServerApi(userId, image, token);
    if (serverUrl) {
      await supabaseUserData.updateProfilePhoto(userId, serverUrl, token);
      return serverUrl;
    }
  } catch (err) {
    if (!isBucketMissingError(err)) {
      console.warn("[uploadProfilePhoto] Server upload failed:", err);
    }
  }

  // 2) Direct Supabase Storage (requires profile-photos bucket + RLS)
  try {
    const result = await supabaseStorage.uploadProfilePhoto(
      userId,
      image.base64,
      image.mimeType,
      token
    );
    await supabaseUserData.updateProfilePhoto(userId, result.publicUrl, token);
    return result.publicUrl;
  } catch (err) {
    if (!isBucketMissingError(err)) throw err;
    console.warn("[uploadProfilePhoto] Storage bucket missing, using data-URL fallback");
  }

  // 3) Fallback — works without any Storage bucket
  return uploadAsDataUrl(userId, image, token);
}
