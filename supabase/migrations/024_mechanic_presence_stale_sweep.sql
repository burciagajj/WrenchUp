-- Yojitan — Step 24: server-side backstop for stale mechanic presence.
--
-- The app's routing queries (fetchOnlineMechanics, fetchNextMechanic) now filter
-- out is_online rows with a stale updated_at, but that's enforced in app code.
-- This adds a DB-level backstop via pg_cron that periodically flips genuinely
-- stale rows back to is_online = false, so the column itself stays accurate for
-- anything that reads it directly (e.g. future admin dashboards) without going
-- through the app's freshness filter.
--
-- Cutoff (4 minutes) mirrors PRESENCE_STALE_AFTER_MS in lib/mechanic-presence-core.ts
-- (2x the 2-minute client heartbeat). Keep these in sync if either changes.

create extension if not exists pg_cron;

select cron.schedule(
  'mechanic-presence-stale-sweep',
  '*/2 * * * *',
  $$
  update public.mechanic_presence
  set is_online = false
  where is_online = true
    and updated_at < now() - interval '4 minutes';
  $$
);
