/**
 * Returns a one-time link to the calling mechanic's Stripe Express dashboard,
 * where they can change their bank account / debit card, personal details and
 * see their payouts. Only works once onboarding details have been submitted
 * (Stripe rejects login links for unfinished accounts); mechanics who haven't
 * finished get the onboarding link from connect-account-link instead.
 *
 * Like the other connect routes, this only ever operates on the calling
 * user's own profile row.
 */
import { getNotificationServiceConfig, supabaseRest } from "@/lib/notification-service";

type ProfileRow = {
  user_id: string;
  role: string | null;
  stripe_connect_account_id: string | null;
};

async function verifySession(
  supabaseUrl: string,
  anonKey: string,
  sessionToken: string,
): Promise<{ id: string } | null> {
  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${sessionToken}` },
  });
  if (!res.ok) return null;
  const user = await res.json().catch(() => null);
  return user?.id ? { id: String(user.id) } : null;
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const sessionToken = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
    if (!sessionToken) {
      return Response.json({ error: "Authorization is required" }, { status: 400 });
    }

    const { supabaseUrl, serviceKey } = getNotificationServiceConfig();
    const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY || "";
    if (!supabaseUrl || !supabaseAnonKey || !serviceKey) {
      return Response.json({ error: "Supabase is not configured" }, { status: 503 });
    }
    if (!stripeSecretKey) {
      return Response.json({ error: "Stripe secret key is not configured" }, { status: 503 });
    }

    const currentUser = await verifySession(supabaseUrl, supabaseAnonKey, sessionToken);
    if (!currentUser) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const profiles = await supabaseRest<ProfileRow[]>(
      `/user_profiles?user_id=eq.${encodeURIComponent(currentUser.id)}&select=user_id,role,stripe_connect_account_id&limit=1`,
      "GET",
      serviceKey,
    ).catch(() => null);
    const profile = Array.isArray(profiles) ? profiles[0] : null;
    if (!profile || profile.role !== "mechanic") {
      return Response.json({ error: "Only mechanic accounts can manage payouts" }, { status: 403 });
    }
    if (!profile.stripe_connect_account_id) {
      return Response.json({ error: "Set up payouts first" }, { status: 400 });
    }

    const res = await fetch(
      `https://api.stripe.com/v1/accounts/${encodeURIComponent(profile.stripe_connect_account_id)}/login_links`,
      { method: "POST", headers: { Authorization: `Bearer ${stripeSecretKey}` } },
    );
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.url) {
      const message = (data?.error as { message?: string } | undefined)?.message;
      return Response.json({ error: message || "Could not open payout settings" }, { status: 500 });
    }

    return Response.json({ url: data.url });
  } catch (error) {
    console.error("[connect-dashboard-link] Error:", error);
    return Response.json({ error: "Could not open payout settings" }, { status: 500 });
  }
}
