import { getCurrentUserId, getNotificationServiceConfig, supabaseRest } from "@/lib/notification-service";

// Signs a 5-minute view URL for a mechanic's parts receipt photo, scoped to
// the request's own customer or assigned mechanic — mirrors the signing
// pattern in app/api/admin/mechanic-verifications+api.ts, just authorized
// for the two parties to this specific job instead of an admin.
const BUCKET_ID = "mechanic-documents";

async function createSignedUrl(supabaseUrl: string, serviceKey: string, path: string): Promise<string> {
  const res = await fetch(
    `${supabaseUrl}/storage/v1/object/sign/${BUCKET_ID}/${encodeURI(path)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ expiresIn: 300 }),
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.signedURL) {
    throw new Error(data?.message || data?.error || "Could not create signed URL");
  }
  const signedPath = String(data.signedURL);
  return signedPath.startsWith("http") ? signedPath : `${supabaseUrl}/storage/v1${signedPath}`;
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const sessionToken = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
    if (!sessionToken) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const requestId = typeof body?.requestId === "string" ? body.requestId.trim() : "";
    if (!requestId) {
      return Response.json({ error: "requestId is required" }, { status: 400 });
    }

    const { supabaseUrl, serviceKey } = getNotificationServiceConfig();
    if (!supabaseUrl || !serviceKey) {
      return Response.json({ error: "Service unavailable" }, { status: 503 });
    }

    const currentUserId = await getCurrentUserId(supabaseUrl, serviceKey, sessionToken);
    if (!currentUserId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rows = await supabaseRest<{
      customer_user_id: string;
      assigned_mechanic_user_id: string | null;
      parts_receipt_path: string | null;
    }[]>(
      `/service_requests?id=eq.${encodeURIComponent(requestId)}&select=customer_user_id,assigned_mechanic_user_id,parts_receipt_path`,
      "GET",
      serviceKey,
    );
    const dispatchRequest = Array.isArray(rows) ? rows[0] : null;
    if (!dispatchRequest) {
      return Response.json({ error: "Request not found" }, { status: 404 });
    }
    if (
      currentUserId !== dispatchRequest.customer_user_id &&
      currentUserId !== dispatchRequest.assigned_mechanic_user_id
    ) {
      return Response.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (!dispatchRequest.parts_receipt_path) {
      return Response.json({ error: "No receipt on file for this request" }, { status: 404 });
    }

    const signedUrl = await createSignedUrl(supabaseUrl, serviceKey, dispatchRequest.parts_receipt_path);
    return Response.json({ signedUrl, expiresIn: 300 });
  } catch (error) {
    console.error("[parts-receipt-url] Error:", error);
    return Response.json({ error: "Could not create signed URL" }, { status: 500 });
  }
}
