-- Backfill: applied to the live project on 2026-07-29 as
-- "enable_pg_net_for_sweep_crons" but never saved to the repo.
--
-- pg_cron jobs call the sweep API routes over HTTP via net.http_post (see 049).
create extension if not exists pg_net with schema extensions;
