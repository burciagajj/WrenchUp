/**
 * Checks (and refreshes) the calling mechanic's Stripe Connect onboarding
 * status. Called right after the mechanic returns from Stripe's hosted
 * onboarding flow, so the app can show up-to-date status immediately rather
 * than waiting for the account.updated webhook to land.
 *
 * Like connect-account-link+api.ts, this only ever reads/writes the calling
 * user's own profile row.
 */
import { getNotificationServiceConfig, supabaseRest } from "@/lib/notification-service";

type ProfileRow = {
  user_id: string;
  role: string | null;
  stripe_connect_account_id: string | null;
  stripe_connect_details_submitted: boolean;
  stripe_connect_charges_enabled: boolean;
  stripe_connect_payouts_enabled: boolean;
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
      return Response.json({ error: "authorization is required" }, { status: 400 });
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
      `/user_profiles?user_id=eq.${encodeURIComponent(currentUser.id)}&select=user_id,role,stripe_connect_account_id,stripe_connect_details_submitted,stripe_connect_charges_enabled,stripe_connect_payouts_enabled&limit=1`,
      "GET",
      serviceKey,
    ).catch(() => null);
    const profile = Array.isArray(profiles) ? profiles[0] : null;

    if (!profile || !profile.stripe_connect_account_id) {
      return Response.json({
        data: {
          accountId: null,
          detailsSubmitted: false,
          chargesEnabled: false,
          payoutsEnabled: false,
        },
      });
    }

    const res = await fetch(`https://api.stripe.com/v1/accounts/${encodeURIComponent(profile.stripe_connect_account_id)}`, {
      headers: { Authorization: `Bearer ${stripeSecretKey}` },
    });
    const account = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Fall back to whatever we last had cached rather than failing the
      // whole request — the webhook will catch up eventually.
      return Response.json({
        data: {
          accountId: profile.stripe_connect_account_id,
          detailsSubmitted: profile.stripe_connect_details_submitted,
          chargesEnabled: profile.stripe_connect_charges_enabled,
          payoutsEnabled: profile.stripe_connect_payouts_enabled,
        },
      });
    }

    const detailsSubmitted = Boolean(account?.details_submitted);
    const chargesEnabled = Boolean(account?.charges_enabled);
    const payoutsEnabled = Boolean(account?.payouts_enabled);

    await supabaseRest(
      `/user_profiles?user_id=eq.${encodeURIComponent(currentUser.id)}`,
      "PATCH",
      serviceKey,
      {
        stripe_connect_details_submitted: detailsSubmitted,
        stripe_connect_charges_enabled: chargesEnabled,
        stripe_connect_payouts_enabled: payoutsEnabled,
        stripe_connect_updated_at: new Date().toISOString(),
      },
    ).catch((error) => {
      console.error("[connect-account-status] Failed to save refreshed status:", error);
    });

    return Response.json({
      data: {
        accountId: profile.stripe_connect_account_id,
        detailsSubmitted,
        chargesEnabled,
        payoutsEnabled,
      },
    });
  } catch (error) {
    console.error("[connect-account-status] Error:", error);
    return Response.json({ error: "Could not check payout status" }, { status: 500 });
  }
}
