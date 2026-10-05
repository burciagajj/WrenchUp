-- Backfill: applied to the live project on 2026-08-06 as
-- "update_cron_jobs_to_stable_production_url" but never saved to the repo.
--
-- Schedules the two server sweeps:
--   offer-expiry-sweep     every 2 minutes
--   payment-capture-sweep  every 15 minutes (captures/releases holds, charges
--                          cancellation fees, pays mechanics)
--
-- The live version embeds the real CRON_SECRET. It is replaced with the
-- <CRON_SECRET> placeholder here so the secret never lands in git. Before
-- running this against a fresh project, substitute the value of CRON_SECRET
-- from the server environment. cron.unschedule() errors if a job doesn't
-- exist yet, so drop those two lines on a brand-new database.
--
-- Ordering note: this ran live before 047, which later tightened
-- payment-capture-sweep to every 2 minutes (the current live schedule). On a
-- fresh database, run this before 047 or re-apply 047's cron.alter_job after.
select cron.unschedule('offer-expiry-sweep');
select cron.unschedule('payment-capture-sweep');

select cron.schedule(
  'offer-expiry-sweep',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := 'https://wrenchup.expo.app/api/offer-expiry-sweep',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer <CRON_SECRET>"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

select cron.schedule(
  'payment-capture-sweep',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://wrenchup.expo.app/api/payment-capture-sweep',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer <CRON_SECRET>"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
