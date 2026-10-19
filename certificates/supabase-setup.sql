-- Rhytara certificate dashboard (rhytara.com/certificates) - Supabase setup.
--
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- Access model: the dashboard signs people in with Supabase Auth, but being
-- signed in is not enough - an account can only read or write certificates
-- while its email is in public.staff. That holds even if public sign-ups are
-- left on, and the anon key embedded in the page grants nothing by itself.
--
-- History is permanent: there is no delete policy on certificates or their
-- PDFs, and a certificate's order, design, edition and SKU can't be changed
-- after it is issued (only the customer's name/email, to correct typos).

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
  customer_first_name  text not null,
  customer_last_name   text,
  customer_email       text not null,

  design_name          text not null,
  design_code          text not null,
  certificate_number   integer not null check (certificate_number >= 1),
  edition_total        integer not null default 250,
  -- The physical saree's SKU, e.g. RHY-EOE-GRS-001/250. The edition number
  -- above is read from it, never generated.
  sku                  text,

  pdf_path             text,      -- object path in the "certificates" bucket
  status               text not null default 'pending'
                       check (status in ('pending', 'generated', 'failed')),
  error_message        text,

  issued_by            text default (auth.jwt() ->> 'email'),
  created_at           timestamptz not null default now(),   -- printed as the date of issue
  updated_at           timestamptz not null default now(),

  -- One certificate per edition of a design, and one per physical piece.
  constraint certificates_design_edition_key unique (design_code, certificate_number)
);
create unique index if not exists certificates_sku_key on public.certificates (sku) where sku is not null;
create index if not exists certificates_created_at_idx on public.certificates (created_at desc);

create or replace function public.certificates_before_update()
returns trigger
language plpgsql
as $$
begin
  if new.order_number       is distinct from old.order_number
  or new.design_name        is distinct from old.design_name
  or new.design_code        is distinct from old.design_code
  or new.certificate_number is distinct from old.certificate_number
  or new.edition_total      is distinct from old.edition_total
  or new.sku                is distinct from old.sku
  or new.issued_by          is distinct from old.issued_by
  or new.created_at         is distinct from old.created_at then
    raise exception 'A certificate''s order, design, edition and SKU can''t be changed after it is issued.';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists certificates_before_update on public.certificates;
create trigger certificates_before_update
  before update on public.certificates
  for each row execute function public.certificates_before_update();

alter table public.certificates enable row level security;

drop policy if exists "staff read certificates" on public.certificates;
create policy "staff read certificates" on public.certificates
  for select to authenticated using (public.is_staff());

drop policy if exists "staff issue certificates" on public.certificates;
create policy "staff issue certificates" on public.certificates
  for insert to authenticated with check (public.is_staff());

drop policy if exists "staff update certificates" on public.certificates;
create policy "staff update certificates" on public.certificates
  for update to authenticated using (public.is_staff()) with check (public.is_staff());

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

-- Regenerating a PDF (e.g. after a name correction) replaces the file.
drop policy if exists "staff replace certificate pdfs" on storage.objects;
create policy "staff replace certificate pdfs" on storage.objects
  for update to authenticated
  using (bucket_id = 'certificates' and public.is_staff())
  with check (bucket_id = 'certificates' and public.is_staff());

-- ------------------------------------------------------ staff list --
-- Add everyone who should use the dashboard (their Supabase login email):
--
--   insert into public.staff (email) values ('someone@example.com') on conflict do nothing;
