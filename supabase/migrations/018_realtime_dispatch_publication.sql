-- Enable Supabase Realtime for live dispatch tables.
-- Run once per project; safe to re-run (skips tables already in publication).

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'service_requests'
  ) then
    alter publication supabase_realtime add table public.service_requests;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'mechanic_presence'
  ) then
    alter publication supabase_realtime add table public.mechanic_presence;
  end if;
end $$;
