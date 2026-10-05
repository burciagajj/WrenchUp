import { describe, expect, it } from "vitest";
import {
  DECLINE_OFFER_THROTTLE_DURATION_MS,
  DECLINE_STREAK_RESET_AFTER_MS,
  DECLINE_STREAK_THROTTLE_THRESHOLD,
  OFFER_THROTTLE_DURATION_MS,
  STRIKE_RESET_AFTER_MS,
  STRIKE_THROTTLE_THRESHOLD,
  computeNextCancelStrikeState,
  computeNextDeclineStreakState,
  excludeThrottledMechanics,
  isMechanicOfferThrottled,
  isPenalizableCancelStatus,
} from "@/lib/mechanic-cancel-penalty-core";

describe("mechanic-cancel-penalty-core", () => {
  const now = new Date("2026-07-28T12:00:00.000Z").getTime();

  it("starts a fresh strike count when there is no prior cancellation", () => {
    const result = computeNextCancelStrikeState({ currentStrikes: 0, lastCancelAtMs: null, nowMs: now });
    expect(result).toEqual({ strikes: 1, throttledUntilMs: null });
  });

  it("increments strikes within the rolling window", () => {
    const result = computeNextCancelStrikeState({
      currentStrikes: 1,
      lastCancelAtMs: now - 1000,
      nowMs: now,
    });
    expect(result.strikes).toBe(2);
    expect(result.throttledUntilMs).toBeNull();
  });

  it("resets strikes once the prior strike ages out of the window", () => {
    const result = computeNextCancelStrikeState({
      currentStrikes: 2,
      lastCancelAtMs: now - STRIKE_RESET_AFTER_MS - 1,
      nowMs: now,
    });
    expect(result.strikes).toBe(1);
    expect(result.throttledUntilMs).toBeNull();
  });

  it("throttles once the strike threshold is reached", () => {
    const result = computeNextCancelStrikeState({
      currentStrikes: STRIKE_THROTTLE_THRESHOLD - 1,
      lastCancelAtMs: now - 1000,
      nowMs: now,
    });
    expect(result.strikes).toBe(STRIKE_THROTTLE_THRESHOLD);
    expect(result.throttledUntilMs).toBe(now + OFFER_THROTTLE_DURATION_MS);
  });

  it("isMechanicOfferThrottled reads a future/past timestamp correctly", () => {
    expect(isMechanicOfferThrottled(null, now)).toBe(false);
    expect(isMechanicOfferThrottled(new Date(now - 1000).toISOString(), now)).toBe(false);
    expect(isMechanicOfferThrottled(new Date(now + 1000).toISOString(), now)).toBe(true);
  });

  it("isPenalizableCancelStatus only counts committed statuses", () => {
    expect(isPenalizableCancelStatus("searching")).toBe(false);
    expect(isPenalizableCancelStatus("accepted")).toBe(true);
    expect(isPenalizableCancelStatus("enroute")).toBe(true);
    expect(isPenalizableCancelStatus("arrived")).toBe(true);
    expect(isPenalizableCancelStatus("in_progress")).toBe(true);
    expect(isPenalizableCancelStatus("completed")).toBe(false);
    expect(isPenalizableCancelStatus("cancelled")).toBe(false);
  });

  it("starts a fresh decline streak when there is no prior decline", () => {
    const result = computeNextDeclineStreakState({ currentStreak: 0, lastDeclineAtMs: null, nowMs: now });
    expect(result).toEqual({ streak: 1, throttledUntilMs: null });
  });

  it("increments the decline streak within the reset window", () => {
    const result = computeNextDeclineStreakState({
      currentStreak: 1,
      lastDeclineAtMs: now - 1000,
      nowMs: now,
    });
    expect(result.streak).toBe(2);
    expect(result.throttledUntilMs).toBeNull();
  });

  it("resets the decline streak once the prior decline ages out", () => {
    const result = computeNextDeclineStreakState({
      currentStreak: 4,
      lastDeclineAtMs: now - DECLINE_STREAK_RESET_AFTER_MS - 1,
      nowMs: now,
    });
    expect(result.streak).toBe(1);
    expect(result.throttledUntilMs).toBeNull();
  });

  it("throttles once the decline streak threshold is reached", () => {
    const result = computeNextDeclineStreakState({
      currentStreak: DECLINE_STREAK_THROTTLE_THRESHOLD - 1,
      lastDeclineAtMs: now - 1000,
      nowMs: now,
    });
    expect(result.streak).toBe(DECLINE_STREAK_THROTTLE_THRESHOLD);
    expect(result.throttledUntilMs).toBe(now + DECLINE_OFFER_THROTTLE_DURATION_MS);
  });

  it("excludeThrottledMechanics filters by id", () => {
    const mechanics = [{ mechanic_user_id: "a" }, { mechanic_user_id: "b" }, { mechanic_user_id: "c" }];
    expect(excludeThrottledMechanics(mechanics, ["b"])).toEqual([
      { mechanic_user_id: "a" },
      { mechanic_user_id: "c" },
    ]);
    expect(excludeThrottledMechanics(mechanics, [])).toBe(mechanics);
  });
});
