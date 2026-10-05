-- Platform-leakage defense, layer 1: hide contact details in chat.
--
-- Customers and mechanics could swap phone numbers / payment handles in chat,
-- cancel for free before the mechanic drives, and settle off-platform. This
-- redacts contact info in the database itself (BEFORE INSERT trigger), so an
-- old or modified client can't bypass it. app/api/chat-notify+api.ts calls
-- redact_contact_info() over RPC so push previews are redacted the same way.
--
-- Redacted (replaced with "[contact info hidden]"):
--   - email addresses
--   - phone-like digit runs with 7+ digits (spaces, dots, dashes, parens ok)
--   - @handles and $cashtags
--   - wa.me / t.me / instagram / facebook / venmo / cash.app / paypal links
--   - off-platform keywords in English and Spanish (WhatsApp, Venmo, Zelle,
--     "call me", "text me", "llámame", "mi número", "en efectivo", ...)
--
-- Mechanic price offers are stored as 'OFFER_JSON:{...}' (lib/mechanic-offer.ts)
-- and contain UUIDs; only their free-text "note" is filtered so the offer
-- still parses.

alter table public.service_messages
  add column if not exists contact_info_redacted boolean not null default false;

comment on column public.service_messages.contact_info_redacted is
  'True when the redact_contact_info trigger changed this message. Set by the database only.';

create or replace function public.redact_contact_info(p_text text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := p_text;
  m text;
  j jsonb;
  v_note text;
  v_clean_note text;
  hidden constant text := '[contact info hidden]';
begin
  if v is null or v = '' then
    return v;
  end if;

  if left(v, 11) = 'OFFER_JSON:' then
    begin
      j := substr(v, 12)::jsonb;
      if jsonb_typeof(j -> 'note') = 'string' then
        v_note := j ->> 'note';
        v_clean_note := public.redact_contact_info(v_note);
        if v_clean_note is distinct from v_note then
          return 'OFFER_JSON:' || jsonb_set(j, '{note}', to_jsonb(v_clean_note))::text;
        end if;
      end if;
      return v;
    exception when others then
      null; -- not valid JSON: fall through and filter it as plain text
    end;
  end if;

  -- Links to messaging / payment apps.
  v := regexp_replace(
    v,
    '(https?://)?(www\.)?(wa\.me|api\.whatsapp\.com|t\.me|m\.me|instagram\.com|facebook\.com|fb\.me|venmo\.com|cash\.app|paypal\.me|paypal\.com|linktr\.ee)\S*',
    hidden, 'gi');

  -- "insta: carfixer", "wsp = 5512..." — hide the handle that follows an app name.
  v := regexp_replace(
    v,
    '\m(ig|insta|instagram|fb|facebook|snap|snapchat|telegram|tg|whats\s*app|wsp|venmo|zelle|paypal|cash\s*app)\s*[:=]\s*\S+',
    hidden, 'gi');

  -- Emails (before @handles so the handle rule doesn't split them).
  v := regexp_replace(v, '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}', hidden, 'g');

  -- @handles and $cashtags ($ followed by a letter, so prices like $45 stay).
  v := regexp_replace(v, '(^|[^A-Za-z0-9_])@[A-Za-z0-9_.]{2,}', '\1' || hidden, 'g');
  v := regexp_replace(v, '(^|[^A-Za-z0-9_])\$[A-Za-z][A-Za-z0-9_-]+', '\1' || hidden, 'g');

  -- Phone numbers: any run of digits/separators holding 7+ digits.
  for m in select (regexp_matches(v, '\+?\(?\d[\d\s().-]{5,}\d', 'g'))[1] loop
    if length(regexp_replace(m, '\D', '', 'g')) >= 7 then
      v := replace(v, m, hidden);
    end if;
  end loop;

  -- Off-platform keywords and phrases.
  v := regexp_replace(
    v,
    '\m(whats\s*app|watsapp|wsp|telegram|venmo|cash\s*app|zelle|paypal|instagram|insta|snapchat|facebook'
      || '|call\s+me|text\s+me|my\s+number|my\s+cell|my\s+phone|phone\s+number|cell\s+number'
      || '|pay\s+(you\s+)?(in\s+)?cash|cash\s+only'
      || '|ll[aá]mame|m[aá]rcame|mi\s+n[uú]mero|mi\s+cel(ular)?|mi\s+tel[eé]fono|en\s+efectivo)\M',
    hidden, 'gi');

  return v;
end;
$$;

revoke all on function public.redact_contact_info(text) from public, anon;
grant execute on function public.redact_contact_info(text) to authenticated, service_role;

create or replace function public.service_messages_redact_contact_info()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_clean text;
begin
  v_clean := public.redact_contact_info(new.message);
  if tg_op = 'INSERT' then
    new.contact_info_redacted := v_clean is distinct from new.message;
  else
    new.contact_info_redacted := old.contact_info_redacted or (v_clean is distinct from new.message);
  end if;
  new.message := v_clean;
  return new;
end;
$$;

revoke all on function public.service_messages_redact_contact_info() from public, anon, authenticated;

drop trigger if exists service_messages_redact_contact_info on public.service_messages;
create trigger service_messages_redact_contact_info
  before insert or update of message on public.service_messages
  for each row execute function public.service_messages_redact_contact_info();
