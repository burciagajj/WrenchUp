import type { ServiceCode } from "@/lib/types";

export const SYMPTOM_SERVICES: { code: ServiceCode; name: string; price: number }[] = [
  { code: "battery_jump", name: "Battery Jump", price: 49 },
  { code: "flat_tire", name: "Flat Tire", price: 69 },
  { code: "oil_change", name: "Oil Change", price: 89 },
  { code: "diagnostic", name: "Diagnostic", price: 79 },
];

const VALID_CODES = new Set(SYMPTOM_SERVICES.map((s) => s.code));

export type SymptomDiagnosisPayload = {
  issue: string;
  explanation: string;
  serviceCode: ServiceCode;
};

export type SymptomDiagnosisResponse = SymptomDiagnosisPayload & {
  serviceName: string;
  price: number;
};

function buildPrompt(symptoms: string, vehicleInfo: string): string {
  const serviceList = SYMPTOM_SERVICES.map(
    (s) => `- ${s.name} (code: ${s.code}, $${s.price})`
  ).join("\n");

  return `You are WrenchUp's automotive symptom assistant. A customer needs help choosing a mobile mechanic service.

Vehicle: ${vehicleInfo || "Not specified"}

Customer symptoms:
${symptoms}

Available WrenchUp services (you MUST pick exactly one):
${serviceList}

Respond with ONLY valid JSON, no markdown, in this shape:
{"issue":"short title of likely problem","explanation":"2-3 sentences plain English for the customer","serviceCode":"one of: battery_jump, flat_tire, oil_change, diagnostic"}

Pick the single best matching service. If unclear, recommend diagnostic.`;
}

function parseDiagnosis(text: string): SymptomDiagnosisPayload | null {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]) as SymptomDiagnosisPayload;
    if (
      typeof parsed.issue !== "string" ||
      typeof parsed.explanation !== "string" ||
      typeof parsed.serviceCode !== "string" ||
      !VALID_CODES.has(parsed.serviceCode as ServiceCode)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function runSymptomDiagnosis(
  symptoms: string,
  vehicleInfo: string
): Promise<SymptomDiagnosisResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("AI service not configured");
  }

  const trimmed = symptoms.trim();
  if (!trimmed || trimmed.length < 8) {
    throw new Error("Please describe your symptoms in a bit more detail.");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 512,
      messages: [{ role: "user", content: buildPrompt(trimmed, vehicleInfo) }],
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    const msg = data?.error?.message ?? "Failed to analyze symptoms";
    throw new Error(msg);
  }

  const text = data?.content?.[0]?.text;
  if (!text) {
    throw new Error("Empty response from AI");
  }

  const diagnosis = parseDiagnosis(text);
  if (!diagnosis) {
    throw new Error("Could not read diagnosis. Please try again.");
  }

  const service = SYMPTOM_SERVICES.find((s) => s.code === diagnosis.serviceCode)!;
  return {
    ...diagnosis,
    serviceName: service.name,
    price: service.price,
  };
}
