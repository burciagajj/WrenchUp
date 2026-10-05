import { isPriceWithinAdjustmentBounds } from "@/lib/price-adjustment-core";
import { toChargeableAmount } from "@/lib/i18n";

type StripeCurrency = "usd" | "mxn";

// Absolute sanity ceiling/floor (in cents) applied regardless of estimatedTotal,
// so a direct API call can't authorize an obviously-bogus amount even if it
// lies about the estimate too. Calibrated to this app's service price range
// ($29-$189 base price plus fees) with generous headroom.
const MIN_AMOUNT_USD_CENTS = 500; // $5
const MAX_AMOUNT_USD_CENTS = 75000; // $750

// MXN bookings are charged in real pesos (discount + exchange rate applied —
// see lib/i18n.ts's toChargeableAmount), which is a completely different
// numeric scale than USD cents. Reusing the USD bounds directly here would
// either reject every legitimate MXN charge (if too low) or let through an
// amount many times too large (if left as raw USD-scale cents) — derive the
// MXN bounds from the same conversion so they can't drift out of sync.
function getAmountBoundsCents(currency: StripeCurrency): { min: number; max: number } {
  if (currency === "mxn") {
    return {
      min: Math.round(toChargeableAmount(MIN_AMOUNT_USD_CENTS / 100, "MX") * 100),
      max: Math.round(toChargeableAmount(MAX_AMOUNT_USD_CENTS / 100, "MX") * 100),
    };
  }
  return { min: MIN_AMOUNT_USD_CENTS, max: MAX_AMOUNT_USD_CENTS };
}

function getConfig() {
  return {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL || "",
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "",
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
  };
}

type ProfileRow = { user_id: string; email: string | null; full_name: string | null; stripe_customer_id: string | null };

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

/**
 * Gets (or lazily creates) the caller's Stripe Customer, then mints a fresh
 * Ephemeral Key for it. Both are required for PaymentSheet to know about —
 * and let the customer reuse — their saved cards; without a customer id on
 * the PaymentIntent and this key passed to initPaymentSheet, the sheet has
 * no way to look up any saved payment method and always presents blank,
 * regardless of what a customer picks in the app's own card-selector UI.
 * Mirrors the identical get-or-create logic in setup-intent+api.ts.
 */
async function getCustomerAndEphemeralKey(
  supabaseUrl: string,
  serviceKey: string,
  stripeSecretKey: string,
  userId: string,
  userEmail?: string,
): Promise<{ ok: true; customerId: string; ephemeralKeySecret: string } | { ok: false; error: string }> {
  const profiles = await supabaseRestGet<ProfileRow[]>(
    supabaseUrl,
    serviceKey,
    `/user_profiles?user_id=eq.${encodeURIComponent(userId)}&select=user_id,email,full_name,stripe_customer_id&limit=1`,
  ).catch(() => null);
  const profile = Array.isArray(profiles) ? profiles[0] : null;

  let customerId = profile?.stripe_customer_id || null;
  if (!customerId) {
    const params = new URLSearchParams();
    const email = profile?.email || userEmail;
    if (email) params.set("email", email);
    if (profile?.full_name) params.set("name", profile.full_name);
    params.set("metadata[user_id]", userId);
    params.set("metadata[source]", "wrenchup");

    const created = await stripeRequest("customers", stripeSecretKey, params);
    if (!created.ok) return { ok: false, error: created.error };
    customerId = String(created.data.id || "");
    if (!customerId) return { ok: false, error: "Stripe did not return a customer id" };

    await fetch(`${supabaseUrl}/rest/v1/user_profiles?user_id=eq.${encodeURIComponent(userId)}`, {
      method: "PATCH",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ stripe_customer_id: customerId }),
    }).catch((error) => console.error("[payment-intent] Failed to save customer id:", error));
  }

  const ephemeralKeyParams = new URLSearchParams();
  ephemeralKeyParams.set("customer", customerId);
  const ephemeralKey = await stripeRequest("ephemeral_keys", stripeSecretKey, ephemeralKeyParams, {
    "Stripe-Version": "2024-06-20",
  });
  if (!ephemeralKey.ok) return { ok: false, error: ephemeralKey.error };
  const ephemeralKeySecret = String(ephemeralKey.data.secret || "");
  if (!ephemeralKeySecret) return { ok: false, error: "Stripe did not return an ephemeral key" };

  return { ok: true, customerId, ephemeralKeySecret };
}

