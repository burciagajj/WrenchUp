import { getApiUrl } from "@/lib/api-base-url";
import type { ServiceCode } from "@/lib/types";

export type SymptomDiagnosisResult = {
  issue: string;
  explanation: string;
  serviceCode: ServiceCode;
  serviceName: string;
  price: number;
};

export async function diagnoseSymptoms(
  symptoms: string,
  vehicleInfo: string
): Promise<SymptomDiagnosisResult> {
  let url: string;
  try {
    url = getApiUrl("/api/symptom-diagnose");
  } catch (err) {
    throw err;
  }

  console.log("[symptom-diagnose] POST", url);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symptoms, vehicleInfo }),
    });
  } catch {
    throw new Error(
      "Network request failed. Ensure the API server is running (pnpm dev:server) and EXPO_PUBLIC_API_BASE_URL points to your current ngrok or LAN URL."
    );
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error ?? `Diagnosis failed (${response.status})`);
  }

  return data as SymptomDiagnosisResult;
}
