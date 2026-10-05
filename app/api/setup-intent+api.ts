/**
 * Creates (if needed) a Stripe Customer for the calling user and returns a
 * SetupIntent + ephemeral key so the client can collect and save a real card
 * via PaymentSheet's setup mode — no charge, just attaching a payment method
 * to the customer for reuse later.
 *
 * Mirrors connect-account-link+api.ts's find-or-create pattern, but for the
 * customer-side billing identity (stripe_customer_id) rather than the
 * mechanic-side Connect account (stripe_connect_account_id) — every user can
 * have both; they're unrelated Stripe objects.
 */
import { getNotificationServiceConfig, supabaseRest } from "@/lib/notification-service";

type ProfileRow = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  stripe_customer_id: string | null;
};

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
  extraHeaders?: Record<string, string>,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      ...extraHeaders,
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

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const sessionToken = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
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
      `/user_profiles?user_id=eq.${encodeURIComponent(currentUser.id)}&select=user_id,email,full_name,stripe_customer_id&limit=1`,
      "GET",
      serviceKey,
    ).catch(() => null);
    const profile = Array.isArray(profiles) ? profiles[0] : null;

    let customerId = profile?.stripe_customer_id || null;

    if (!customerId) {
      const params = new URLSearchParams();
      const email = profile?.email || currentUser.email;
      if (email) params.set("email", email);
      if (profile?.full_name) params.set("name", profile.full_name);
      params.set("metadata[user_id]", currentUser.id);
      params.set("metadata[source]", "wrenchup");

      const created = await stripeRequest("customers", stripeSecretKey, params);
      if (!created.ok) {
        return Response.json({ error: created.error }, { status: 500 });
      }
      customerId = String(created.data.id || "");
      if (!customerId) {
        return Response.json({ error: "Stripe did not return a customer id" }, { status: 500 });
      }

      await supabaseRest(
        `/user_profiles?user_id=eq.${encodeURIComponent(currentUser.id)}`,
        "PATCH",
        serviceKey,
        { stripe_customer_id: customerId },
      ).catch((error) => {
        console.error("[setup-intent] Failed to save customer id:", error);
      });
    }

    const ephemeralKeyParams = new URLSearchParams();
    ephemeralKeyParams.set("customer", customerId);
    const ephemeralKey = await stripeRequest("ephemeral_keys", stripeSecretKey, ephemeralKeyParams, {
      "Stripe-Version": "2024-06-20",
    });
    if (!ephemeralKey.ok) {
      return Response.json({ error: ephemeralKey.error }, { status: 500 });
    }

    const setupIntentParams = new URLSearchParams();
    setupIntentParams.set("customer", customerId);
    // Card only — see the matching comment in payment-intent+api.ts. This
    // route in particular MUST stay card-only: setup-intent-confirm+api.ts
    // reads back `payment_method.card` and rejects anything else.
    setupIntentParams.set("payment_method_types[]", "card");
    setupIntentParams.set("metadata[user_id]", currentUser.id);
    setupIntentParams.set("metadata[source]", "wrenchup");

    const setupIntent = await stripeRequest("setup_intents", stripeSecretKey, setupIntentParams);
    if (!setupIntent.ok) {
      return Response.json({ error: setupIntent.error }, { status: 500 });
    }

    return Response.json({
      setupIntentId: setupIntent.data.id,
      setupIntentClientSecret: setupIntent.data.client_secret,
      ephemeralKeySecret: ephemeralKey.data.secret,
      customerId,
    });
  } catch (error) {
    console.error("[setup-intent] Error:", error);
    return Response.json({ error: "Could not start card setup" }, { status: 500 });
  }
}
