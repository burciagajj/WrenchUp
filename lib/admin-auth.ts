import { getCurrentUserAuth, getNotificationServiceConfig, supabaseRest } from "@/lib/notification-service";
import { isAdminAccess } from "@/lib/admin-access-core";

type AdminProfile = {
  user_id: string;
  email: string | null;
  role: string | null;
};

const requestBuckets = new Map<string, { count: number; resetAt: number }>();

export function getBearerToken(request: Request): string | null {
  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return token.length > 0 ? token : null;
}

// In-memory only — cheap, but each deployed request can land on a separate
// serverless instance with its own fresh module state, so this bucket does
// NOT reliably persist across requests in production (verified: 8 concurrent
// requests against a limit of 5 all succeeded). Fine as a same-instance
// speed bump, but never rely on it as the real cap for anything that costs
// money or matters for abuse — use checkDurableRateLimit for that.
export function checkRateLimit(key: string, limit = 60, windowMs = 60_000): boolean {
  const now = Date.now();
  const current = requestBuckets.get(key);
  if (!current || current.resetAt <= now) {
    requestBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

// Durable rate limit backed by a Postgres row (see migration
// add_durable_rate_limit_bucket + the check_rate_limit() SQL function),
// atomic via a single upsert under a row lock — safe under concurrent
// requests, unlike the in-memory version above. Costs one DB round trip.
export async function checkDurableRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  serviceKey: string
): Promise<boolean> {
  const result = await supabaseRest<boolean | { check_rate_limit: boolean } | [boolean]>(
    "/rpc/check_rate_limit",
    "POST",
    serviceKey,
    { p_key: key, p_limit: limit, p_window_seconds: windowSeconds }
  );
  if (typeof result === "boolean") return result;
  if (Array.isArray(result)) return Boolean(result[0]);
  if (result && typeof result === "object" && "check_rate_limit" in result) {
    return Boolean((result as { check_rate_limit: boolean }).check_rate_limit);
  }
  // Fail closed on an unexpected shape — better to briefly block diagnoses
  // than to silently drop the cap.
  return false;
}

export async function requireAdmin(request: Request): Promise<
  | { ok: true; userId: string; email: string | null; serviceKey: string; supabaseUrl: string }
  | { ok: false; response: Response }
> {
  const { supabaseUrl, serviceKey } = getNotificationServiceConfig();
  const adminEmail = process.env.ADMIN_USER_EMAIL || "";
  if (!serviceKey) {
    return { ok: false, response: Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY not set" }, { status: 503 }) };
  }

  const sessionToken = getBearerToken(request);
  if (!sessionToken) {
    return { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  if (!checkRateLimit(sessionToken.slice(-24), 80, 60_000)) {
    return { ok: false, response: Response.json({ error: "Rate limit exceeded" }, { status: 429 }) };
  }

  const currentUser = await getCurrentUserAuth(supabaseUrl, serviceKey, sessionToken);
  if (!currentUser?.id) {
    return { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const profiles = await supabaseRest<AdminProfile[]>(
    `/user_profiles?user_id=eq.${encodeURIComponent(currentUser.id)}&select=user_id,email,role&limit=1`,
    "GET",
    serviceKey,
  ).catch(() => null);
  const profile = Array.isArray(profiles) ? profiles[0] : null;
  if (!isAdminAccess({ role: profile?.role, email: currentUser.email ?? profile?.email }, adminEmail)) {
    return { ok: false, response: Response.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return {
    ok: true,
    userId: currentUser.id,
    email: currentUser.email,
    serviceKey,
    supabaseUrl,
  };
}
