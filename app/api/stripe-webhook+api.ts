/**
 * Stripe webhook endpoint. Register this route's URL
 * (https://<your-deployment>/api/stripe-webhook) in the Stripe Dashboard
 * under Developers → Webhooks, subscribed at minimum to `account.updated`.
 *
 * Signature-verified using lib/stripe-webhook-verify.ts (Web Crypto, not
 * Node's `crypto` or the `stripe` npm package's default verifier) so this
 * stays compatible with EAS Hosting's Cloudflare Workers runtime.
 *
 * Currently handles:
 * - account.updated: keeps a mechanic's Connect status (details_submitted /
 *   charges_enabled / payouts_enabled) in sync on user_profiles. This is the
 *   authoritative path — connect-account-status+api.ts also refreshes this
 *   opportunistically when the mechanic reopens the app, but the webhook is
 *   what keeps it correct even if they never do (e.g. Stripe approves the
 *   account hours after they closed the onboarding flow).
 *
 * Unrecognized event types are acknowledged with 200 and ignored — Stripe
 * retries on any non-2xx response, so returning 200 for events we don't (yet)
 * act on avoids pointless retry storms.
 */
import { getNotificationServiceConfig, supabaseRest } from "@/lib/notification-service";
import { verifyStripeWebhookSignature } from "@/lib/stripe-webhook-verify";

type StripeAccountUpdatedEvent = {
  id: string;
  type: string;
  data: {
    object: {
      id: string;
      details_submitted?: boolean;
      charges_enabled?: boolean;
      payouts_enabled?: boolean;
    };
  };
};

function getWebhookSecret(): string {
  return process.env.STRIPE_WEBHOOK_SECRET || "";
}

async function handleAccountUpdated(event: StripeAccountUpdatedEvent, serviceKey: string): Promise<void> {
  const account = event.data.object;
  if (!account?.id) return;

  const updated = await supabaseRest(
    `/user_profiles?stripe_connect_account_id=eq.${encodeURIComponent(account.id)}`,
    "PATCH",
    serviceKey,
    {
      stripe_connect_details_submitted: Boolean(account.details_submitted),
      stripe_connect_charges_enabled: Boolean(account.charges_enabled),
      stripe_connect_payouts_enabled: Boolean(account.payouts_enabled),
      stripe_connect_updated_at: new Date().toISOString(),
    },
  ).catch((error) => {
    console.error("[stripe-webhook] Failed to update account status:", error);
    return null;
  });

  if (!Array.isArray(updated) || updated.length === 0) {
    // No matching profile — most likely a stale/test account or a race with
    // the profile row not having stripe_connect_account_id saved yet. Not
    // fatal: connect-account-status+api.ts will reconcile this on the
    // mechanic's next app open.
    console.warn("[stripe-webhook] account.updated for unknown account:", account.id);
  }
}

export async function POST(request: Request) {
  const webhookSecret = getWebhookSecret();
  const { serviceKey } = getNotificationServiceConfig();

  if (!webhookSecret) {
    return Response.json({ error: "STRIPE_WEBHOOK_SECRET is not configured" }, { status: 503 });
  }
  if (!serviceKey) {
    return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured" }, { status: 503 });
  }

  // Signature verification requires the exact raw request body — must read
  // it as text before any JSON parsing.
  const rawBody = await request.text();
  const signatureHeader = request.headers.get("stripe-signature");

  const verification = await verifyStripeWebhookSignature(rawBody, signatureHeader, webhookSecret);
  if (!verification.ok) {
    console.warn("[stripe-webhook] Signature verification failed:", verification.reason);
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: StripeAccountUpdatedEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  try {
    if (event.type === "account.updated") {
      await handleAccountUpdated(event, serviceKey);
    }
    // Other event types: acknowledged, no action taken (see file header).
  } catch (error) {
    console.error("[stripe-webhook] Handler error:", error);
    // Still 200 — Stripe will retry a 5xx, and this failure is already
    // logged for follow-up. Returning 500 here just adds retry noise for
    // errors that a retry won't fix (e.g. a bug), while errors that WOULD be
    // fixed by a retry (e.g. Supabase blip) are self-healed by the next
    // webhook delivery or the status-check route anyway.
  }

  return Response.json({ received: true });
}
