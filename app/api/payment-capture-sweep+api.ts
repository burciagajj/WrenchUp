/**
 * Scheduled job (not user-facing): captures Stripe PaymentIntents once a job is
 * ready for release, and pays the mechanic in two stages.
 *
 * Booking creates a manual-capture PaymentIntent (see payment-intent+api.ts) and
 * customer completion (app/complete.tsx) sets payment_state="ready_for_release"
 * with funds_release_at = now (charge immediately) and dispute_window_ends_at =
 * now + 2h. This route is hit every 2 minutes by a Supabase pg_cron + pg_net
 * job and authenticates via a shared secret, not a user session. Older app
 * builds still set funds_release_at = now + 24h, which this handles unchanged.
 *
 * Staged payouts (see lib/payout-split-core.ts): at capture the mechanic gets
 * a deposit (half the service price; parts reimbursement is its own transfer),
 * payout_state="deposit_paid"; once dispute_window_ends_at passes with no open
 * dispute the remainder plus tip is transferred, payout_state="transferred".
 * Jobs the mechanic marked done but the customer never confirmed are confirmed
 * automatically after 24h.
 *
 * Capture amount reconciliation: `offered_price` reflects the final agreed
 * price (it's patched in place whenever a counter-offer is accepted, by both
 * app/mechanic/incoming.tsx and app/(tabs)/booked-requests.tsx), and `tip` is
 * set by the customer at completion (app/complete.tsx). We capture
 * offered_price + tip, not just the amount originally authorized. Stripe only
 * allows capturing up to the originally-authorized hold — if a large tip or
 * adjustment pushes the reconciled total above that hold, the capture call
 * itself fails (Stripe rejects it) and this sweep already handles that via
 * the existing capture_failed / safety_flags path below, which is the
 * correct outcome: we can't silently overcharge (impossible) or silently
 * drop the extra amount (the old behavior), so it's flagged for follow-up
 * instead.
 *
 * Mechanic payouts: once a request is captured, this sweep also transfers
 * the mechanic's cut to their Stripe Connect account ("separate charges and
 * transfers" — see supabase/migrations/033_stripe_connect_payouts.sql for why
 * destination charges don't fit this app's booking flow). The transfer uses
 * source_transaction=<charge id> so it draws directly from that specific
 * charge's funds rather than the platform's overall available balance. If
 * the mechanic hasn't finished Connect onboarding yet, the row is simply left
 * for the next sweep run to retry — not treated as an error.
 */
import { getNotificationServiceConfig, supabaseRest } from "@/lib/notification-service";
import { cancellationFeeMechanicShare, computeCancellationFee } from "@/lib/cancellation-fee-core";
import { AUTO_CONFIRM_AFTER_MS, computePayoutSplit, DISPUTE_WINDOW_MS } from "@/lib/payout-split-core";
import type { RegionCode } from "@/lib/types";

// Platform's standard booking fee rate, used only as a fallback when a row's
// own platform_fee_rate wasn't captured at booking time (older rows). Every
// current booking path (confirm.tsx, book-service.tsx) stores this
// explicitly, so this fallback should rarely if ever apply.
const DEFAULT_PLATFORM_FEE_RATE = 0.12;

type SweepCandidate = {
  id: string;
  stripe_payment_intent_id: string | null;
  customer_user_id: string;
  offered_price: number | null;
  tip: number | null;
  funds_release_at: string | null;
  // Parts reimbursement — a separate hold/charge from the main job (see
  // app/api/parts-payment-intent+api.ts), captured independently below.
  parts_payment_intent_id: string | null;
  parts_payment_status: string | null;
  parts_cost: number | null;
};

type PayoutCandidate = {
  id: string;
  assigned_mechanic_user_id: string | null;
  offered_price: number | null;
  tip: number | null;
  platform_fee_rate: number | null;
  stripe_charge_id: string | null;
  currency: string | null;
  cancellation_fee_amount: number | null;
  dispute_window_ends_at: string | null;
  payout_deposit_amount: number | null;
};

type PartsPayoutCandidate = {
  id: string;
  assigned_mechanic_user_id: string | null;
  parts_cost: number | null;
  parts_charge_id: string | null;
  currency: string | null;
};

type MechanicPayoutAccount = {
  user_id: string;
  stripe_connect_account_id: string | null;
  stripe_connect_payouts_enabled: boolean;
};

type DisputeRow = { id: string };

function getStripeSecretKey(): string {
  return process.env.STRIPE_SECRET_KEY || "";
}

function getCronSecret(): string {
  return process.env.CRON_SECRET || "";
}

async function hasOpenDispute(requestId: string, serviceKey: string): Promise<boolean> {
  const rows = await supabaseRest<DisputeRow[]>(
    `/service_disputes?request_id=eq.${encodeURIComponent(requestId)}&status=in.(open,reviewing)&select=id&limit=1`,
    "GET",
    serviceKey,
  ).catch(() => null);
  return Array.isArray(rows) && rows.length > 0;
}

