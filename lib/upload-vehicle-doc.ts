import { getApiBaseUrl } from "@/constants/oauth";
import type { PickedImage } from "@/hooks/use-image-picker";

export async function uploadVehicleDoc(
  userId: string,
  sessionToken: string,
  docType: "insurance" | "registration",
  image: PickedImage
): Promise<string> {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    throw new Error("Upload service unavailable. Please try again.");
  }

  const res = await fetch(`${baseUrl}/api/vehicle-doc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId,
      sessionToken,
      base64: image.base64,
      mimeType: image.mimeType,
      docType,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.path) {
    throw new Error(data.error || "Could not upload document");
  }

  return data.path as string;
}
