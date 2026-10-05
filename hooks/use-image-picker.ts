/**
 * Image Picker Hook (v1.8)
 * Gallery + camera for profile photos; returns base64 encoded image data.
 */

import { useCallback } from "react";
import { Alert, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";

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
  cameraType?: ImagePicker.CameraType;
};

async function launchPicker(
  source: "library" | "camera",
  options: ImagePickerOptions = {}
): Promise<PickedImage | null> {
  const { allowsEditing = true, aspect = [1, 1], quality = 0.8, cameraType } = options;

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
    ...(cameraType ? { cameraType } : {}),
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
  let base64 = asset.base64 ?? null;
  if (!base64 && asset.uri) {
    try {
      base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    } catch (error) {
      console.error("[useImagePicker] Failed to read picked file:", error);
    }
  }

  if (!base64) {
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
    size: base64.length,
  });

  return {
    base64,
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
    (options?: ImagePickerOptions) => launchPicker("camera", options),
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

  /**
   * Camera-only capture for the required, admin-reviewed profile photo.
   * No gallery option is offered — this must be a live shot of the user's
   * face, not an existing photo. Defaults to the front camera. On web there
   * is no launchCameraAsync, so this falls back to the library picker (web
   * builds already can't do OS-level camera capture the way native can).
   */
  const pickFacePhoto = useCallback((): Promise<PickedImage | null> => {
    if (Platform.OS === "web") {
      return launchPicker("library", { allowsEditing: true, aspect: [1, 1], quality: 0.6 });
    }
    return launchPicker("camera", {
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
      cameraType: ImagePicker.CameraType.front,
    });
  }, []);

  const pickDocumentImage = useCallback((): Promise<PickedImage | null> => {
    if (Platform.OS === "web") {
      return launchPicker("library", { allowsEditing: false, quality: 0.9 });
    }

    return new Promise((resolve) => {
      Alert.alert("Document Photo", "Choose a source", [
        { text: "Cancel", style: "cancel", onPress: () => resolve(null) },
        {
          text: "Take Photo",
          onPress: async () =>
            resolve(await launchPicker("camera", { allowsEditing: false, quality: 0.9 })),
        },
        {
          text: "Choose from Gallery",
          onPress: async () =>
            resolve(await launchPicker("library", { allowsEditing: false, quality: 0.9 })),
        },
      ]);
    });
  }, []);

  /**
   * Camera-or-gallery capture for the symptom-checker's optional issue
   * photo. Lower quality than pickDocumentImage — this goes straight into a
   * base64 JSON payload to a vision API call, so it's worth keeping small.
   */
  const pickIssuePhoto = useCallback((): Promise<PickedImage | null> => {
    if (Platform.OS === "web") {
      return launchPicker("library", { allowsEditing: false, quality: 0.5 });
    }

    return new Promise((resolve) => {
      Alert.alert("Photo of the Issue", "Choose a source", [
        { text: "Cancel", style: "cancel", onPress: () => resolve(null) },
        {
          text: "Take Photo",
          onPress: async () =>
            resolve(await launchPicker("camera", { allowsEditing: false, quality: 0.5 })),
        },
        {
          text: "Choose from Gallery",
          onPress: async () =>
            resolve(await launchPicker("library", { allowsEditing: false, quality: 0.5 })),
        },
      ]);
    });
  }, []);

  /**
   * Camera-or-gallery capture for a mechanic's parts receipt (see
   * lib/live-dispatch.ts's proposePartsCost). Higher quality than
   * pickIssuePhoto — a receipt needs to stay legible enough to read a
   * dollar amount off it.
   */
  const pickReceiptImage = useCallback((): Promise<PickedImage | null> => {
    if (Platform.OS === "web") {
      return launchPicker("library", { allowsEditing: false, quality: 0.85 });
    }

    return new Promise((resolve) => {
      Alert.alert("Receipt Photo", "Choose a source", [
        { text: "Cancel", style: "cancel", onPress: () => resolve(null) },
        {
          text: "Take Photo",
          onPress: async () =>
            resolve(await launchPicker("camera", { allowsEditing: false, quality: 0.85 })),
        },
        {
          text: "Choose from Gallery",
          onPress: async () =>
            resolve(await launchPicker("library", { allowsEditing: false, quality: 0.85 })),
        },
      ]);
    });
  }, []);

  return {
    pickImage,
    pickImageFromGallery,
    pickImageFromCamera,
    pickProfileImage,
    pickFacePhoto,
    pickDocumentImage,
    pickIssuePhoto,
    pickReceiptImage,
  };
}