async function supabaseRestGet<T>(supabaseUrl: string, serviceKey: string, path: string): Promise<T | null> {
  const res = await fetch(`${supabaseUrl}/rest/v1${path}`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
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

// Real-money safety gate: while the app is first opening up to real
// customers, nobody should be able to authorize a real charge until their
// account has been manually approved (avatar_status). This is the actual
// enforcement point — the client also checks this for UX, but a client
// check alone can't stop a modified/direct API call, and this route is
// where a real Stripe charge is authorized, so this is where it must be
// enforced. RLS scopes the query to the caller's own row (Authorization is
// the user's own session token, not the anon key alone).
async function isCustomerApproved(
  supabaseUrl: string,
  anonKey: string,
  sessionToken: string,
  userId: string,
): Promise<boolean> {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/user_profiles?user_id=eq.${encodeURIComponent(userId)}&select=avatar_status`,
    { headers: { apikey: anonKey, Authorization: `Bearer ${sessionToken}` } },
  );
  if (!res.ok) return false;
  const rows = await res.json().catch(() => null);
  const row = Array.isArray(rows) ? rows[0] : null;
  return row?.avatar_status === "approved";
}

function parseAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(value);
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.floor(parsed);
  }
  return null;
}

function parseCurrency(value: unknown): StripeCurrency | null {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "usd" || normalized === "mxn") return normalized;
  return null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const authHeader = request.headers.get("authorization") || "";
    const sessionToken = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
    const amount = parseAmount(body?.amount);
    const estimatedTotal = parseAmount(body?.estimatedTotal);
    const currency = parseCurrency(body?.currency);
    const customerEmail = typeof body?.customerEmail === "string" ? body.customerEmail.trim() : "";

    if (!sessionToken || !amount || !currency) {
      return Response.json({ error: "amount, currency, and authorization are required" }, { status: 400 });
    }
    const { min: minAmountCents, max: maxAmountCents } = getAmountBoundsCents(currency);
    if (amount < minAmountCents || amount > maxAmountCents) {
      return Response.json({ error: "Amount is outside the allowed range" }, { status: 400 });
    }
    if (estimatedTotal && estimatedTotal > 0 && !isPriceWithinAdjustmentBounds(amount, estimatedTotal)) {
      return Response.json({ error: "Adjusted price is too far from the estimated fare" }, { status: 400 });
    }

    const { supabaseUrl, supabaseAnonKey, serviceKey, stripeSecretKey } = getConfig();
    if (!supabaseUrl || !supabaseAnonKey) {
      return Response.json({ error: "Supabase is not configured" }, { status: 503 });
    }
    if (!stripeSecretKey) {
      return Response.json({ error: "Stripe secret key is not configured" }, { status: 503 });
    }

    const currentUser = await verifySession(supabaseUrl, supabaseAnonKey, sessionToken);
    if (!currentUser) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const approved = await isCustomerApproved(supabaseUrl, supabaseAnonKey, sessionToken, currentUser.id);
    if (!approved) {
      return Response.json(
        { error: "Your account is still pending approval. You'll be able to book once it's approved." },
        { status: 403 },
      );
    }

    if (!serviceKey) {
      return Response.json({ error: "Supabase service key is not configured" }, { status: 503 });
    }
    const customerResult = await getCustomerAndEphemeralKey(
      supabaseUrl,
      serviceKey,
      stripeSecretKey,
      currentUser.id,
      customerEmail || undefined,
    );
    if (!customerResult.ok) {
      return Response.json({ error: customerResult.error }, { status: 500 });
    }
    const { customerId, ephemeralKeySecret } = customerResult;

    const params = new URLSearchParams();
    params.set("amount", String(amount));
    params.set("currency", currency);
    params.set("capture_method", "manual");
    // Card only, not "automatic" — this app's whole payment-methods UI and
    // downstream handling (setup-intent-confirm+api.ts, refunds, receipts)
    // only understands card PaymentMethods (brand/last4/expiry). Automatic
    // payment methods pulls in whatever's enabled in the Stripe Dashboard for
    // the active mode (e.g. Cash App Pay), which this app has no model for —
    // restricting explicitly avoids PaymentSheet ever offering one.
    params.set("payment_method_types[]", "card");
    // Attaching the customer is what lets PaymentSheet (with the ephemeral
    // key returned below) show and reuse this customer's saved cards instead
    // of always presenting a blank "add card" form.
    params.set("customer", customerId);
    params.set("description", "WrenchUp roadside assistance booking");
    params.set("metadata[user_id]", currentUser.id);
    params.set("metadata[source]", "wrenchup");
    if (customerEmail) {
      params.set("receipt_email", customerEmail);
      params.set("metadata[customer_email]", customerEmail);
    }

    const stripeRes = await fetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const text = await stripeRes.text();
    let data:
      | {
          id?: string;
          client_secret?: string;
          amount?: number;
          currency?: string;
          status?: string;
          error?: { message?: string };
          message?: string;
        }
      | null = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { error: { message: text } };
      }
    }

    if (!stripeRes.ok) {
      const message = data?.error?.message || data?.message || `Stripe request failed (${stripeRes.status})`;
      return Response.json({ error: message }, { status: 500 });
    }

    return Response.json({
      paymentIntentId: data?.id,
      clientSecret: data?.client_secret,
      amount: data?.amount,
      currency: data?.currency,
      status: data?.status,
      customerId,
      ephemeralKeySecret,
    });
  } catch (error) {
    console.error("[payment-intent] Error:", error);
    return Response.json({ error: "Payment intent creation failed" }, { status: 500 });
  }
}
