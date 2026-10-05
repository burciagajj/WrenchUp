/**
 * Verifies a Stripe webhook signature (the `Stripe-Signature` header) using
 * the Web Crypto API (crypto.subtle) rather than Node's `crypto` module or
 * the `stripe` npm package's default verifier. This keeps the webhook route
 * compatible with EAS Hosting's Cloudflare Workers runtime, which has only
 * partial Node.js compatibility but full Web Crypto support — same
 * constraint that's why the rest of this app's Stripe calls use raw fetch
 * instead of the `stripe` package (see lib/stripe.ts's file header).
 *
 * Implements Stripe's documented verification algorithm:
 * https://docs.stripe.com/webhooks#verify-manually
 */

const DEFAULT_TOLERANCE_SECONDS = 5 * 60;

export type WebhookVerifyResult =
  | { ok: true }
  | { ok: false; reason: "missing_header" | "malformed_header" | "timestamp_too_old" | "signature_mismatch" };

function parseSignatureHeader(header: string): { timestamp: string; signatures: string[] } | null {
  const parts = header.split(",").map((p) => p.trim());
  let timestamp = "";
  const signatures: string[] = [];
  for (const part of parts) {
    const [key, value] = part.split("=");
    if (key === "t" && value) timestamp = value;
    if (key === "v1" && value) signatures.push(value);
  }
  if (!timestamp || signatures.length === 0) return null;
  return { timestamp, signatures };
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time-ish string comparison to avoid trivial timing side channels. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function verifyStripeWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  webhookSecret: string,
  toleranceSeconds: number = DEFAULT_TOLERANCE_SECONDS,
): Promise<WebhookVerifyResult> {
  if (!signatureHeader) return { ok: false, reason: "missing_header" };

  const parsed = parseSignatureHeader(signatureHeader);
  if (!parsed) return { ok: false, reason: "malformed_header" };

  const timestampSeconds = Number(parsed.timestamp);
  if (!Number.isFinite(timestampSeconds)) return { ok: false, reason: "malformed_header" };

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > toleranceSeconds) {
    return { ok: false, reason: "timestamp_too_old" };
  }

  const expectedSignature = await hmacSha256Hex(webhookSecret, `${parsed.timestamp}.${rawBody}`);
  const matched = parsed.signatures.some((sig) => safeEqual(sig, expectedSignature));
  if (!matched) return { ok: false, reason: "signature_mismatch" };

  return { ok: true };
}
