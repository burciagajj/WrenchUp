/**
 * Image Picker Hook (v1.8)
 * Handles image selection from device library
 * Returns base64 encoded image data
 */

import { useCallback } from "react";
import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";

export type PickedImage = {
  base64: string;
  mimeType: string;
  filename: string;
  width: number;
  height: number;
};

export function useImagePicker() {
  const pickImage = useCallback(async (): Promise<PickedImage | null> => {
    try {
      // Request permissions
      if (Platform.OS !== "web") {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
          console.warn("[useImagePicker] Media library permission denied");
          return null;
        }
      }

      // Launch image picker
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1], // Square for profile photo
        quality: 0.8,
        base64: true,
      });

      if (result.canceled) {
        console.log("[useImagePicker] Image selection cancelled");
        return null;
      }

      const asset = result.assets[0];
      if (!asset.base64) {
        console.error("[useImagePicker] No base64 data returned");
        return null;
      }

      // Determine MIME type
      const filename = asset.uri.split("/").pop() || "photo.jpg";
      const mimeType = asset.mimeType || "image/jpeg";

      console.log("[useImagePicker] Image selected:", {
        filename,
        width: asset.width,
        height: asset.height,
        size: asset.base64.length,
      });

      return {
        base64: asset.base64,
        mimeType,
        filename,
        width: asset.width,
        height: asset.height,
      };
    } catch (err) {
      console.error("[useImagePicker] Failed to pick image:", err);
      return null;
    }
  }, []);

  return { pickImage };
}
