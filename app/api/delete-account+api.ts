/**
 * Permanently deletes the caller's own auth user. Every table with user data
 * (user_profiles, user_vehicles, mechanic_presence, service_requests as
 * customer, safety_reports/flags, service_disputes, etc.) has an
 * ON DELETE CASCADE foreign key to auth.users, so deleting the auth user
 * cascades cleanly. Rows where the caller is a mechanic assigned to someone
 * else's job (service_requests.assigned_mechanic_user_id) are ON DELETE SET
 * NULL instead, so the customer's job history isn't destroyed by the
 * mechanic deleting their account.
 */

function getConfig() {
  return {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL || "",
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "",
  };
}

async function verifySession(
  supabaseUrl: string,
  anonKey: string,
  sessionToken: string,
  userId: string
): Promise<boolean> {
  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${sessionToken}` },
  });
  if (!res.ok) return false;
  const user = await res.json();
  return user?.id === userId;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId, sessionToken } = body ?? {};

    if (!userId || !sessionToken) {
      return Response.json({ error: "userId and sessionToken are required" }, { status: 400 });
    }

    const { supabaseUrl, serviceKey, anonKey } = getConfig();

    if (!serviceKey) {
      return Response.json(
        { code: "admin_not_configured", error: "SUPABASE_SERVICE_ROLE_KEY not set" },
        { status: 503 }
      );
    }

    // A user can only ever delete themselves — the verified session's own
    // id must match the account being deleted, same as every other
    // privileged route in this app (see profile-photo+api.ts).
    const valid = await verifySession(supabaseUrl, anonKey, sessionToken, userId);
    if (!valid) {
      return Response.json({ error: "Invalid session" }, { status: 401 });
    }

    const deleteRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    });

    if (!deleteRes.ok) {
      const text = await deleteRes.text().catch(() => "");
      console.error("[api/delete-account] Supabase admin delete failed:", deleteRes.status, text);
      return Response.json({ error: "Could not delete account" }, { status: 500 });
    }

    return Response.json({ deleted: true });
  } catch (error) {
    console.error("[api/delete-account] Error:", error);
    return Response.json({ error: "Could not delete account" }, { status: 500 });
  }
}
