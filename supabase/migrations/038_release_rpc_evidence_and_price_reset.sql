-- release_service_request_from_mechanic() is the offline-fallback path for
-- mechanic-cancel-service.ts's releaseServiceRequestFromMechanic (used when
-- the app's API server is unreachable — see releaseDispatchFromMechanic() in
-- lib/live-dispatch.ts). It was never updated when the equivalent JS path
-- got two fixes:
--   1. Resetting offered_price/platform_fee_amount/mechanic_payout back to
--      base_offered_price on reassignment, so a departing mechanic's
--      never-agreed-to counter-offer can't silently survive onto whoever
--      gets matched next (the critical money bug fixed in
--      deriveResetOfferedPriceFields()/resetOfferedPriceFields()).
--   2. Preserving before/after evidence photos into evidence_history instead
--      of permanently destroying them on release (037_evidence_history.sql).
-- This migration brings the RPC in line with both fixes.
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
  v_baseline numeric;
  v_fee_rate numeric;
  v_service_portion numeric;
  v_fee_amount numeric;
  v_evidence_entry jsonb;
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

  v_baseline := coalesce(nullif(v_request.base_offered_price, 0), v_request.offered_price);
  v_fee_rate := coalesce(v_request.platform_fee_rate, 0.18);
  v_service_portion := round(v_baseline / (1 + v_fee_rate), 2);
  v_fee_amount := round(v_baseline - v_service_portion, 2);

  if v_request.before_photo_url is not null or v_request.after_photo_url is not null then
    v_evidence_entry := jsonb_build_object(
      'mechanic_user_id', auth.uid(),
      'mechanic_name', v_request.assigned_mechanic_name,
      'before_photo_url', v_request.before_photo_url,
      'after_photo_url', v_request.after_photo_url,
      'released_at', v_now
    );
  else
    v_evidence_entry := null;
  end if;

  update public.service_requests
  set
    status = 'searching',
    assigned_mechanic_user_id = v_next_mechanic_user_id,
    assigned_mechanic_name = v_next_mechanic_name,
    mechanic_offer_sent_at = case when v_next_mechanic_user_id is null then null else v_now end,
    offer_expires_at = case when v_next_mechanic_user_id is null then null else v_now + interval '15 minutes' end,
    mechanic_offer_price_sent_at = null,
    offered_price = v_baseline,
    platform_fee_amount = v_fee_amount,
    mechanic_payout = v_service_portion,
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
    evidence_history = case
      when v_evidence_entry is null then evidence_history
      else coalesce(evidence_history, '[]'::jsonb) || jsonb_build_array(v_evidence_entry)
    end,
    updated_at = v_now
  where id = v_request.id
  returning * into v_request;

  return v_request;
end;
$$;

revoke all on function public.release_service_request_from_mechanic(uuid) from public;
grant execute on function public.release_service_request_from_mechanic(uuid) to authenticated;
