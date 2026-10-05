/**
 * Supabase Storage API (v1.7)
 * Handles photo uploads to Supabase Storage buckets.
 *
 * Requires bucket `profile-photos` — run once:
 *   supabase/migrations/002_profile_photos_bucket.sql (SQL Editor)
 * or: node scripts/setup-profile-photos-bucket.mjs (needs SUPABASE_SERVICE_ROLE_KEY)
 */

import { trackAnalyticsEvent } from "@/lib/analytics";

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
        const text = await response.text();
        let error: any = {};
        if (text) {
          try {
            error = JSON.parse(text);
          } catch {
            error = { message: text };
          }
        }
        const errMessage = error.message || error.error || `Upload failed: ${response.status}`;
        console.error(`[SupabaseStorage] Upload error: ${response.status}`, error);

        const isBucketMissing =
          errMessage.toLowerCase().includes("bucket not found") ||
          error.error === "Bucket not found";

        throw {
          code: isBucketMissing ? "bucket_not_found" : error.error || `http_${response.status}`,
          message: isBucketMissing ? PROFILE_PHOTOS_BUCKET_SETUP : errMessage,
        };
      }

      // profile-photos is a private bucket (holds the admin-reviewed
      // face-verification photo) — get a signed URL rather than assuming a
      // public one works. Uses the caller's own session (this client-side
      // path has no service-role key), so this only succeeds if storage RLS
      // grants the uploader SELECT on their own object; if it doesn't,
      // this throws and uploadProfilePhoto()'s existing data-URL fallback
      // tier takes over, same as any other failure on this path.
      const signRes = await fetch(`${this.supabaseUrl}/storage/v1/object/sign/${this.bucketName}/${encodeURI(path)}`, {
        method: "POST",
        headers: {
          apikey: this.supabaseKey,
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ expiresIn: 60 * 60 * 24 * 365 }),
      });
      const signData = await signRes.json().catch(() => ({}));
      if (!signRes.ok || !signData?.signedURL) {
        throw {
          code: "sign_failed",
          message: signData?.message || signData?.error || "Could not create signed URL for uploaded photo",
        };
      }
      const signedPath = String(signData.signedURL);
      const publicUrl = signedPath.startsWith("http") ? signedPath : `${this.supabaseUrl}/storage/v1${signedPath}`;

      console.log(`[SupabaseStorage] Photo uploaded successfully: ${publicUrl}`);

      return { path, publicUrl };
    } catch (error: any) {
      console.error("[SupabaseStorage] Failed to upload photo:", error);
      void trackAnalyticsEvent({
        eventName: "supabase_error",
        properties: {
          bucket: this.bucketName,
          operation: "upload_profile_photo",
          code: error?.code || "unknown",
          message: error?.message || "Upload failed",
          user_id: userId,
        },
      });
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
        const text = await response.text();
        let error: any = {};
        if (text) {
          try {
            error = JSON.parse(text);
          } catch {
            error = { message: text };
          }
        }
        console.error(`[SupabaseStorage] Delete error: ${response.status}`, error);
        throw {
          code: error.error || `http_${response.status}`,
          message: error.message || `Delete failed: ${response.status}`,
        };
      }

      console.log("[SupabaseStorage] Photo deleted successfully");
    } catch (error: any) {
      console.error("[SupabaseStorage] Failed to delete photo:", error);
      void trackAnalyticsEvent({
        eventName: "supabase_error",
        properties: {
          bucket: this.bucketName,
          operation: "delete_profile_photo",
          code: error?.code || "unknown",
          message: error?.message || "Delete failed",
          user_id: path.split("/")[0] || null,
        },
      });
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
