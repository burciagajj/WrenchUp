import {
  validatePaymentIntentSnapshot,
  type StripeIntentSnapshot,
} from "@/lib/payment-verification-core";

function getConfig() {
  return {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL || "",
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "",
    stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
  };
}

function getBearerToken(request: Request): string | null {
  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return token.length > 0 ? token : null;
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

function parseAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.floor(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.floor(parsed);
  }
  return null;
}

function parseCurrency(value: unknown): string | null {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return normalized === "usd" || normalized === "mxn" ? normalized : null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const sessionToken = getBearerToken(request);
    const paymentIntentId = typeof body?.paymentIntentId === "string" ? body.paymentIntentId.trim() : "";
    const amount = parseAmount(body?.amount);
    const currency = parseCurrency(body?.currency);

    if (!sessionToken || !paymentIntentId || !amount || !currency) {
      return Response.json({ error: "paymentIntentId, amount, currency, and authorization are required" }, { status: 400 });
    }

    const { supabaseUrl, supabaseAnonKey, stripeSecretKey } = getConfig();
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

    const stripeRes = await fetch(
      `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(paymentIntentId)}`,
      { headers: { Authorization: `Bearer ${stripeSecretKey}` } },
    );
    const data = await stripeRes.json().catch(() => ({}));
    if (!stripeRes.ok) {
      console.error("[payment-verify] Stripe lookup failed", {
        status: stripeRes.status,
        paymentIntentId,
        userId: currentUser.id,
      });
      return Response.json({ error: data?.error?.message || "Payment verification failed" }, { status: 400 });
    }

    const snapshot: StripeIntentSnapshot = {
      id: String(data?.id || ""),
      amount: typeof data?.amount === "number" ? data.amount : null,
      currency: typeof data?.currency === "string" ? data.currency : null,
      status: typeof data?.status === "string" ? data.status : null,
      userId: typeof data?.metadata?.user_id === "string" ? data.metadata.user_id : null,
    };
    const verified = validatePaymentIntentSnapshot(snapshot, {
      paymentIntentId,
      amount,
      currency,
      userId: currentUser.id,
    });
    if (!verified.ok) {
      console.error("[payment-verify] Payment rejected before dispatch", {
        reason: verified.reason,
        status: snapshot.status,
        paymentIntentId,
        userId: currentUser.id,
      });
      return Response.json({ error: verified.reason }, { status: 400 });
    }

    return Response.json({ data: { verified: true, paymentIntentId, status: snapshot.status } });
  } catch (error) {
    console.error("[payment-verify] Error:", error);
    return Response.json({ error: "Payment verification failed" }, { status: 500 });
  }
}
