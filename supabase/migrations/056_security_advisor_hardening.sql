-- Fixes from the Supabase security/performance advisors (2026-10-05).
--
-- 1. SECURITY DEFINER functions were executable by the anon role over
--    /rest/v1/rpc. None of them need signed-out callers:
--      - handle_new_user, protect_mechanic_penalty_columns: trigger-only;
--        nobody should call them directly (triggers don't need EXECUTE).
--      - is_mechanic: used inside RLS policies for signed-in users.
--      - mechanic_offer_throttled_ids, mechanic_service_eligible_ids:
--        dispatch lookups the app calls with the user's session token
--        (lib/live-dispatch.ts).
--      - release_service_request_from_mechanic: mechanic cancel RPC; already
--        rejects anyone but the assigned mechanic, but has no reason to be
--        reachable signed-out.
-- 2. Four functions had no pinned search_path.
-- 3. Three duplicate indexes created outside the repo migrations (each
--    identical to one defined in 001/010) are dropped.

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.protect_mechanic_penalty_columns() from public, anon, authenticated;

revoke execute on function public.is_mechanic() from public, anon;
revoke execute on function public.mechanic_offer_throttled_ids(uuid[]) from public, anon;
revoke execute on function public.mechanic_service_eligible_ids(uuid[], text) from public, anon;
revoke execute on function public.release_service_request_from_mechanic(uuid) from public, anon;
grant execute on function public.is_mechanic() to authenticated, service_role;
grant execute on function public.mechanic_offer_throttled_ids(uuid[]) to authenticated, service_role;
grant execute on function public.mechanic_service_eligible_ids(uuid[], text) to authenticated, service_role;
grant execute on function public.release_service_request_from_mechanic(uuid) to authenticated, service_role;

alter function public.haversine_miles(double precision, double precision, double precision, double precision) set search_path = public;
alter function public.handle_new_user() set search_path = public;
alter function public.set_updated_at() set search_path = public;
alter function public.protect_service_request_money() set search_path = public;

drop index if exists public.service_messages_request_created_idx;
drop index if exists public.idx_user_profiles_user_id;
drop index if exists public.idx_user_vehicles_user_id;
