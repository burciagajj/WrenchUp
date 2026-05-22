/**
 * Supabase Storage API (v1.7)
 * Handles photo uploads to Supabase Storage buckets.
 *
 * Requires bucket `profile-photos` — run once:
 *   supabase/migrations/002_profile_photos_bucket.sql (SQL Editor)
 * or: node scripts/setup-profile-photos-bucket.mjs (needs SUPABASE_SERVICE_ROLE_KEY)
 */

export type StorageUploadResult = {
  path: string;
  publicUrl: string;
};

/** Shown when direct Storage upload fails (app may still use data-URL fallback). */
export const PROFILE_PHOTOS_BUCKET_SETUP =
  "Profile photo storage bucket is missing. The app will save your photo directly to your profile, or run supabase/migrations/002_profile_photos_bucket.sql in Supabase SQL Editor for Storage uploads.";

class SupabaseStorageClient {
  private supabaseUrl: string;
  private supabaseKey: string;
  /** Must match storage.buckets.id in 002_profile_photos_bucket.sql */
  private bucketName = "profile-photos";

  constructor() {
    this.supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || "";
    this.supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";

    if (!this.supabaseUrl || !this.supabaseKey) {
      console.error("[SupabaseStorage] CRITICAL: Missing Supabase credentials!");
    }
  }

  /**
   * Upload photo to Supabase Storage
   * Expects base64 encoded image data
   */
  async uploadProfilePhoto(
    userId: string,
    base64Data: string,
    mimeType: string,
    sessionToken: string
  ): Promise<StorageUploadResult> {
    try {
      // Generate unique filename
      const timestamp = Date.now();
      const filename = `${userId}_${timestamp}.jpg`;
      const path = `${userId}/${filename}`;

      console.log(`[SupabaseStorage] Uploading photo: ${path}`);

      // Convert base64 to binary
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Upload to Supabase Storage
      const url = `${this.supabaseUrl}/storage/v1/object/${this.bucketName}/${path}`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          apikey: this.supabaseKey,
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": mimeType,
          "x-upsert": "true",
        },
        body: bytes,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        const errMessage =
          error.message || error.error || `Upload failed: ${response.status}`;
        console.error(`[SupabaseStorage] Upload error: ${response.status}`, error);

        const isBucketMissing =
          errMessage.toLowerCase().includes("bucket not found") ||
          error.error === "Bucket not found";

        throw {
          code: isBucketMissing ? "bucket_not_found" : error.error || `http_${response.status}`,
          message: isBucketMissing ? PROFILE_PHOTOS_BUCKET_SETUP : errMessage,
        };
      }

      // Generate public URL
      const publicUrl = `${this.supabaseUrl}/storage/v1/object/public/${this.bucketName}/${path}`;

      console.log(`[SupabaseStorage] Photo uploaded successfully: ${publicUrl}`);

      return { path, publicUrl };
    } catch (error: any) {
      console.error("[SupabaseStorage] Failed to upload photo:", error);
      throw error;
    }
  }

  /**
   * Delete photo from Supabase Storage
   */
  async deleteProfilePhoto(path: string, sessionToken: string): Promise<void> {
    try {
      console.log(`[SupabaseStorage] Deleting photo: ${path}`);

      const url = `${this.supabaseUrl}/storage/v1/object/${this.bucketName}/${path}`;
      const response = await fetch(url, {
        method: "DELETE",
        headers: {
          apikey: this.supabaseKey,
          Authorization: `Bearer ${sessionToken}`,
        },
      });

      if (!response.ok && response.status !== 204) {
        const error = await response.json();
        console.error(`[SupabaseStorage] Delete error: ${response.status}`, error);
        throw {
          code: error.error || `http_${response.status}`,
          message: error.message || `Delete failed: ${response.status}`,
        };
      }

      console.log("[SupabaseStorage] Photo deleted successfully");
    } catch (error: any) {
      console.error("[SupabaseStorage] Failed to delete photo:", error);
      throw error;
    }
  }

  /**
   * Get public URL for a photo
   */
  getPublicUrl(path: string): string {
    return `${this.supabaseUrl}/storage/v1/object/public/${this.bucketName}/${path}`;
  }
}

export const supabaseStorage = new SupabaseStorageClient();