async function captureStripePaymentIntent(
  paymentIntentId: string,
  stripeSecretKey: string,
  amountToCaptureCents: number | null,
): Promise<{ ok: true; status: string; chargeId: string | null } | { ok: false; error: string }> {
  const params = new URLSearchParams();
  // Omit amount_to_capture entirely (rather than send a bogus value) when we
  // couldn't compute a sane reconciled amount — Stripe then captures the
  // full originally-authorized hold, same as before this reconciliation fix.
  if (amountToCaptureCents != null && Number.isFinite(amountToCaptureCents) && amountToCaptureCents > 0) {
    params.set("amount_to_capture", String(Math.round(amountToCaptureCents)));
  }
  const res = await fetch(
    `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(paymentIntentId)}/capture`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    },
  );
  const text = await res.text();
  let data: { status?: string; latest_charge?: string; error?: { message?: string } } | null = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: { message: text } };
  }
  if (!res.ok) {
    return { ok: false, error: data?.error?.message || `Stripe capture failed (${res.status})` };
  }
  return { ok: true, status: data?.status || "unknown", chargeId: data?.latest_charge || null };
}

async function fetchMechanicPayoutAccounts(
  serviceKey: string,
  userIds: string[],
): Promise<Map<string, MechanicPayoutAccount>> {
  const map = new Map<string, MechanicPayoutAccount>();
  if (userIds.length === 0) return map;
  const idList = userIds.map((id) => encodeURIComponent(id)).join(",");
  const rows = await supabaseRest<MechanicPayoutAccount[]>(
    `/user_profiles?user_id=in.(${idList})&select=user_id,stripe_connect_account_id,stripe_connect_payouts_enabled`,
    "GET",
    serviceKey,
  ).catch(() => null);
  for (const row of Array.isArray(rows) ? rows : []) {
    map.set(row.user_id, row);
  }
  return map;
}

async function createStripeTransfer(
  stripeSecretKey: string,
  destinationAccountId: string,
  amountCents: number,
  currency: string,
  chargeId: string | null,
  requestId: string,
): Promise<{ ok: true; transferId: string } | { ok: false; error: string }> {
  const params = new URLSearchParams();
  params.set("amount", String(Math.round(amountCents)));
  params.set("currency", currency);
  params.set("destination", destinationAccountId);
  // Draws directly from this charge's funds rather than the platform's
  // overall available balance — see file header comment.
  if (chargeId) params.set("source_transaction", chargeId);
  params.set("metadata[request_id]", requestId);
  params.set("metadata[source]", "wrenchup");

  const res = await fetch("https://api.stripe.com/v1/transfers", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  const text = await res.text();
  let data: { id?: string; error?: { message?: string } } | null = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: { message: text } };
  }
  if (!res.ok) {
    return { ok: false, error: data?.error?.message || `Stripe transfer failed (${res.status})` };
  }
  return { ok: true, transferId: String(data?.id || "") };
}

/**
 * Second pass: transfer each captured job's mechanic payout, for rows that
 * were captured (by the loop in POST below, on this run or a previous one)
 * but haven't been paid out yet. Kept as a separate query/loop rather than
 * folded into the capture loop above so a mechanic who finishes Connect
 * onboarding *after* their job was captured still gets paid automatically on
 * a later sweep run, instead of only ever being attempted once.
 */
