/**
 * After PaymentSheet's setup mode succeeds client-side, the client only knows
 * "it worked" — not which card was actually saved. This looks up the
 * SetupIntent created by setup-intent+api.ts, confirms it succeeded and
 * belongs to the calling user's own Stripe Customer (never trust a client-
 * supplied setupIntentId without checking ownership), then returns the
 * attached card's display details (brand/last4/expiry) for the UI.
 */
import { getNotificationServiceConfig, supabaseRest } from "@/lib/notification-service";

type ProfileRow = {
  user_id: string;
  stripe_customer_id: string | null;
};

function getStripeSecretKey(): string {
  return process.env.STRIPE_SECRET_KEY || "";
}

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

async function stripeGet(
  path: string,
  stripeSecretKey: string,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${stripeSecretKey}` },
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

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const authHeader = request.headers.get("authorization") || "";
    const sessionToken = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
    const setupIntentId = typeof body?.setupIntentId === "string" ? body.setupIntentId.trim() : "";

    if (!sessionToken || !setupIntentId) {
      return Response.json({ error: "setupIntentId and authorization are required" }, { status: 400 });
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
      `/user_profiles?user_id=eq.${encodeURIComponent(currentUser.id)}&select=user_id,stripe_customer_id&limit=1`,
      "GET",
      serviceKey,
    ).catch(() => null);
    const profile = Array.isArray(profiles) ? profiles[0] : null;
    if (!profile?.stripe_customer_id) {
      return Response.json({ error: "No billing profile found for this account" }, { status: 403 });
    }

    const setupIntent = await stripeGet(`setup_intents/${encodeURIComponent(setupIntentId)}`, stripeSecretKey);
    if (!setupIntent.ok) {
      return Response.json({ error: setupIntent.error }, { status: 500 });
    }

    // Ownership check: this setup intent must belong to the caller's own
    // Stripe Customer, never an id they guessed or copied from elsewhere.
    if (setupIntent.data.customer !== profile.stripe_customer_id) {
      return Response.json({ error: "This setup does not belong to your account" }, { status: 403 });
    }
    if (setupIntent.data.status !== "succeeded") {
      return Response.json({ error: `Card setup is not complete (status: ${setupIntent.data.status})` }, { status: 409 });
    }

    const paymentMethodId = setupIntent.data.payment_method;
    if (typeof paymentMethodId !== "string" || !paymentMethodId) {
      return Response.json({ error: "No payment method was attached" }, { status: 500 });
    }

    const paymentMethod = await stripeGet(`payment_methods/${encodeURIComponent(paymentMethodId)}`, stripeSecretKey);
    if (!paymentMethod.ok) {
      return Response.json({ error: paymentMethod.error }, { status: 500 });
    }

    const card = paymentMethod.data.card as
      | { brand?: string; last4?: string; exp_month?: number; exp_year?: number }
      | undefined;
    if (!card) {
      return Response.json({ error: "Saved payment method is not a card" }, { status: 500 });
    }

    return Response.json({
      paymentMethodId,
      card: {
        brand: card.brand || "card",
        last4: card.last4 || "",
        expMonth: card.exp_month || 0,
        expYear: card.exp_year || 0,
      },
    });
  } catch (error) {
    console.error("[setup-intent-confirm] Error:", error);
    return Response.json({ error: "Could not confirm saved card" }, { status: 500 });
  }
}
