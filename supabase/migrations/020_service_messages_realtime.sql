-- Enable Supabase Realtime for service_messages so chat notifications arrive promptly.
-- Safe to re-run; skips the table if it is already in the publication.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'service_messages'
  ) then
    alter publication supabase_realtime add table public.service_messages;
  end if;
end $$;