async function sweepMechanicPayouts(
  serviceKey: string,
  stripeSecretKey: string,
): Promise<{ transferred: number; heldNoPayoutAccount: number; failed: number; skippedNoMechanic: number; deposits: number }> {
  let transferred = 0;
  let deposits = 0;
  let heldNoPayoutAccount = 0;
  let failed = 0;
  let skippedNoMechanic = 0;

  let rows: PayoutCandidate[] = [];
  try {
    rows =
      (await supabaseRest<PayoutCandidate[]>(
        `/service_requests?captured_at=not.is.null&payout_state=is.null&assigned_mechanic_user_id=not.is.null&select=id,assigned_mechanic_user_id,offered_price,tip,platform_fee_rate,stripe_charge_id,currency,cancellation_fee_amount,dispute_window_ends_at,payout_deposit_amount&limit=200`,
        "GET",
        serviceKey,
      )) ?? [];
  } catch (error) {
    console.error("[payment-capture-sweep] Failed to fetch payout candidates:", error);
    return { transferred, heldNoPayoutAccount, failed: 1, skippedNoMechanic, deposits };
  }

  const mechanicIds = Array.from(
    new Set(rows.map((r) => r.assigned_mechanic_user_id).filter((id): id is string => Boolean(id))),
  );
  const accounts = await fetchMechanicPayoutAccounts(serviceKey, mechanicIds);

  for (const row of rows) {
    try {
      if (!row.assigned_mechanic_user_id) {
        skippedNoMechanic += 1;
        continue;
      }

      const account = accounts.get(row.assigned_mechanic_user_id);
      if (!account?.stripe_connect_account_id || !account.stripe_connect_payouts_enabled) {
        // Leave payout_state null (not a terminal state) so this row is
        // retried by every future sweep run until the mechanic finishes
        // onboarding — only the error message is recorded, for visibility.
        await supabaseRest(`/service_requests?id=eq.${encodeURIComponent(row.id)}`, "PATCH", serviceKey, {
          payout_error: "Mechanic has not finished Stripe Connect onboarding yet.",
        }).catch(() => {});
        heldNoPayoutAccount += 1;
        continue;
      }

      // Money is held while a dispute is open (it may have been filed after
      // the charge was captured). Retried on later runs once it's resolved.
      if (await hasOpenDispute(row.id, serviceKey)) continue;

      // A captured cancellation fee goes to the mechanic minus Stripe's
      // processing cost — it isn't a job price, so the service/platform-fee
      // split below doesn't apply, and it is never staged.
      const isCancellationFee = typeof row.cancellation_fee_amount === "number" && row.cancellation_fee_amount > 0;
      const feeRate =
        Number.isFinite(row.platform_fee_rate) && row.platform_fee_rate != null
          ? row.platform_fee_rate
          : DEFAULT_PLATFORM_FEE_RATE;
      // offered_price is the customer-facing TOTAL, i.e. service*(1+feeRate)
      // (see confirm.tsx / book-service.tsx). The platform's cut must be
      // exactly feeRate of the service price, not of this total — so invert
      // it back to the service-only portion before taking the mechanic's
      // share. Tip is added on top with no fee taken from it.
      const split = isCancellationFee
        ? null
        : computePayoutSplit({ offeredPrice: row.offered_price ?? 0, tip: row.tip ?? 0, feeRate });
      const payoutCents = isCancellationFee
        ? Math.round(cancellationFeeMechanicShare(row.cancellation_fee_amount as number, row.currency) * 100)
        : split?.totalCents ?? 0;

      if (!Number.isFinite(payoutCents) || payoutCents <= 0) {
        // Nothing sane to transfer (e.g. a $0 job) — not an error, just done.
        await supabaseRest(`/service_requests?id=eq.${encodeURIComponent(row.id)}`, "PATCH", serviceKey, {
          payout_state: "transferred",
          payout_transferred_at: new Date().toISOString(),
          payout_error: null,
        }).catch(() => {});
        continue;
      }

      // Stage 1 of 2: while the dispute window is still open, pay only the
      // deposit now and hold the rest. Rows whose window already closed (or
      // that never had one — older app builds, cancellation fees) are paid in
      // full in one transfer, exactly as before.
      const windowEndsMs = row.dispute_window_ends_at ? Date.parse(row.dispute_window_ends_at) : NaN;
      const windowStillOpen = Number.isFinite(windowEndsMs) && windowEndsMs > Date.now();
      const stageDeposit = !!split && windowStillOpen && split.depositCents > 0 && split.remainderCents > 0;
      const transferCents = stageDeposit ? split.depositCents : payoutCents;

      const result = await createStripeTransfer(
        stripeSecretKey,
        account.stripe_connect_account_id,
        transferCents,
        row.currency || "usd",
        row.stripe_charge_id,
        row.id,
      );

      if (result.ok && stageDeposit) {
        await supabaseRest(`/service_requests?id=eq.${encodeURIComponent(row.id)}`, "PATCH", serviceKey, {
          payout_state: "deposit_paid",
          payout_deposit_amount: transferCents / 100,
          payout_deposit_transfer_id: result.transferId,
          payout_deposit_at: new Date().toISOString(),
          payout_error: null,
        });
        deposits += 1;
      } else if (result.ok) {
        await supabaseRest(`/service_requests?id=eq.${encodeURIComponent(row.id)}`, "PATCH", serviceKey, {
          payout_state: "transferred",
          stripe_transfer_id: result.transferId,
          payout_transferred_at: new Date().toISOString(),
          payout_error: null,
        });
        transferred += 1;
      } else {
        await supabaseRest(`/service_requests?id=eq.${encodeURIComponent(row.id)}`, "PATCH", serviceKey, {
          payout_state: "transfer_failed",
          payout_error: result.error,
        });
        failed += 1;
      }
    } catch (error) {
      console.error(`[payment-capture-sweep] Error paying out ${row.id}:`, error);
      failed += 1;
    }
  }

  return { transferred, heldNoPayoutAccount, failed, skippedNoMechanic, deposits };
}

/**
 * Stage 2 of staged payouts: once the dispute window has closed with no open
 * dispute, transfer what was held back after the deposit (rest of the service
 * price plus any tip). Rows are matched on payout_state="deposit_paid", so
 * anything an admin marks "withheld" after a dispute is never released here.
 */
