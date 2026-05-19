/**
 * Supabase Storage API (v1.7)
 * Handles photo uploads to Supabase Storage buckets
 */

export type StorageUploadResult = {
  path: string;
  publicUrl: string;
};

class SupabaseStorageClient {
  private supabaseUrl: string;
  private supabaseKey: string;
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
        },
        body: bytes,
      });

      if (!response.ok) {
        const error = await response.json();
        console.error(`[SupabaseStorage] Upload error: ${response.status}`, error);
        throw {
          code: error.error || `http_${response.status}`,
          message: error.message || `Upload failed: ${response.status}`,
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
