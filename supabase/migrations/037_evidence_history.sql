-- A mechanic's before/after evidence photos were being permanently nulled
-- out whenever they cancelled/were released mid-job (even from in_progress),
-- with nothing preserved if a dispute arose later after the job reassigned
-- to a different mechanic. This column captures each departing mechanic's
-- photo evidence as an append-only history array before it gets cleared for
-- the next mechanic — see resetOfferedPriceFields()/evidence_history usage
-- in lib/mechanic-cancel-service.ts's releaseServiceRequestFromMechanic.
alter table if exists public.service_requests
  add column if not exists evidence_history jsonb not null default '[]'::jsonb;
