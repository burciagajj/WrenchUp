-- ============================================================================
-- YOJITAN - RESET TO START OVER (DESTRUCTIVE)
-- ============================================================================
-- This will DELETE ALL profile accounts and related data so you can start fresh.
--
-- HOW TO USE:
-- 1. Go to your Supabase Dashboard → SQL Editor → New query
-- 2. Paste this entire file and RUN.
-- 3. For auth.users (the actual login accounts), this may not be able to delete
--    them directly due to permissions. Use the Node script instead:
--      node scripts/reset-supabase-accounts.mjs --service-key=YOUR_FULL_SERVICE_ROLE_KEY
--    (get the service_role key from Dashboard → Settings → API)
--
-- WARNING: This is irreversible. All users, profiles, vehicles, jobs, requests,
--          mechanic presence, etc. will be gone.
-- ============================================================================

-- Clean public app tables (cascades where possible)
TRUNCATE TABLE public.user_profiles CASCADE;
TRUNCATE TABLE public.user_vehicles CASCADE;
TRUNCATE TABLE public.jobs CASCADE;
TRUNCATE TABLE public.service_requests CASCADE;
TRUNCATE TABLE public.service_messages CASCADE;
TRUNCATE TABLE public.service_disputes CASCADE;
TRUNCATE TABLE public.safety_reports CASCADE;
TRUNCATE TABLE public.safety_flags CASCADE;
TRUNCATE TABLE public.mechanic_presence CASCADE;
TRUNCATE TABLE public.analytics_events CASCADE;

-- If there are other tables with user data added later, add them above.

-- Note on storage:
-- Profile photos and other uploads live in the "profile-photos" bucket.
-- After running this, go to Dashboard → Storage → profile-photos and delete all objects/folders
-- (or run the reset script which tries to clean it with the service key).

-- After this, sign up brand new accounts in the app.
-- The improved signup flow (separate customer / mechanic pages) will work cleanly.

SELECT '✅ Public tables truncated. Now delete auth users via the script or Dashboard → Authentication → Users.' as message;
