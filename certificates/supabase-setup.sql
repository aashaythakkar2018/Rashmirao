-- Rhytara certificate dashboard (rhytara.com/certificates) - Supabase setup.
--
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- What is kept: a backup of every certificate PDF (private "certificates"
-- bucket) and one register row per certificate - order number, design,
-- edition and SKU - so no edition or piece is ever certified twice. No
-- customer details are stored here; the buyer's name exists only on the PDF.
--
-- Access model: the dashboard signs people in with Supabase Auth, but being
-- signed in is not enough - an account can only read or write while its
-- email is in public.staff. That holds even if public sign-ups are left on,
-- and the anon key embedded in the page grants nothing by itself.
--
-- Staff can permanently delete a certificate's PDF, then use the guarded
-- delete_certificate function to remove its register entry and email history.

-- --------------------------------------------------------------- staff --
create table if not exists public.staff (
  email      text primary key,
  added_at   timestamptz not null default now()
);
alter table public.staff enable row level security;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

drop policy if exists "staff see their own entry" on public.staff;
create policy "staff see their own entry" on public.staff
  for select to authenticated
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

-- -------------------------------------------------------- certificates --
create table if not exists public.certificates (
  id                   bigint generated always as identity primary key,

  order_number         text not null,
  design_name          text not null,
  design_code          text not null,
  certificate_number   integer not null check (certificate_number >= 1),
  edition_total        integer not null default 250,
  -- The physical saree's SKU, e.g. RHY-EOE-GRS-001/250. The edition number
  -- above is read from it, never generated.
  sku                  text not null,

  pdf_path             text not null,   -- object path in the "certificates" bucket
  issued_by            text default (auth.jwt() ->> 'email'),
  created_at           timestamptz not null default now(),   -- printed as the date of issue

  -- One certificate per edition of a design, and one per physical piece.
  constraint certificates_design_edition_key unique (design_code, certificate_number),
  constraint certificates_sku_key unique (sku)
);
create index if not exists certificates_created_at_idx on public.certificates (created_at desc);

alter table public.certificates enable row level security;

drop policy if exists "staff read certificates" on public.certificates;
create policy "staff read certificates" on public.certificates
  for select to authenticated using (public.is_staff());

drop policy if exists "staff issue certificates" on public.certificates;
create policy "staff issue certificates" on public.certificates
  for insert to authenticated with check (public.is_staff());

-- ------------------------------------------------------ email log --
-- One row each time a certificate is emailed from the dashboard (by the
-- send-certificate function, as the signed-in staff member). The recipient's
-- address is not kept - only that, when and by whom it was sent.
create table if not exists public.certificate_emails (
  id              bigint generated always as identity primary key,
  certificate_id  bigint not null references public.certificates (id),
  sent_by         text default (auth.jwt() ->> 'email'),
  sent_at         timestamptz not null default now()
);
create index if not exists certificate_emails_certificate_idx on public.certificate_emails (certificate_id);

alter table public.certificate_emails enable row level security;

drop policy if exists "staff read email log" on public.certificate_emails;
create policy "staff read email log" on public.certificate_emails
  for select to authenticated using (public.is_staff());

drop policy if exists "staff log emails" on public.certificate_emails;
create policy "staff log emails" on public.certificate_emails
  for insert to authenticated with check (public.is_staff());

-- ------------------------------------------------------ PDF storage --
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('certificates', 'certificates', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

drop policy if exists "staff read certificate pdfs" on storage.objects;
create policy "staff read certificate pdfs" on storage.objects
  for select to authenticated
  using (bucket_id = 'certificates' and public.is_staff());

drop policy if exists "staff upload certificate pdfs" on storage.objects;
create policy "staff upload certificate pdfs" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'certificates' and public.is_staff());

-- Correcting the name on a certificate replaces its PDF.
drop policy if exists "staff replace certificate pdfs" on storage.objects;
create policy "staff replace certificate pdfs" on storage.objects
  for update to authenticated
  using (bucket_id = 'certificates' and public.is_staff())
  with check (bucket_id = 'certificates' and public.is_staff());

drop policy if exists "staff delete certificate pdfs" on storage.objects;
create policy "staff delete certificate pdfs" on storage.objects
  for delete to authenticated
  using (bucket_id = 'certificates' and public.is_staff());

create or replace function public.delete_certificate(certificate_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  certificate_path text;
begin
  if not public.is_staff() then
    raise exception 'Staff access required';
  end if;
  select pdf_path into certificate_path from public.certificates
    where id = certificate_id for update;
  if not found then
    raise exception 'Certificate not found';
  end if;
  if exists (
    select 1 from storage.objects
    where bucket_id = 'certificates' and name = certificate_path
  ) then
    raise exception 'Delete the saved PDF before deleting its register entry';
  end if;
  delete from public.certificate_emails where certificate_emails.certificate_id = delete_certificate.certificate_id;
  delete from public.certificates where id = certificate_id;
end;
$$;
revoke all on function public.delete_certificate(bigint) from public, anon;
grant execute on function public.delete_certificate(bigint) to authenticated;

-- ------------------------------------------------------ staff list --
-- Add everyone who should use the dashboard (their Supabase login email):
--
--   insert into public.staff (email) values ('someone@example.com') on conflict do nothing;
