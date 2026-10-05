-- Backfill: applied to the live project on 2026-08-26 as
-- "add_customer_rating_columns" but never saved to the repo. IF NOT EXISTS
-- added so re-running it against the live database is a no-op.
ALTER TABLE service_requests
  ADD COLUMN IF NOT EXISTS customer_rating smallint CHECK (customer_rating IS NULL OR (customer_rating >= 1 AND customer_rating <= 5)),
  ADD COLUMN IF NOT EXISTS customer_rating_comment text;

COMMENT ON COLUMN service_requests.customer_rating IS 'Mechanic''s 1-5 rating of the customer for this job, submitted on app/mechanic/rate-customer.tsx after marking the job done. Mirrors the existing customer-of-mechanic "rating" column, in the other direction.';
COMMENT ON COLUMN service_requests.customer_rating_comment IS 'Optional comment accompanying customer_rating.';