async function sweepPayoutRemainders(
  serviceKey: string,
  stripeSecretKey: string,
): Promise<{ released: number; heldNoPayoutAccount: number; failed: number }> {
  let released = 0;
  let heldNoPayoutAccount = 0;
  let failed = 0;

  let rows: PayoutCandidate[] = [];
  try {
    rows =
      (await supabaseRest<PayoutCandidate[]>(
        `/service_requests?payout_state=eq.deposit_paid&dispute_window_ends_at=lte.${encodeURIComponent(
          new Date().toISOString(),
        )}&assigned_mechanic_user_id=not.is.null&select=id,assigned_mechanic_user_id,offered_price,tip,platform_fee_rate,stripe_charge_id,currency,cancellation_fee_amount,dispute_window_ends_at,payout_deposit_amount&limit=200`,
        "GET",
        serviceKey,
      )) ?? [];
  } catch (error) {
    console.error("[payment-capture-sweep] Failed to fetch payout remainders:", error);
    return { released, heldNoPayoutAccount, failed: 1 };
  }

  const mechanicIds = Array.from(
    new Set(rows.map((r) => r.assigned_mechanic_user_id).filter((id): id is string => Boolean(id))),
  );
  const accounts = await fetchMechanicPayoutAccounts(serviceKey, mechanicIds);

  for (const row of rows) {
    try {
      if (!row.assigned_mechanic_user_id) continue;
      const account = accounts.get(row.assigned_mechanic_user_id);
      if (!account?.stripe_connect_account_id || !account.stripe_connect_payouts_enabled) {
        heldNoPayoutAccount += 1;
        continue;
      }
      if (await hasOpenDispute(row.id, serviceKey)) continue;

      const feeRate =
        Number.isFinite(row.platform_fee_rate) && row.platform_fee_rate != null
          ? row.platform_fee_rate
          : DEFAULT_PLATFORM_FEE_RATE;
      const split = computePayoutSplit({ offeredPrice: row.offered_price ?? 0, tip: row.tip ?? 0, feeRate });
      // Pay exactly what's still owed given what was already deposited, so a
      // rounding difference can't over- or under-pay across the two transfers.
      const remainderCents = split.totalCents - Math.round((row.payout_deposit_amount ?? 0) * 100);

      if (!Number.isFinite(remainderCents) || remainderCents <= 0) {
        await supabaseRest(`/service_requests?id=eq.${encodeURIComponent(row.id)}`, "PATCH", serviceKey, {
          payout_state: "transferred",
          payout_transferred_at: new Date().toISOString(),
          payout_error: null,
        }).catch(() => {});
        continue;
      }

      const result = await createStripeTransfer(
        stripeSecretKey,
        account.stripe_connect_account_id,
        remainderCents,
        row.currency || "usd",
        row.stripe_charge_id,
        row.id,
      );
      if (result.ok) {
        await supabaseRest(`/service_requests?id=eq.${encodeURIComponent(row.id)}`, "PATCH", serviceKey, {
          payout_state: "transferred",
          stripe_transfer_id: result.transferId,
          payout_transferred_at: new Date().toISOString(),
          payout_error: null,
        });
        released += 1;
      } else {
        // Left as deposit_paid so the next run retries, with the reason recorded.
        await supabaseRest(`/service_requests?id=eq.${encodeURIComponent(row.id)}`, "PATCH", serviceKey, {
          payout_error: result.error,
        }).catch(() => {});
        failed += 1;
      }
    } catch (error) {
      console.error(`[payment-capture-sweep] Error releasing remainder for ${row.id}:`, error);
      failed += 1;
    }
  }

  return { released, heldNoPayoutAccount, failed };
}

/**
 * Completes jobs the mechanic marked done but the customer never confirmed,
 * so the mechanic isn't left waiting until the card hold expires. Same end
 * state as the customer confirming in app/complete.tsx: charge now, deposit
 * now, remainder after the dispute window.
 */
async function autoConfirmStaleCompletions(serviceKey: string): Promise<number> {
  const cutoff = new Date(Date.now() - AUTO_CONFIRM_AFTER_MS).toISOString();
  let rows: { id: string }[] = [];
  try {
    rows =
      (await supabaseRest<{ id: string }[]>(
        `/service_requests?status=eq.in_progress&customer_completed_at=is.null&mechanic_marked_done_at=lte.${encodeURIComponent(
          cutoff,
        )}&or=(payment_state.is.null,payment_state.eq.escrow_hold)&stripe_payment_intent_id=not.is.null&select=id&limit=100`,
        "GET",
        serviceKey,
      )) ?? [];
  } catch (error) {
    console.error("[payment-capture-sweep] Failed to fetch stale completions:", error);
    return 0;
  }

  let confirmed = 0;
  for (const row of rows) {
    try {
      if (await hasOpenDispute(row.id, serviceKey)) continue;
      const now = new Date();
      await supabaseRest(`/service_requests?id=eq.${encodeURIComponent(row.id)}&status=eq.in_progress`, "PATCH", serviceKey, {
        status: "completed",
        job_completed_at: now.toISOString(),
        customer_completed_at: now.toISOString(),
        payment_state: "ready_for_release",
        funds_release_at: now.toISOString(),
        dispute_window_ends_at: new Date(now.getTime() + DISPUTE_WINDOW_MS).toISOString(),
        updated_at: now.toISOString(),
      });
      confirmed += 1;
    } catch (error) {
      console.error(`[payment-capture-sweep] Error auto-confirming ${row.id}:`, error);
    }
  }
  return confirmed;
}

