import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyStripeWebhookSignature } from "../stripe-webhook-verify";

const SECRET = "whsec_test_secret_12345";

function signedHeader(body: string, secret: string, timestampSeconds: number): string {
  const signature = createHmac("sha256", secret).update(`${timestampSeconds}.${body}`).digest("hex");
  return `t=${timestampSeconds},v1=${signature}`;
}

describe("verifyStripeWebhookSignature", () => {
  const body = JSON.stringify({ id: "evt_123", type: "account.updated" });

  it("accepts a correctly signed, fresh payload", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const header = signedHeader(body, SECRET, nowSeconds);
    const result = await verifyStripeWebhookSignature(body, header, SECRET);
    expect(result.ok).toBe(true);
  });

  it("rejects a tampered body", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const header = signedHeader(body, SECRET, nowSeconds);
    const tamperedBody = JSON.stringify({ id: "evt_123", type: "account.updated", injected: true });
    const result = await verifyStripeWebhookSignature(tamperedBody, header, SECRET);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("signature_mismatch");
  });

  it("rejects a signature made with the wrong secret", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const header = signedHeader(body, "whsec_wrong_secret", nowSeconds);
    const result = await verifyStripeWebhookSignature(body, header, SECRET);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("signature_mismatch");
  });

  it("rejects a stale timestamp (replay protection)", async () => {
    const staleSeconds = Math.floor(Date.now() / 1000) - 60 * 60; // 1 hour old
    const header = signedHeader(body, SECRET, staleSeconds);
    const result = await verifyStripeWebhookSignature(body, header, SECRET);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("timestamp_too_old");
  });

  it("rejects a missing signature header", async () => {
    const result = await verifyStripeWebhookSignature(body, null, SECRET);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("missing_header");
  });

  it("rejects a malformed signature header", async () => {
    const result = await verifyStripeWebhookSignature(body, "not-a-valid-header", SECRET);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("malformed_header");
  });

  it("accepts when the correct v1 signature is among multiple (Stripe key rotation)", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const correctSig = createHmac("sha256", SECRET).update(`${nowSeconds}.${body}`).digest("hex");
    const header = `t=${nowSeconds},v1=deadbeef,v1=${correctSig}`;
    const result = await verifyStripeWebhookSignature(body, header, SECRET);
    expect(result.ok).toBe(true);
  });
});
