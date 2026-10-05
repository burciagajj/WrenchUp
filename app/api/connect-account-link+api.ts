/**
 * Creates (if needed) a Stripe Express connected account for the calling
 * mechanic and returns a Stripe-hosted onboarding URL (an Account Link).
 *
 * Called from the mechanic app's "Set up payouts" screen. Requires the
 * mechanic's own session (Authorization: Bearer <token>) — this route only
 * ever operates on the calling user's own profile row, never an arbitrary
 * user_id from the request body, so a mechanic can't onboard payouts for
 * someone else's account.
 *
 * Uses raw fetch against Stripe's REST API (not the `stripe` npm package) to
 * stay compatible with EAS Hosting's Cloudflare Workers runtime, matching the
 * pattern already used in payment-intent+api.ts and payment-capture-sweep+api.ts.
 */
import { getNotificationServiceConfig, supabaseRest } from "@/lib/notification-service";

type ProfileRow = {
  user_id: string;
  role: string | null;
  email: string | null;
  full_name: string | null;
  stripe_connect_account_id: string | null;
};

const BUSINESS_DESCRIPTION =
  "Mobile auto repair and maintenance services (oil changes, brakes, batteries, diagnostics) booked through the WrenchUp app.";

function getStripeSecretKey(): string {
  return process.env.STRIPE_SECRET_KEY || "";
}

async function verifySession(
  supabaseUrl: string,
  anonKey: string,
  sessionToken: string,
): Promise<{ id: string; email: string | null } | null> {
  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${sessionToken}` },
  });
  if (!res.ok) return null;
  const user = await res.json().catch(() => null);
  return user?.id ? { id: String(user.id), email: typeof user.email === "string" ? user.email : null } : null;
}

async function stripeRequest(
  path: string,
  stripeSecretKey: string,
  params: URLSearchParams,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  const text = await res.text();
  let data: Record<string, unknown> | null = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const message =
      (data?.error as { message?: string } | undefined)?.message || `Stripe request failed (${res.status})`;
    return { ok: false, error: message };
  }
  return { ok: true, data: data ?? {} };
}

// Public https origin of this deployment, which Stripe will redirect back to.
// Falls back to the production host if the runtime reports a non-https URL
// (some hosting layers hand routes an internal http URL).
function publicOrigin(request: Request): string {
  try {
    const url = new URL(request.url);
    if (url.protocol === "https:") return url.origin;
  } catch {
    // fall through
  }
  return "https://wrenchup.expo.app";
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const authHeader = request.headers.get("authorization") || "";
    const sessionToken = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
    // Live-mode Account Links only accept https URLs, so a client-supplied
    // app deep link (what older app builds still send in `body`) is rejected
    // by Stripe with "Not a valid URL". We use our own https landing page
    // (app/api/connect-return+api.ts) instead, which hands the mechanic back
    // into the app, and ignore whatever the client sent — which also means a
    // caller can't point Stripe's redirect at an arbitrary URL.
    void body;
    const origin = publicOrigin(request);
    const returnUrl = `${origin}/api/connect-return?result=return`;
    const refreshUrl = `${origin}/api/connect-return?result=refresh`;

    if (!sessionToken) {
      return Response.json({ error: "Authorization is required" }, { status: 400 });
    }

    const { supabaseUrl, serviceKey } = getNotificationServiceConfig();
    const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";
    const stripeSecretKey = getStripeSecretKey();
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
      `/user_profiles?user_id=eq.${encodeURIComponent(currentUser.id)}&select=user_id,role,email,full_name,stripe_connect_account_id&limit=1`,
      "GET",
      serviceKey,
    ).catch(() => null);
    const profile = Array.isArray(profiles) ? profiles[0] : null;
    if (!profile || profile.role !== "mechanic") {
      return Response.json({ error: "Only mechanic accounts can set up payouts" }, { status: 403 });
    }

    let accountId = profile.stripe_connect_account_id;

    if (!accountId) {
      const params = new URLSearchParams();
      params.set("type", "express");
      params.set("capabilities[transfers][requested]", "true");
      params.set("business_type", "individual");
      if (profile.email || currentUser.email) params.set("email", profile.email || currentUser.email || "");
      params.set("metadata[user_id]", currentUser.id);
      params.set("metadata[source]", "wrenchup");
      // Individual mechanics don't have a website; prefilling the business
      // profile keeps Stripe's onboarding from asking for one.
      params.set("business_profile[mcc]", "7538");
      params.set("business_profile[product_description]", BUSINESS_DESCRIPTION);

      const created = await stripeRequest("accounts", stripeSecretKey, params);
      if (!created.ok) {
        return Response.json({ error: created.error }, { status: 500 });
      }
      accountId = String(created.data.id || "");
      if (!accountId) {
        return Response.json({ error: "Stripe did not return an account id" }, { status: 500 });
      }

      await supabaseRest(
        `/user_profiles?user_id=eq.${encodeURIComponent(currentUser.id)}`,
        "PATCH",
        serviceKey,
        { stripe_connect_account_id: accountId, stripe_connect_updated_at: new Date().toISOString() },
      ).catch((error) => {
        console.error("[connect-account-link] Failed to save account id:", error);
      });
    }

    else {
      // Existing accounts created before the prefill: best-effort backfill so
      // the website question goes away. Ignore failures (e.g. fields locked).
      const backfill = new URLSearchParams();
      backfill.set("business_profile[mcc]", "7538");
      backfill.set("business_profile[product_description]", BUSINESS_DESCRIPTION);
      await stripeRequest(`accounts/${encodeURIComponent(accountId)}`, stripeSecretKey, backfill).catch(() => null);
    }

    const linkParams = new URLSearchParams();
    linkParams.set("account", accountId);
    linkParams.set("refresh_url", refreshUrl);
    linkParams.set("return_url", returnUrl);
    linkParams.set("type", "account_onboarding");

    const link = await stripeRequest("account_links", stripeSecretKey, linkParams);
    if (!link.ok) {
      return Response.json({ error: link.error }, { status: 500 });
    }

    return Response.json({ url: link.data.url, accountId });
  } catch (error) {
    console.error("[connect-account-link] Error:", error);
    return Response.json({ error: "Could not start payout setup" }, { status: 500 });
  }
}