/**
 * Parts reimbursement payout — a SEPARATE transfer from sweepMechanicPayouts
 * above, not folded into it. Parts money lives in its own Stripe charge
 * (parts_charge_id, from the independent parts PaymentIntent captured in
 * POST below), so source_transaction for this transfer must point at that
 * charge specifically — combining it into the main job's transfer would try
 * to draw parts funds from the main charge's balance instead, breaking the
 * "separate charges and transfers" invariant this file already relies on
 * for the main payout (see file header comment).
 */
async function sweepPartsPayouts(
  serviceKey: string,
  stripeSecretKey: string,
): Promise<{ transferred: number; heldNoPayoutAccount: number; failed: number }> {
  let transferred = 0;
  let heldNoPayoutAccount = 0;
  let failed = 0;

  let rows: PartsPayoutCandidate[] = [];
  try {
    rows =
      (await supabaseRest<PartsPayoutCandidate[]>(
        `/service_requests?parts_payment_status=eq.captured&parts_payout_state=is.null&assigned_mechanic_user_id=not.is.null&select=id,assigned_mechanic_user_id,parts_cost,parts_charge_id,currency&limit=200`,
        "GET",
        serviceKey,
      )) ?? [];
  } catch (error) {
    console.error("[payment-capture-sweep] Failed to fetch parts payout candidates:", error);
    return { transferred, heldNoPayoutAccount, failed: 1 };
  }

  const mechanicIds = Array.from(
    new Set(rows.map((r) => r.assigned_mechanic_user_id).filter((id): id is string => Boolean(id))),
  );
  const accounts = await fetchMechanicPayoutAccounts(serviceKey, mechanicIds);

  for (const row of rows) {
    try {
      if (!row.assigned_mechanic_user_id) continue;

      const account = accounts.get(row.assigned_mechanic_user_id);
      if (!account?.stripe_connect_account_id || !account.stripe_connect_payouts_enabled) {
        await supabaseRest(`/service_requests?id=eq.${encodeURIComponent(row.id)}`, "PATCH", serviceKey, {
          parts_payout_error: "Mechanic has not finished Stripe Connect onboarding yet.",
        }).catch(() => {});
        heldNoPayoutAccount += 1;
        continue;
      }

      // Parts is a pass-through reimbursement, not platform revenue — the
      // mechanic gets the full amount, no fee taken (matches how tip is
      // already added untaxed in sweepMechanicPayouts above).
      const payoutCents = Math.round((row.parts_cost ?? 0) * 100);
      if (!Number.isFinite(payoutCents) || payoutCents <= 0) {
        await supabaseRest(`/service_requests?id=eq.${encodeURIComponent(row.id)}`, "PATCH", serviceKey, {
          parts_payout_state: "transferred",
          parts_payout_transferred_at: new Date().toISOString(),
          parts_payout_error: null,
        }).catch(() => {});
        continue;
      }

      const result = await createStripeTransfer(
        stripeSecretKey,
        account.stripe_connect_account_id,
        payoutCents,
        row.currency || "usd",
        row.parts_charge_id,
        row.id,
      );

      if (result.ok) {
        await supabaseRest(`/service_requests?id=eq.${encodeURIComponent(row.id)}`, "PATCH", serviceKey, {
          parts_payout_state: "transferred",
          parts_stripe_transfer_id: result.transferId,
          parts_payout_transferred_at: new Date().toISOString(),
          parts_payout_error: null,
        });
        transferred += 1;
      } else {
        await supabaseRest(`/service_requests?id=eq.${encodeURIComponent(row.id)}`, "PATCH", serviceKey, {
          parts_payout_state: "transfer_failed",
          parts_payout_error: result.error,
        });
        failed += 1;
      }
    } catch (error) {
      console.error(`[payment-capture-sweep] Error paying out parts for ${row.id}:`, error);
      failed += 1;
    }
  }

  return { transferred, heldNoPayoutAccount, failed };
}

async function flagFailedPayment(
  requestId: string,
  userId: string,
  message: string,
  serviceKey: string,
): Promise<void> {
  await supabaseRest(
    `/safety_flags`,
    "POST",
    serviceKey,
    {
      user_id: userId,
      request_id: requestId,
      flag_type: "failed_payments",
      severity: "high",
      details: { source: "payment-capture-sweep", message },
    },
  ).catch((error) => {
    console.error("[payment-capture-sweep] Failed to write safety_flags row:", error);
  });
}

