import { getCurrentUserId, getNotificationServiceConfig, supabaseRest } from "@/lib/notification-service";
import { maxPartsCostForRegion } from "@/lib/price-adjustment-core";
import type { RegionCode } from "@/lib/types";

type StripeCurrency = "usd" | "mxn";

function getStripeKey() {
  return process.env.STRIPE_SECRET_KEY || "";
}

// Creates the customer's authorization hold for a mechanic-proposed parts
// reimbursement — a SEPARATE PaymentIntent from the job's own hold (see
// app/api/payment-intent+api.ts), not an increase to it. Stripe's "increase
// an existing hold" (incremental authorization) requires opt-in at original
// booking time and isn't supported by every card/issuer, which would make
// this feature silently unreliable for some customers — a second,
// independent hold works on any card.
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const sessionToken = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
    if (!sessionToken) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const requestId = typeof body?.requestId === "string" ? body.requestId.trim() : "";
    if (!requestId) {
      return Response.json({ error: "requestId is required" }, { status: 400 });
    }

    const { supabaseUrl, serviceKey } = getNotificationServiceConfig();
    if (!supabaseUrl || !serviceKey) {
      return Response.json({ error: "Service unavailable" }, { status: 503 });
    }
    const stripeSecretKey = getStripeKey();
    if (!stripeSecretKey) {
      return Response.json({ error: "Stripe secret key is not configured" }, { status: 503 });
    }

    const currentUserId = await getCurrentUserId(supabaseUrl, serviceKey, sessionToken);
    if (!currentUserId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rows = await supabaseRest<{
      id: string;
      customer_user_id: string;
      currency: string;
      region_code: RegionCode | null;
      parts_cost: number | null;
      parts_payment_status: string | null;
    }[]>(
      `/service_requests?id=eq.${encodeURIComponent(requestId)}&select=id,customer_user_id,currency,region_code,parts_cost,parts_payment_status`,
      "GET",
      serviceKey,
    );
    const dispatchRequest = Array.isArray(rows) ? rows[0] : null;
    if (!dispatchRequest) {
      return Response.json({ error: "Request not found" }, { status: 404 });
    }

    // Only the request's own customer may authorize a hold on their own
    // card — mirrors the ownership check in dispatch-notify+api.ts /
    // chat-notify+api.ts.
    if (currentUserId !== dispatchRequest.customer_user_id) {
      return Response.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Never trust a client-supplied amount — read what the mechanic actually
    // proposed straight from the DB, and require it to still be in the
    // "proposed" state (can't re-authorize something already authorized,
    // captured, or declined).
    if (dispatchRequest.parts_payment_status !== "proposed") {
      return Response.json({ error: "No pending parts cost to authorize for this request" }, { status: 409 });
    }
    const partsCost = dispatchRequest.parts_cost;
    const region: RegionCode = dispatchRequest.region_code === "MX" ? "MX" : "US";
    // Same helper the client uses, so both checks agree — a straight FX
    // conversion of the USD cap, no promo discount (this is an abuse ceiling,
    // not a price). parts_cost is stored in the request's real charge
    // currency (pesos for MX), so the cap must be too.
    const maxPartsCost = maxPartsCostForRegion(region);
    if (typeof partsCost !== "number" || !Number.isFinite(partsCost) || partsCost <= 0 || partsCost > maxPartsCost) {
      return Response.json({ error: "Parts cost is invalid or out of range" }, { status: 400 });
    }

    const currency: StripeCurrency = dispatchRequest.currency?.toLowerCase() === "mxn" ? "mxn" : "usd";
    const amountCents = Math.round(partsCost * 100);

    const params = new URLSearchParams();
    params.set("amount", String(amountCents));
    params.set("currency", currency);
    params.set("capture_method", "manual");
    // Card only — see the matching comment in payment-intent+api.ts.
    params.set("payment_method_types[]", "card");
    params.set("description", "WrenchUp parts reimbursement");
    params.set("metadata[request_id]", requestId);
    params.set("metadata[purpose]", "parts_reimbursement");
    params.set("metadata[user_id]", currentUserId);

    const stripeRes = await fetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const text = await stripeRes.text();
    let data: { id?: string; client_secret?: string; error?: { message?: string }; message?: string } | null = null;
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

    // Record the PaymentIntent id now (status stays "proposed" — it only
    // flips to "authorized" once the client reports the PaymentSheet
    // actually completed, see confirmPartsPaymentAuthorized) so a retry
    // after a dropped connection doesn't orphan an unreferenced Stripe hold.
    await supabaseRest(
      `/service_requests?id=eq.${encodeURIComponent(requestId)}`,
      "PATCH",
      serviceKey,
      { parts_payment_intent_id: data?.id ?? null },
    ).catch(() => {});

    return Response.json({ paymentIntentId: data?.id, clientSecret: data?.client_secret });
  } catch (error) {
    console.error("[parts-payment-intent] Error:", error);
    return Response.json({ error: "Parts payment intent creation failed" }, { status: 500 });
  }
}
