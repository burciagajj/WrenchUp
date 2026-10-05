-- Allows an assigned mechanic to safely release a trip when the app's API
-- server is unavailable. The function verifies the authenticated caller
-- before re-opening or re-routing the request.

create or replace function public.release_service_request_from_mechanic(
  p_request_id uuid
)
returns public.service_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.service_requests%rowtype;
  v_next_mechanic_user_id uuid;
  v_next_mechanic_name text;
  v_now timestamptz := now();
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select *
  into v_request
  from public.service_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;

  if v_request.assigned_mechanic_user_id is distinct from auth.uid() then
    raise exception 'Only the assigned mechanic can cancel this trip.' using errcode = '42501';
  end if;

  if v_request.status not in ('searching', 'accepted', 'enroute', 'arrived', 'in_progress') then
    raise exception 'This trip can no longer be cancelled.' using errcode = 'P0001';
  end if;

  select mechanic_user_id, mechanic_name
  into v_next_mechanic_user_id, v_next_mechanic_name
  from public.mechanic_presence
  where is_online = true
    and mechanic_user_id <> auth.uid()
    and mechanic_user_id <> v_request.customer_user_id
    and (v_request.region_code is null or region_code = v_request.region_code)
  order by updated_at asc nulls last
  limit 1;

  update public.service_requests
  set
    status = 'searching',
    assigned_mechanic_user_id = v_next_mechanic_user_id,
    assigned_mechanic_name = v_next_mechanic_name,
    mechanic_offer_sent_at = case when v_next_mechanic_user_id is null then null else v_now end,
    offer_expires_at = case when v_next_mechanic_user_id is null then null else v_now + interval '15 minutes' end,
    customer_quote_accepted_at = null,
    mechanic_accepted_at = null,
    mechanic_latitude = null,
    mechanic_longitude = null,
    mechanic_marked_done_at = null,
    mechanic_enroute_at = null,
    mechanic_arrived_at = null,
    job_started_at = null,
    job_completed_at = null,
    before_photo_url = null,
    after_photo_url = null,
    updated_at = v_now
  where id = v_request.id
  returning * into v_request;

  return v_request;
end;
$$;

revoke all on function public.release_service_request_from_mechanic(uuid) from public;
grant execute on function public.release_service_request_from_mechanic(uuid) to authenticated;