type CancelledHoldCandidate = {
  id: string;
  customer_user_id: string;
  stripe_payment_intent_id: string | null;
  parts_payment_intent_id: string | null;
  cancelled_by_role: "customer" | "mechanic" | null;
  assigned_mechanic_user_id: string | null;
  mechanic_distance_driven_miles: number | null;
  mechanic_start_latitude: number | null;
  mechanic_start_longitude: number | null;
  customer_latitude: number | null;
  customer_longitude: number | null;
  currency: string | null;
};

const CANCELLED_HOLD_COLUMNS =
  "id,customer_user_id,stripe_payment_intent_id,parts_payment_intent_id,cancelled_by_role,assigned_mechanic_user_id,mechanic_distance_driven_miles,mechanic_start_latitude,mechanic_start_longitude,customer_latitude,customer_longitude,currency";

async function cancelStripePaymentIntent(
  paymentIntentId: string,
  stripeSecretKey: string,
): Promise<{ ok: true } | { ok: false; error: string; retryable: boolean }> {
  const headers = {
    Authorization: `Bearer ${stripeSecretKey}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
  const res = await fetch(
    `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(paymentIntentId)}/cancel`,
    { method: "POST", headers, body: "cancellation_reason=requested_by_customer" },
  );
  if (res.ok) return { ok: true };

  const text = await res.text();
  let data: { error?: { message?: string; code?: string } } | null = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  // The intent doesn't exist for this Stripe account/mode (e.g. a leftover
  // from when this project was on test keys) — there is no hold on anyone's
  // card to release, so there's nothing to fail on.
  if (data?.error?.code === "resource_missing") return { ok: true };
  // Already canceled (e.g. a previous sweep run succeeded but the DB write
  // after it didn't) — that's the outcome we wanted, not a failure.
  if (data?.error?.code === "payment_intent_unexpected_state") {
    const check = await fetch(
      `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(paymentIntentId)}`,
      { headers: { Authorization: headers.Authorization } },
    );
    const intent = (await check.json().catch(() => null)) as { status?: string } | null;
    if (intent?.status === "canceled") return { ok: true };
  }
  return {
    ok: false,
    error: data?.error?.message || `Stripe cancel failed (${res.status})`,
    // 5xx is Stripe-side and worth retrying on the next run; a 4xx means the
    // intent is in a state we can't release (e.g. already captured), which
    // retrying every 15 minutes would never fix.
    retryable: res.status >= 500,
  };
}

/**
 * Releases the authorization hold on requests that ended in "cancelled"
 * without ever being captured. Booking only *authorizes* the card
 * (capture_method="manual"), and nothing else cancels that PaymentIntent when
 * a customer cancels — so without this the hold sits on their card until
 * Stripe auto-expires it (~7 days), which is exactly the multi-day wait
 * customers shouldn't have to sit through for a service that never happened.
 * Runs in the sweep rather than inline at cancel time so every cancellation
 * path (customer cancel, no-match auto-cancel, etc.) is covered the same way,
 * and a transient Stripe failure just gets retried on the next run.
 */
async function releaseCancelledHolds(
  serviceKey: string,
  stripeSecretKey: string,
): Promise<{ released: number; feesCharged: number; partsReleased: number; failed: number }> {
  let released = 0;
  let feesCharged = 0;
  let partsReleased = 0;
  let failed = 0;

  let mainRows: CancelledHoldCandidate[] = [];
  let partsRows: CancelledHoldCandidate[] = [];
  try {
    mainRows =
      (await supabaseRest<CancelledHoldCandidate[]>(
        `/service_requests?status=eq.cancelled&captured_at=is.null&stripe_payment_intent_id=not.is.null&or=(payment_state.is.null,payment_state.eq.escrow_hold)&select=${CANCELLED_HOLD_COLUMNS}&limit=200`,
        "GET",
        serviceKey,
      )) ?? [];
    partsRows =
      (await supabaseRest<CancelledHoldCandidate[]>(
        `/service_requests?status=eq.cancelled&parts_payment_intent_id=not.is.null&parts_payment_status=in.(proposed,authorized)&select=${CANCELLED_HOLD_COLUMNS}&limit=200`,
        "GET",
        serviceKey,
      )) ?? [];
  } catch (error) {
    console.error("[payment-capture-sweep] Failed to fetch cancelled holds:", error);
    return { released, feesCharged, partsReleased, failed: 1 };
  }

  for (const row of mainRows) {
    try {
      if (!row.stripe_payment_intent_id) continue;

      // A customer who cancels after the mechanic has already driven a real
      // distance owes the mechanic a flat fee: capture just that amount from
      // the hold (Stripe releases the rest of the authorization on its own),
      // and the payout sweep passes it on to the mechanic. Decided here from
      // GPS the database accumulated, not from anything the customer's app
      // sent. If the capture fails the customer simply isn't charged — we
      // fall through and release the hold like any other cancellation.
      const region: RegionCode = (row.currency || "").toLowerCase() === "mxn" ? "MX" : "US";
      const decision = computeCancellationFee({
        cancelledByRole: row.cancelled_by_role,
        hasAssignedMechanic: !!row.assigned_mechanic_user_id,
        drivenMiles: row.mechanic_distance_driven_miles,
        mechanicStart:
          typeof row.mechanic_start_latitude === "number" && typeof row.mechanic_start_longitude === "number"
            ? { latitude: row.mechanic_start_latitude, longitude: row.mechanic_start_longitude }
            : null,
        customer:
          typeof row.customer_latitude === "number" && typeof row.customer_longitude === "number"
            ? { latitude: row.customer_latitude, longitude: row.customer_longitude }
            : null,
        region,
      });
      // One line per decision so a fee test (or a customer complaint) can be
      // traced in the EAS Hosting logs: why a fee did or didn't apply, and
      // whether the Stripe capture went through.
      const logFeeDecision = (outcome: string, extra: Record<string, unknown> = {}) =>
        console.info(
          "[payment-capture-sweep] cancellation-fee",
          JSON.stringify({
            requestId: row.id,
            outcome,
            cancelledBy: row.cancelled_by_role,
            drivenMiles: row.mechanic_distance_driven_miles,
            ...(decision.applies
              ? { amount: decision.amount, currency: row.currency, startMiles: +decision.startMiles.toFixed(2) }
              : { reason: decision.reason }),
            ...extra,
          }),
        );
      let feeNote: string | null = null;
      if (decision.applies) {
        const feeCapture = await captureStripePaymentIntent(
          row.stripe_payment_intent_id,
          stripeSecretKey,
          Math.round(decision.amount * 100),
        );
        logFeeDecision(feeCapture.ok ? "fee_charged" : "fee_capture_failed", feeCapture.ok ? { chargeId: feeCapture.chargeId } : { error: feeCapture.error });
        if (feeCapture.ok) {
          await supabaseRest(`/service_requests?id=eq.${encodeURIComponent(row.id)}`, "PATCH", serviceKey, {
            payment_state: "released",
            captured_at: new Date().toISOString(),
            capture_error: null,
            stripe_charge_id: feeCapture.chargeId,
            cancellation_fee_amount: decision.amount,
          });
          feesCharged += 1;
          continue;
        }
        feeNote = `Cancellation fee capture failed, hold released instead: ${feeCapture.error}`;
        await flagFailedPayment(row.id, row.customer_user_id, feeNote, serviceKey);
      } else {
        logFeeDecision("no_fee");
      }

      const result = await cancelStripePaymentIntent(row.stripe_payment_intent_id, stripeSecretKey);
      if (result.ok) {
        await supabaseRest(`/service_requests?id=eq.${encodeURIComponent(row.id)}`, "PATCH", serviceKey, {
          payment_state: "hold_released",
          capture_error: feeNote,
        });
        released += 1;
      } else if (!result.retryable) {
        await supabaseRest(`/service_requests?id=eq.${encodeURIComponent(row.id)}`, "PATCH", serviceKey, {
          payment_state: "hold_release_failed",
          capture_error: result.error,
        });
        await flagFailedPayment(row.id, row.customer_user_id, `Hold release failed: ${result.error}`, serviceKey);
        failed += 1;
      } else {
        failed += 1;
      }
    } catch (error) {
      console.error(`[payment-capture-sweep] Error releasing hold for ${row.id}:`, error);
      failed += 1;
    }
  }

  for (const row of partsRows) {
    try {
      if (!row.parts_payment_intent_id) continue;
      const result = await cancelStripePaymentIntent(row.parts_payment_intent_id, stripeSecretKey);
      if (result.ok) {
        await supabaseRest(`/service_requests?id=eq.${encodeURIComponent(row.id)}`, "PATCH", serviceKey, {
          parts_payment_status: "canceled",
        });
        partsReleased += 1;
      } else if (!result.retryable) {
        await supabaseRest(`/service_requests?id=eq.${encodeURIComponent(row.id)}`, "PATCH", serviceKey, {
          parts_payment_status: "capture_failed",
        });
        await flagFailedPayment(row.id, row.customer_user_id, `Parts hold release failed: ${result.error}`, serviceKey);
        failed += 1;
      } else {
        failed += 1;
      }
    } catch (error) {
      console.error(`[payment-capture-sweep] Error releasing parts hold for ${row.id}:`, error);
      failed += 1;
    }
  }

  return { released, feesCharged, partsReleased, failed };
}

export async function POST(request: Request) {
  const cronSecret = getCronSecret();
  const authHeader = request.headers.get("authorization") || "";
  const providedSecret = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";

  if (!cronSecret) {
    return Response.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }
  if (!providedSecret || providedSecret !== cronSecret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { serviceKey } = getNotificationServiceConfig();
  const stripeSecretKey = getStripeSecretKey();
  if (!serviceKey) {
    return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY not set" }, { status: 503 });
  }
  if (!stripeSecretKey) {
    return Response.json({ error: "STRIPE_SECRET_KEY not set" }, { status: 503 });
  }

  const autoConfirmed = await autoConfirmStaleCompletions(serviceKey);

  const nowIso = new Date().toISOString();
  let candidates: SweepCandidate[] = [];
  try {
    candidates =
      (await supabaseRest<SweepCandidate[]>(
        `/service_requests?payment_state=eq.ready_for_release&captured_at=is.null&funds_release_at=lte.${encodeURIComponent(
          nowIso,
        )}&select=id,stripe_payment_intent_id,customer_user_id,offered_price,tip,funds_release_at,parts_payment_intent_id,parts_payment_status,parts_cost&limit=200`,
        "GET",
        serviceKey,
      )) ?? [];
  } catch (error) {
    console.error("[payment-capture-sweep] Failed to fetch candidates:", error);
    return Response.json({ error: "Failed to fetch candidates" }, { status: 500 });
  }

  let captured = 0;
  let failed = 0;
  let skippedDisputed = 0;
  let skippedNoIntent = 0;

  for (const row of candidates) {
    try {
      if (await hasOpenDispute(row.id, serviceKey)) {
        skippedDisputed += 1;
        continue;
      }

      if (!row.stripe_payment_intent_id) {
        skippedNoIntent += 1;
        continue;
      }

      const reconciledTotal = (row.offered_price ?? 0) + (row.tip ?? 0);
      const amountToCaptureCents = Number.isFinite(reconciledTotal) && reconciledTotal > 0
        ? Math.round(reconciledTotal * 100)
        : null;

      const result = await captureStripePaymentIntent(row.stripe_payment_intent_id, stripeSecretKey, amountToCaptureCents);
      if (result.ok) {
        await supabaseRest(`/service_requests?id=eq.${encodeURIComponent(row.id)}`, "PATCH", serviceKey, {
          payment_state: "released",
          captured_at: new Date().toISOString(),
          capture_error: null,
          stripe_charge_id: result.chargeId,
        });
        captured += 1;
      } else {
        await supabaseRest(`/service_requests?id=eq.${encodeURIComponent(row.id)}`, "PATCH", serviceKey, {
          payment_state: "capture_failed",
          capture_error: result.error,
        });
        await flagFailedPayment(row.id, row.customer_user_id, result.error, serviceKey);
        failed += 1;
      }

      // Parts reimbursement is a separate hold — capture it independently of
      // the main job above. A parts capture failure must never block or
      // revert the main job's capture/payout; the two are unrelated once
      // authorized.
      if (row.parts_payment_status === "authorized" && row.parts_payment_intent_id) {
        const partsCost = row.parts_cost ?? 0;
        const partsCents = Number.isFinite(partsCost) && partsCost > 0 ? Math.round(partsCost * 100) : null;
        const partsResult = await captureStripePaymentIntent(row.parts_payment_intent_id, stripeSecretKey, partsCents);
        if (partsResult.ok) {
          await supabaseRest(`/service_requests?id=eq.${encodeURIComponent(row.id)}`, "PATCH", serviceKey, {
            parts_payment_status: "captured",
            parts_charge_id: partsResult.chargeId,
          }).catch(() => {});
        } else {
          await supabaseRest(`/service_requests?id=eq.${encodeURIComponent(row.id)}`, "PATCH", serviceKey, {
            parts_payment_status: "capture_failed",
          }).catch(() => {});
          await flagFailedPayment(row.id, row.customer_user_id, `Parts reimbursement capture failed: ${partsResult.error}`, serviceKey);
        }
      }
    } catch (error) {
      console.error(`[payment-capture-sweep] Error processing ${row.id}:`, error);
      failed += 1;
    }
  }

  const payouts = await sweepMechanicPayouts(serviceKey, stripeSecretKey);
  const remainders = await sweepPayoutRemainders(serviceKey, stripeSecretKey);
  const partsPayouts = await sweepPartsPayouts(serviceKey, stripeSecretKey);
  const holdReleases = await releaseCancelledHolds(serviceKey, stripeSecretKey);

  return Response.json({
    holdsReleased: holdReleases.released,
    cancellationFeesCharged: holdReleases.feesCharged,
    partsHoldsReleased: holdReleases.partsReleased,
    holdReleasesFailed: holdReleases.failed,
    autoConfirmed,
    processed: candidates.length,
    captured,
    failed,
    skippedDisputed,
    skippedNoIntent,
    payoutsProcessed: payouts.transferred + payouts.deposits + payouts.heldNoPayoutAccount + payouts.failed + payouts.skippedNoMechanic,
    payoutsTransferred: payouts.transferred,
    payoutDepositsPaid: payouts.deposits,
    payoutRemaindersReleased: remainders.released,
    payoutRemaindersFailed: remainders.failed,
    payoutsHeldNoPayoutAccount: payouts.heldNoPayoutAccount,
    payoutsFailed: payouts.failed,
    partsPayoutsTransferred: partsPayouts.transferred,
    partsPayoutsHeldNoPayoutAccount: partsPayouts.heldNoPayoutAccount,
    partsPayoutsFailed: partsPayouts.failed,
  });
}
