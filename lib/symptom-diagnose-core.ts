import type { ServiceCode } from "@/lib/types";

export const SYMPTOM_SERVICES: { code: ServiceCode; name: string; price: number }[] = [
  { code: "quick_check_up", name: "Quick Check-Up", price: 29 },
  { code: "battery_jump", name: "Battery Jump", price: 59 },
  { code: "flat_tire", name: "Flat Tire", price: 75 },
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

export type SymptomDiagnosisImage = {
  base64: string;
  mimeType: string;
};

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
// Vision calls cost meaningfully more than text-only ones, and a photo input
// is the easiest way for someone to poke at the model with an unrelated
// image — cap the decoded size so a single request can't get too expensive.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function buildPrompt(symptoms: string, vehicleInfo: string, hasImage: boolean): string {
  const serviceList = SYMPTOM_SERVICES.map(
    (s) => `- ${s.name} (code: ${s.code}, $${s.price})`
  ).join("\n");

  const imageNote = hasImage
    ? `\nA photo is attached. First check whether it actually shows a vehicle, part of a vehicle, or a vehicle-related issue (dashboard light, tire, engine bay, fluid leak, damage, etc). If it does NOT — a person, a pet, a random object, a screenshot, anything unrelated to a car problem — respond with ONLY this JSON and nothing else: {"offTopic":true}. Do not describe the image content in that case.\n`
    : "";

  return `You are WrenchUp's automotive symptom assistant. A customer needs help choosing a mobile mechanic service.
${imageNote}
Vehicle: ${vehicleInfo || "Not specified"}

Customer symptoms:
${symptoms || "(no description provided, rely on the photo)"}

Available WrenchUp services (you MUST pick exactly one):
${serviceList}

If this is a genuine vehicle issue, respond with ONLY valid JSON, no markdown, in this shape:
{"issue":"short title of likely problem","explanation":"2-3 sentences plain English for the customer","serviceCode":"one of: quick_check_up, battery_jump, flat_tire, oil_change, diagnostic"}

Pick the single best matching service. If the issue sounds like a fast inspection, basic check, or there is not enough detail for a deeper repair, recommend quick_check_up. If unclear, recommend diagnostic.`;
}

type ParsedDiagnosis = { offTopic: true } | ({ offTopic?: false } & SymptomDiagnosisPayload);

function parseDiagnosis(text: string): ParsedDiagnosis | null {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    if (parsed.offTopic === true) {
      return { offTopic: true };
    }
    if (
      typeof parsed.issue !== "string" ||
      typeof parsed.explanation !== "string" ||
      typeof parsed.serviceCode !== "string" ||
      !VALID_CODES.has(parsed.serviceCode as ServiceCode)
    ) {
      return null;
    }
    return parsed as SymptomDiagnosisPayload;
  } catch {
    return null;
  }
}

export async function runSymptomDiagnosis(
  symptoms: string,
  vehicleInfo: string,
  image?: SymptomDiagnosisImage
): Promise<SymptomDiagnosisResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("AI service not configured");
  }

  const trimmed = symptoms.trim();
  if (!image && (!trimmed || trimmed.length < 8)) {
    throw new Error("Please describe your symptoms in a bit more detail.");
  }

  if (image) {
    if (!ALLOWED_IMAGE_TYPES.has(image.mimeType)) {
      throw new Error("Photo must be a JPEG, PNG, or WEBP image.");
    }
    // base64 is ~4/3 the size of the decoded bytes.
    const approxBytes = (image.base64.length * 3) / 4;
    if (approxBytes > MAX_IMAGE_BYTES) {
      throw new Error("Photo is too large. Please use a smaller image.");
    }
  }

  const content: Record<string, unknown>[] = image
    ? [
        {
          type: "image",
          source: { type: "base64", media_type: image.mimeType, data: image.base64 },
        },
        { type: "text", text: buildPrompt(trimmed, vehicleInfo, true) },
      ]
    : [{ type: "text", text: buildPrompt(trimmed, vehicleInfo, false) }];

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
      messages: [{ role: "user", content }],
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
  if (diagnosis.offTopic) {
    throw new Error("That photo doesn't look like a vehicle issue. Try a clearer photo or describe the problem instead.");
  }

  const service = SYMPTOM_SERVICES.find((s) => s.code === diagnosis.serviceCode)!;
  return {
    ...diagnosis,
    serviceName: service.name,
    price: service.price,
  };
}
