import {
  buildMechanicPresencePayload,
  canMechanicGoOnline,
} from "@/lib/mechanic-presence-core";
import {
  getCurrentUserId,
  getNotificationServiceConfig,
  supabaseRest,
} from "@/lib/notification-service";

type PresenceRow = {
  mechanic_user_id: string;
  mechanic_name: string | null;
  is_online: boolean;
  region_code?: "US" | "MX" | null;
  updated_at?: string;
};

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const sessionToken = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
    if (!sessionToken) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const isOnline = Boolean(body?.isOnline);
    const mechanicName = String(body?.mechanicName || "Mechanic").trim() || "Mechanic";
    const regionCode = body?.regionCode === "MX" ? "MX" : body?.regionCode === "US" ? "US" : undefined;

    const { supabaseUrl, serviceKey } = getNotificationServiceConfig();
    if (!supabaseUrl || !serviceKey) {
      return Response.json({ error: "Presence service unavailable" }, { status: 503 });
    }

    const userId = await getCurrentUserId(supabaseUrl, serviceKey, sessionToken);
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const profileRows = await supabaseRest<
      { role?: string | null; verification_status?: string | null }[]
    >(
      `/user_profiles?user_id=eq.${encodeURIComponent(userId)}&select=role,verification_status&limit=1`,
      "GET",
      serviceKey,
    );
    const profile = Array.isArray(profileRows) ? profileRows[0] : null;
    if (!profile || profile.role !== "mechanic") {
      return Response.json({ error: "Only mechanic accounts can update presence." }, { status: 403 });
    }

    if (isOnline && !canMechanicGoOnline(profile).ok) {
      return Response.json({ error: "Mechanic verification must be approved before going online." }, { status: 403 });
    }

    const payload = buildMechanicPresencePayload({ isOnline, mechanicName, regionCode });
    const withUserId = { mechanic_user_id: userId, ...payload };

    let row: PresenceRow | null = null;
    try {
      const updated = await supabaseRest<PresenceRow[]>(
        `/mechanic_presence?mechanic_user_id=eq.${encodeURIComponent(userId)}`,
        "PATCH",
        serviceKey,
        payload,
      );
      if (Array.isArray(updated) && updated.length > 0) {
        row = updated[0];
      }
    } catch {
      // fall through to insert
    }

    if (!row) {
      const created = await supabaseRest<PresenceRow | PresenceRow[]>(
        "/mechanic_presence",
        "POST",
        serviceKey,
        withUserId,
      );
      row = Array.isArray(created) ? created[0] ?? null : created;
    }

    if (!row) {
      return Response.json({ error: "Could not update mechanic presence." }, { status: 500 });
    }

    return Response.json({ ok: true, presence: row });
  } catch (error) {
    console.error("[mechanic-presence] Failed:", error);
    return Response.json({ error: "Could not update mechanic presence." }, { status: 500 });
  }
}
