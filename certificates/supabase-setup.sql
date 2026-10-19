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
-- The register is append-only: rows can be added but never edited or
-- deleted, and PDFs can be replaced (to correct a name) but never deleted.

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

-- ------------------------------------------------------ staff list --
-- Add everyone who should use the dashboard (their Supabase login email):
--
--   insert into public.staff (email) values ('someone@example.com') on conflict do nothing;
