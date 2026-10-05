import { describe, expect, it } from "vitest";
import {
  canMechanicGoOnline,
  buildMechanicPresencePayload,
  PRESENCE_HEARTBEAT_MS,
  PRESENCE_STALE_AFTER_MS,
  presenceStaleCutoffIso,
  filterFreshMechanicPresence,
  shouldResetStaleMechanicOnline,
} from "../mechanic-presence-core";

describe("mechanic presence core", () => {
  it("allows approved mechanics to go online", () => {
    expect(canMechanicGoOnline({ role: "mechanic", verification_status: "approved" })).toEqual({ ok: true });
  });

  it("blocks non-mechanics", () => {
    expect(canMechanicGoOnline({ role: "customer", verification_status: "approved" })).toEqual({
      ok: false,
      reason: "not_mechanic",
    });
  });

  it("blocks unapproved mechanics", () => {
    expect(canMechanicGoOnline({ role: "mechanic", verification_status: "pending" })).toEqual({
      ok: false,
      reason: "not_approved",
    });
  });

  it("builds presence payload", () => {
    const payload = buildMechanicPresencePayload({
      isOnline: true,
      mechanicName: "Mike",
      regionCode: "US",
    });
    expect(payload.is_online).toBe(true);
    expect(payload.mechanic_name).toBe("Mike");
    expect(payload.region_code).toBe("US");
    expect(payload.updated_at).toBeTruthy();
  });
});

describe("presence staleness", () => {
  const now = new Date("2026-01-01T00:10:00.000Z");

  it("stale-after window is two heartbeats", () => {
    expect(PRESENCE_STALE_AFTER_MS).toBe(PRESENCE_HEARTBEAT_MS * 2);
  });

  it("computes the cutoff timestamp relative to now", () => {
    expect(presenceStaleCutoffIso(now)).toBe(
      new Date(now.getTime() - PRESENCE_STALE_AFTER_MS).toISOString(),
    );
  });

  it("keeps rows updated within the staleness window", () => {
    const fresh = { updated_at: new Date(now.getTime() - 60_000).toISOString() };
    expect(filterFreshMechanicPresence([fresh], now)).toEqual([fresh]);
  });

  it("drops rows updated before the staleness window", () => {
    const stale = { updated_at: new Date(now.getTime() - PRESENCE_STALE_AFTER_MS - 1000).toISOString() };
    expect(filterFreshMechanicPresence([stale], now)).toEqual([]);
  });

  it("drops rows with a missing or unparseable updated_at", () => {
    expect(filterFreshMechanicPresence([{ updated_at: null }], now)).toEqual([]);
    expect(filterFreshMechanicPresence([{ updated_at: "not-a-date" }], now)).toEqual([]);
    expect(filterFreshMechanicPresence([{}], now)).toEqual([]);
  });
});

describe("shouldResetStaleMechanicOnline", () => {
  const now = new Date("2026-01-01T00:10:00.000Z").getTime();

  it("does nothing if the mechanic wasn't online to begin with", () => {
    expect(
      shouldResetStaleMechanicOnline({ mechanicOnline: false, lastHeartbeatAt: null, now }),
    ).toBe(false);
  });

  it("keeps a mechanic online whose last heartbeat is within the staleness window", () => {
    expect(
      shouldResetStaleMechanicOnline({
        mechanicOnline: true,
        lastHeartbeatAt: now - 60_000,
        now,
      }),
    ).toBe(false);
  });

  it("resets a mechanic whose last heartbeat is older than the staleness window — e.g. the app was killed while online and never relaunched until days later", () => {
    const daysAgo = now - 3 * 24 * 60 * 60 * 1000;
    expect(
      shouldResetStaleMechanicOnline({
        mechanicOnline: true,
        lastHeartbeatAt: daysAgo,
        now,
      }),
    ).toBe(true);
  });

  it("resets a mechanic with no recorded heartbeat at all (legacy persisted state predating this field)", () => {
    expect(
      shouldResetStaleMechanicOnline({ mechanicOnline: true, lastHeartbeatAt: null, now }),
    ).toBe(true);
  });

  it("resets right at the edge of the staleness window", () => {
    expect(
      shouldResetStaleMechanicOnline({
        mechanicOnline: true,
        lastHeartbeatAt: now - PRESENCE_STALE_AFTER_MS - 1,
        now,
      }),
    ).toBe(true);
  });
});
