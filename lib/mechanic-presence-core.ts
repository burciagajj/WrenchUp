export type MechanicPresenceProfile = {
  role?: string | null;
  verification_status?: string | null;
};

/** Must match the client heartbeat interval in components/mechanic-live-job-sync.tsx. */
export const PRESENCE_HEARTBEAT_MS = 2 * 60 * 1000;
/**
 * A presence row older than this is treated as offline for routing purposes,
 * even if is_online is still true (e.g. the app crashed/was killed and never
 * got to flip the flag). Two missed heartbeats' worth of grace.
 */
export const PRESENCE_STALE_AFTER_MS = PRESENCE_HEARTBEAT_MS * 2;

/** ISO timestamp cutoff: presence rows updated before this are stale. */
export function presenceStaleCutoffIso(now: Date = new Date()): string {
  return new Date(now.getTime() - PRESENCE_STALE_AFTER_MS).toISOString();
}

/**
 * Defense-in-depth filter for presence rows already fetched with `is_online=true`.
 * Drops rows with a missing/unparseable/stale `updated_at`, independent of whatever
 * server-side query filter was (or wasn't) applied.
 */
export function filterFreshMechanicPresence<T extends { updated_at?: string | null }>(
  rows: T[],
  now: Date = new Date(),
): T[] {
  const cutoff = now.getTime() - PRESENCE_STALE_AFTER_MS;
  return rows.filter((row) => {
    if (!row.updated_at) return false;
    const ts = Date.parse(row.updated_at);
    return Number.isFinite(ts) && ts >= cutoff;
  });
}

/**
 * Decides whether a rehydrated "online" toggle should be reset to offline on
 * cold start. Covers the case where the app was killed (not just
 * backgrounded — that's handled live by the AppState listener in
 * mechanic-live-job-sync.tsx) while `mechanicOnline` was true: no heartbeat
 * ever reaches the server again, so without this check the toggle would
 * rehydrate as "online" indefinitely, even after days, instead of requiring
 * the mechanic to explicitly go back online.
 */
export function shouldResetStaleMechanicOnline(input: {
  mechanicOnline: boolean;
  lastHeartbeatAt: number | null | undefined;
  now?: number;
}): boolean {
  if (!input.mechanicOnline) return false;
  const now = input.now ?? Date.now();
  const lastHeartbeat = typeof input.lastHeartbeatAt === "number" ? input.lastHeartbeatAt : 0;
  return now - lastHeartbeat > PRESENCE_STALE_AFTER_MS;
}

export function canMechanicGoOnline(profile: MechanicPresenceProfile | null | undefined): {
  ok: boolean;
  reason?: "not_mechanic" | "not_approved";
} {
  if (!profile || profile.role !== "mechanic") {
    return { ok: false, reason: "not_mechanic" };
  }
  if (profile.verification_status !== "approved") {
    return { ok: false, reason: "not_approved" };
  }
  return { ok: true };
}

export function buildMechanicPresencePayload(input: {
  isOnline: boolean;
  mechanicName: string;
  regionCode?: "US" | "MX";
}): Record<string, unknown> {
  return {
    is_online: input.isOnline,
    mechanic_name: input.mechanicName,
    region_code: input.regionCode ?? undefined,
    updated_at: new Date().toISOString(),
  };
}
