import { runSymptomDiagnosis } from "@/lib/symptom-diagnose-core";
import { checkRateLimit, checkDurableRateLimit, getBearerToken } from "@/lib/admin-auth";
import { getCurrentUserId, getNotificationServiceConfig } from "@/lib/notification-service";

// This route proxies to a paid, metered LLM API (ANTHROPIC_API_KEY) with no
// per-caller cost cap of its own. Previously had no auth check at all —
// anyone who discovered the deployed URL could call it for free, unlimited
// times, at the app's expense. Now requires a signed-in session (matching
// every other user-facing route in this app) and rate limits as a second
// layer, in case a compromised/shared token gets hammered.
export async function POST(request: Request) {
  try {
    const sessionToken = getBearerToken(request);
    if (!sessionToken) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Cheap burst guard before we've even looked up who's calling — keyed
    // by token since userId isn't known yet. Generous on purpose; the real
    // usage cap is below, keyed by account.
    if (!checkRateLimit(`symptom-diagnose-burst:${sessionToken.slice(-24)}`, 20, 60_000)) {
      return Response.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    const { supabaseUrl, serviceKey } = getNotificationServiceConfig();
    if (!supabaseUrl || !serviceKey) {
      return Response.json({ error: "Service unavailable" }, { status: 503 });
    }
    const userId = await getCurrentUserId(supabaseUrl, serviceKey, sessionToken);
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const symptoms = typeof body.symptoms === "string" ? body.symptoms : "";
    const vehicleInfo =
      typeof body.vehicleInfo === "string" ? body.vehicleInfo.trim() : "Not specified";
    const rawImage = body.image;
    const image =
      rawImage && typeof rawImage.base64 === "string" && typeof rawImage.mimeType === "string"
        ? { base64: rawImage.base64, mimeType: rawImage.mimeType }
        : undefined;

    // The real usage cap: 5 diagnoses per 12 hours per account, text and
    // photo combined. Keyed by userId (not the session token) so a normal
    // token refresh doesn't hand out a fresh bucket — same account, same
    // limit, no matter how the requests are paced. Backed by a DB row
    // (checkDurableRateLimit), not memory — this deployment runs each
    // request on a separate instance, so an in-memory counter here would
    // never actually catch anything.
    const withinLimit = await checkDurableRateLimit(`symptom-diagnose:${userId}`, 5, 12 * 60 * 60, serviceKey);
    if (!withinLimit) {
      return Response.json({ error: "You've reached today's diagnosis limit. Try again later." }, { status: 429 });
    }

    const result = await runSymptomDiagnosis(symptoms, vehicleInfo, image);
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to diagnose symptoms";
    const status =
      message.includes("not configured")
        ? 503
        : message.includes("more detail") || message.includes("too large") || message.includes("must be a")
          ? 400
          : message.includes("doesn't look like a vehicle")
            ? 422
            : 500;
    console.error("[symptom-diagnose]", error);
    return Response.json({ error: message }, { status });
  }
}
