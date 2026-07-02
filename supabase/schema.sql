-- Virtual Rishta Naata — Supabase schema
-- Run this once in your Supabase project's SQL Editor (Project > SQL Editor > New query).

-- ============================================================
-- 1. PROFILES TABLE
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  ref_code text unique,
  gender text not null check (gender in ('M','F')),
  age int not null check (age between 18 and 90),
  height text,
  qualifications text,
  employment text,
  residential_status text,
  city text,
  county text,
  country text,                 -- country of residence (shown on search card)
  is_ahmadi boolean,
  local_jamaat text,
  had_previous boolean,          -- previous engagement, Nikah, or marriage
  previous_type text check (previous_type in ('Engagement','Nikah','Marriage')),
  previous_duration text,
  has_children boolean,
  preference_line text,
  country_looking_in text,
  consider_pakistan boolean,
  additional_note text,
  about text,
  contact_email text not null,
  has_photo boolean not null default false,
  photo_path text,               -- storage path in the profile-photos bucket, males only
  plan text check (plan in ('monthly','annual')),
  subscription_status text not null default 'pending' check (subscription_status in ('pending','active','cancelled','past_due')),
  stripe_customer_id text,
  stripe_subscription_id text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- ============================================================
-- 2. REFERENCE CODE GENERATION
-- ============================================================
create or replace function public.generate_ref_code()
returns text
language plpgsql
as $$
declare
  candidate text;
  exists_already boolean;
begin
  loop
    candidate := 'VRN-' || (1000 + floor(random() * 9000))::int;
    select exists(select 1 from public.profiles where ref_code = candidate) into exists_already;
    exit when not exists_already;
  end loop;
  return candidate;
end;
$$;

create or replace function public.set_ref_code()
returns trigger
language plpgsql
as $$
begin
  if new.ref_code is null then
    new.ref_code := public.generate_ref_code();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_ref_code on public.profiles;
create trigger trg_set_ref_code
  before insert on public.profiles
  for each row execute function public.set_ref_code();

-- ============================================================
-- 3. ROW LEVEL SECURITY POLICIES
-- ============================================================
-- Members can always read and manage their own row.
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

-- The row-ownership check alone doesn't stop someone from setting is_admin
-- or subscription_status themselves in the same insert that creates their
-- profile — RLS only restricts which rows, not which column values, are
-- allowed. This WITH CHECK forces every new profile to start pending,
-- unpaid, and non-admin; only the service-role webhook/admin functions can
-- change those fields afterward.
create policy "profiles_insert_own" on public.profiles
  for insert with check (
    auth.uid() = id
    and coalesce(is_admin, false) = false
    and coalesce(subscription_status, 'pending') = 'pending'
    and plan is null
    and stripe_customer_id is null
    and stripe_subscription_id is null
  );

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- IMPORTANT: the policy above only checks *row ownership*, not which columns
-- changed — Postgres RLS alone would let a member set their own is_admin or
-- subscription_status to whatever they like. Column-level GRANTs close that:
-- members can only ever write the fields that make up their own profile
-- content. Everything else (ref_code, is_admin, subscription_status, plan,
-- stripe_customer_id, stripe_subscription_id) can only change via the
-- service-role key inside supabase/functions/ (webhooks, admin actions) or
-- the set_ref_code trigger.
revoke update on public.profiles from authenticated;
grant update (
  gender, age, height, qualifications, employment, residential_status,
  city, county, country, is_ahmadi, local_jamaat, had_previous,
  previous_type, previous_duration, has_children,
  preference_line, country_looking_in,
  consider_pakistan, additional_note, about, contact_email,
  has_photo, photo_path
) on public.profiles to authenticated;

-- Any active, paying member can view the full details of another active member.
-- (The "reference code / age / country only" preview on the search page is a
-- front-end presentation choice — the underlying row is the same one exposed here.)
--
-- This needs a SECURITY DEFINER helper rather than a plain subquery: a policy
-- on `profiles` that queries `profiles` again triggers the same policy for
-- that inner query too, which recurses infinitely. A security definer
-- function owned by the table owner bypasses RLS for just that inner lookup.
create or replace function public.is_active_member()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and subscription_status = 'active'
  );
$$;

create policy "profiles_select_active_members" on public.profiles
  for select using (
    subscription_status = 'active' and public.is_active_member()
  );

-- No delete/insert/update policy for other users' rows, and no policy at all for
-- is_admin — admin reads/writes/deletes go through the service-role Edge Functions
-- in supabase/functions/, which never run in the browser and independently verify
-- the caller's is_admin flag before doing anything privileged. This keeps the
-- service role key off the client entirely.

-- ============================================================
-- 4. PHOTO STORAGE (male-only, optional)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('profile-photos', 'profile-photos', false)
on conflict (id) do nothing;

-- Members can only upload into a folder named after their own user id.
create policy "profile_photos_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "profile_photos_select_own" on storage.objects
  for select using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "profile_photos_delete_own" on storage.objects
  for delete using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Cross-member photo viewing (member A viewing member B's optional photo) is
-- deliberately NOT a storage policy — it goes through the get-profile-photo
-- Edge Function, which checks gender + has_photo + both members' subscription
-- status, then hands back a short-lived signed URL. That keeps photos from
-- being enumerable via the storage API directly.

-- ============================================================
-- 5. CONSULTATION REQUESTS
-- ============================================================
-- The Services page's booking form. Open to anyone (even visitors who
-- haven't created a profile yet), since consultations are available to all
-- members equally. The client inserts directly (RLS below) and separately
-- notifies the team via EmailJS, sent straight from the browser — nothing
-- server-side is needed for this flow. Only admins can read these rows,
-- e.g. via the Supabase dashboard's Table Editor or a future admin view.
create table if not exists public.consultation_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  ref_code text,
  phone text,
  message text,
  status text not null default 'new' check (status in ('new','contacted','completed')),
  -- Set to 'paid' only by the stripe-webhook function once Stripe confirms the
  -- £35 payment — never trust the client for this. Rows can exist as 'unpaid'
  -- if someone abandons Stripe Checkout before paying.
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','paid','refunded')),
  stripe_checkout_session_id text,
  created_at timestamptz not null default now()
);

alter table public.consultation_requests enable row level security;

create policy "consultation_requests_insert_anyone" on public.consultation_requests
  for insert with check (true);

grant insert on public.consultation_requests to anon, authenticated;

-- ============================================================
-- 6. FIRST ADMIN
-- ============================================================
-- After you've created your own account through the normal signup flow once,
-- run this (with your real user id from auth.users) to make yourself an admin:
--
-- update public.profiles set is_admin = true where id = '<your-user-id>';
