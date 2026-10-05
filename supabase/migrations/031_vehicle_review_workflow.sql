-- Vehicle identity-verification review workflow: previously approval_status
-- on user_vehicles always stayed "pending" because no admin surface ever
-- changed it. Adds the review audit trail columns to match the existing
-- mechanic-verification review pattern (rejection_reason/reviewed_at/reviewed_by).
alter table public.user_vehicles
  add column if not exists rejection_reason text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid;

comment on column public.user_vehicles.approval_status is
  'pending (default) | approved | rejected — set by an admin via /admin/vehicle-review, mirroring mechanic verification.';

-- Private storage bucket for vehicle insurance/registration documents.
-- Previously vehicle-form.tsx stored the local device file URI directly as
-- insurance_doc_url/registration_sticker_url, so nothing was ever actually
-- uploaded anywhere an admin could view it. Uploads now go through
-- /api/vehicle-doc (service-role, mirrors /api/mechanic-doc).
insert into storage.buckets (id, name, public)
values ('vehicle-documents', 'vehicle-documents', false)
on conflict (id) do nothing;
