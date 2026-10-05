import { getApiUrl } from "@/lib/api-base-url";
import type { PickedImage } from "@/hooks/use-image-picker";

export async function uploadServiceEvidencePhoto(
  requestId: string,
  sessionToken: string,
  kind: "before" | "after",
  image: PickedImage,
): Promise<string> {
  const res = await fetch(getApiUrl("/api/service-evidence-photo"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requestId,
      sessionToken,
      kind,
      base64: image.base64,
      mimeType: image.mimeType,
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || "Could not upload service evidence photo");
  }
  if (!data?.path) throw new Error("Service evidence upload did not return a path");
  return String(data.path);
}
