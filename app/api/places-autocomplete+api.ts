// Server-side proxy for Google Places Autocomplete. The Maps SDK key
// (GOOGLE_MAPS_ANDROID_API_KEY) is restricted to "Android apps" + "Maps SDK
// for Android" only — that restriction is enforced via headers the native
// Android SDK attaches automatically, which a plain server-side fetch can't
// produce, so a REST call with that key would be rejected regardless of
// which APIs are enabled on it. This route uses a separate, server-only key
// (GOOGLE_PLACES_API_KEY, never sent to the client) with "Places API"
// enabled instead.

// Places API (New) — the project only has the "New" API activated, not the
// legacy `maps/api/place/autocomplete/json` endpoint, so this uses the v1
// REST surface (different request/response shape from the legacy API).
const AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete";

// El Paso / Juárez border area — the app's actual service region (see
// admin analytics REGION_OPTIONS: "El Paso" / "Juarez"). Used only to bias
// ranking toward nearby results; doesn't exclude results outside it.
const REGION_BIAS = { lat: 31.7619, lng: -106.485, radiusMeters: 50_000 };

type NewApiSuggestion = {
  placePrediction?: {
    placeId: string;
    text?: { text: string };
  };
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const input = (url.searchParams.get("input") || "").trim();
    if (!input || input.length < 3) {
      return Response.json({ predictions: [] });
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY || "";
    if (!apiKey) {
      return Response.json({ code: "places_not_configured", error: "GOOGLE_PLACES_API_KEY not set", predictions: [] }, { status: 503 });
    }

    const res = await fetch(AUTOCOMPLETE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text",
      },
      body: JSON.stringify({
        input,
        includedRegionCodes: ["us", "mx"],
        locationBias: {
          circle: {
            center: { latitude: REGION_BIAS.lat, longitude: REGION_BIAS.lng },
            radius: REGION_BIAS.radiusMeters,
          },
        },
      }),
    });
    const data = await res.json().catch(() => null);

    if (!res.ok || !data) {
      const message = data?.error?.message || "Places autocomplete failed";
      return Response.json({ error: message, predictions: [] }, { status: 502 });
    }

    const suggestions: NewApiSuggestion[] = Array.isArray(data.suggestions) ? data.suggestions : [];
    const predictions = suggestions
      .filter((s) => s.placePrediction?.placeId && s.placePrediction.text?.text)
      .slice(0, 6)
      .map((s) => ({
        placeId: s.placePrediction!.placeId,
        description: s.placePrediction!.text!.text,
      }));

    return Response.json({ predictions });
  } catch (error) {
    console.error("[api/places-autocomplete] Error:", error);
    return Response.json({ error: "Places autocomplete failed", predictions: [] }, { status: 500 });
  }
}
