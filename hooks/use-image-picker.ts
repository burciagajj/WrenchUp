/**
 * Image Picker Hook (v1.8)
 * Gallery + camera for profile photos; returns base64 encoded image data.
 */

import { useCallback } from "react";
import { Alert, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";

export type PickedImage = {
  base64: string;
  mimeType: string;
  filename: string;
  width: number;
  height: number;
  /** Local URI for on-screen preview before upload */
  uri: string;
};

type ImagePickerOptions = {
  allowsEditing?: boolean;
  aspect?: [number, number];
  quality?: number;
};

async function launchPicker(
  source: "library" | "camera",
  options: ImagePickerOptions = {}
): Promise<PickedImage | null> {
  const { allowsEditing = true, aspect = [1, 1], quality = 0.8 } = options;

  if (Platform.OS !== "web") {
    if (source === "library") {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        console.warn("[useImagePicker] Media library permission denied");
        return null;
      }
    } else {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        console.warn("[useImagePicker] Camera permission denied");
        return null;
      }
    }
  }

  const pickerOptions: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    allowsEditing,
    aspect,
    quality,
    base64: true,
  };

  const result =
    source === "library"
      ? await ImagePicker.launchImageLibraryAsync(pickerOptions)
      : await ImagePicker.launchCameraAsync(pickerOptions);

  if (result.canceled) {
    console.log(`[useImagePicker] ${source} selection cancelled`);
    return null;
  }

  const asset = result.assets[0];
  if (!asset.base64) {
    console.error("[useImagePicker] No base64 data returned");
    return null;
  }

  const filename = asset.uri.split("/").pop() || "photo.jpg";
  const mimeType = asset.mimeType || "image/jpeg";

  console.log("[useImagePicker] Image selected:", {
    source,
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
    uri: asset.uri,
  };
}

export function useImagePicker() {
  const pickImageFromGallery = useCallback(
    () => launchPicker("library"),
    []
  );

  const pickImageFromCamera = useCallback(
    () => launchPicker("camera"),
    []
  );

  /** Legacy alias — opens gallery only */
  const pickImage = pickImageFromGallery;

  /**
   * Show camera vs gallery chooser (native Alert).
   * On web, falls back to gallery only.
   */
  const pickProfileImage = useCallback((): Promise<PickedImage | null> => {
    if (Platform.OS === "web") {
      return launchPicker("library", { allowsEditing: true, aspect: [1, 1], quality: 0.4 });
    }

    return new Promise((resolve) => {
      Alert.alert("Profile Photo", "Choose a source", [
        { text: "Cancel", style: "cancel", onPress: () => resolve(null) },
        {
          text: "Take Photo",
          onPress: async () =>
            resolve(await launchPicker("camera", { allowsEditing: true, aspect: [1, 1], quality: 0.4 })),
        },
        {
          text: "Choose from Gallery",
          onPress: async () =>
            resolve(await launchPicker("library", { allowsEditing: true, aspect: [1, 1], quality: 0.4 })),
        },
      ]);
    });
  }, []);

  return {
    pickImage,
    pickImageFromGallery,
    pickImageFromCamera,
    pickProfileImage,
  };
}
