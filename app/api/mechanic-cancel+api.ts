import { releaseServiceRequestFromMechanic } from "@/lib/mechanic-cancel-service";

function getSessionToken(request: Request): string {
  const authHeader = request.headers.get("authorization") || "";
  return authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const result = await releaseServiceRequestFromMechanic({
    sessionToken: getSessionToken(request),
    requestId: body?.requestId,
    reason: body?.reason,
  });
  return Response.json(result.body, { status: result.status });
}
