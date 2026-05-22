import { runSymptomDiagnosis } from "@/lib/symptom-diagnose-core";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const symptoms = typeof body.symptoms === "string" ? body.symptoms : "";
    const vehicleInfo =
      typeof body.vehicleInfo === "string" ? body.vehicleInfo.trim() : "Not specified";

    const result = await runSymptomDiagnosis(symptoms, vehicleInfo);
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to diagnose symptoms";
    const status =
      message.includes("not configured") ? 503 : message.includes("more detail") ? 400 : 500;
    console.error("[symptom-diagnose]", error);
    return Response.json({ error: message }, { status });
  }
}
