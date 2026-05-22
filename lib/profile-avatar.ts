/**
 * Upload profile photo and persist avatar_url on user_profiles.
 * Uses server/Storage when available; falls back to data-URL if no bucket exists.
 */

import type { PickedImage } from "@/hooks/use-image-picker";
import { uploadProfilePhoto } from "@/lib/upload-profile-photo";

/**
 * Upload image and PATCH user_profiles.avatar_url.
 * Returns the URL saved in Supabase (public Storage URL or data: URL).
 */
export async function saveProfileAvatar(
  userId: string,
  image: PickedImage,
  sessionToken: string
): Promise<string> {
  console.log("[saveProfileAvatar] Uploading profile photo for user:", userId);
  const url = await uploadProfilePhoto(userId, image, sessionToken);
  console.log("[saveProfileAvatar] avatar_url saved:", url.startsWith("data:") ? "data-url" : url);
  return url;
}
