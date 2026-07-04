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
  -- Set once the member has acknowledged the in-app messaging guidelines —
  -- see the CHAT & MESSAGING section below. Shown once, not on every chat.
  chat_guidelines_accepted_at timestamptz,
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
  has_photo, photo_path, chat_guidelines_accepted_at
) on public.profiles to authenticated;

-- Supabase grants SELECT on every column of every new table to `authenticated`
-- by default; RLS above only ever restricted which ROWS are visible. Without
-- this, any active member could read another member's contact_email straight
-- out of the API response (dev tools, not even the UI) even after the "Send a
-- Message" button replaced the visible mailto link — collecting everyone's
-- email during one paid month and never subscribing again. Stripe identifiers
-- are dropped too since nothing client-side legitimately needs them.
revoke select on public.profiles from authenticated;
grant select (
  id, ref_code, gender, age, height, qualifications, employment, residential_status,
  city, county, country, is_ahmadi, local_jamaat, had_previous, previous_type,
  previous_duration, has_children, preference_line, country_looking_in,
  consider_pakistan, additional_note, about, has_photo, photo_path,
  plan, subscription_status, is_admin, chat_guidelines_accepted_at, created_at
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

-- Blocking is defined here (ahead of where it's first used, in the policy
-- just below) even though the full BLOCKING & REPORTING section lives later
-- in this file — blocks needs to exist before profiles_select_active_members
-- can reference it, and that policy has to sit next to profiles' other ones.
create table if not exists public.blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (blocker_id <> blocked_id),
  unique (blocker_id, blocked_id)
);

alter table public.blocks enable row level security;

create or replace function public.is_blocked_pair(a uuid, b uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;

create policy "profiles_select_active_members" on public.profiles
  for select using (
    subscription_status = 'active' and public.is_active_member()
    and not public.is_blocked_pair(auth.uid(), id)
  );

-- Without this, a member can never resolve the ref_code of someone they've
-- blocked — the exclusion above hides blocked profiles from each other
-- entirely, which also breaks "who have I blocked" in account.html. Seeing
-- someone you've chosen to block isn't a privacy issue; RLS policies are
-- OR'd together, so this just restores visibility for that one specific case.
create policy "profiles_select_blocked_by_me" on public.profiles
  for select using (
    exists (select 1 from public.blocks where blocker_id = auth.uid() and blocked_id = profiles.id)
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
-- 6. PENDING SIGNUPS
-- ============================================================
-- The signup wizard collects everything (profile fields, chosen password, an
-- optional photo) but must NOT create the auth account or profile row until
-- Stripe actually confirms payment — otherwise someone who abandons or never
-- completes Checkout would still end up with a working (if "pending") account
-- able to log in and, depending on RLS timing, potentially browse. Instead,
-- everything is staged here; the stripe-webhook function is the only thing
-- that ever turns a row here into a real account, and only once
-- checkout.session.completed actually fires for it.
--
-- photo_data_url briefly holds the optional photo as a base64 data URL (the
-- browser can't upload to a user-scoped storage path before that user
-- exists) — the webhook decodes and uploads it to profile-photos once the
-- real account is created, then this row (password included) is deleted.
-- There is deliberately no select policy: only service-role functions can
-- ever read a row here, including the plaintext password it briefly holds.
create table if not exists public.pending_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  password text not null,
  profile_data jsonb not null,
  photo_data_url text,
  plan text not null check (plan in ('monthly','annual')),
  stripe_checkout_session_id text,
  created_at timestamptz not null default now()
);

alter table public.pending_signups enable row level security;

create policy "pending_signups_insert_anyone" on public.pending_signups
  for insert with check (true);

grant insert on public.pending_signups to anon, authenticated;

-- ============================================================
-- 7. CHAT & MESSAGING
-- ============================================================
-- Replaces the old "Contact via Email" reveal. That approach let one paid
-- month's worth of unlocked profiles turn into a permanent contact list — no
-- reason to ever subscribe again once every email address of interest had
-- been copied down. Contact details are never exposed to other members at
-- all now (see the profiles SELECT column grant above); everyone
-- communicates through this in-app chat instead, which stays subject to the
-- exact same "must be an active, paying member" gate as browsing search.

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  -- Always stored with member_a < member_b (enforced below) so a pair of
  -- members can only ever have one conversation between them, however it was
  -- opened, without needing an order-independent unique expression index.
  member_a uuid not null references public.profiles(id) on delete cascade,
  member_b uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  check (member_a < member_b),
  unique (member_a, member_b)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  -- Set automatically by the trigger below when a message looks like it's
  -- trying to share contact details — the exact leak this feature exists to
  -- close. Flagged messages still send; nothing here blocks a conversation,
  -- it only queues the message for admin review.
  flagged boolean not null default false,
  flag_reason text,
  -- A member can also flag a message themselves (e.g. harassment, anything
  -- against the chat guidelines) — see the update policy/grant below.
  reported boolean not null default false,
  reported_reason text,
  reviewed_by_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- The only way a conversation ever gets created — never a direct client
-- insert — so the member_a < member_b ordering and the "both members must be
-- active" rule are always enforced in one place.
create or replace function public.get_or_create_conversation(other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  a uuid;
  b uuid;
  conv_id uuid;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;
  if me = other_user_id then
    raise exception 'Cannot message yourself';
  end if;
  if not public.is_active_member() then
    raise exception 'An active membership is required to message other members';
  end if;
  if not exists (select 1 from public.profiles where id = other_user_id and subscription_status = 'active') then
    raise exception 'That member is not currently active';
  end if;
  if public.is_blocked_pair(me, other_user_id) then
    raise exception 'You cannot message this member';
  end if;

  if me < other_user_id then a := me; b := other_user_id;
  else a := other_user_id; b := me;
  end if;

  select id into conv_id from public.conversations where member_a = a and member_b = b;
  if conv_id is null then
    insert into public.conversations (member_a, member_b) values (a, b) returning id into conv_id;
  end if;
  return conv_id;
end;
$$;

grant execute on function public.get_or_create_conversation(uuid) to authenticated;

-- Only ever your own conversations, and only while you're an active member —
-- this is the "chats are locked until you pay" rule: losing active status
-- doesn't delete history, it just stops it (and everything else) being
-- readable until the subscription is active again.
create policy "conversations_select_own" on public.conversations
  for select using (
    (auth.uid() = member_a or auth.uid() = member_b) and public.is_active_member()
  );

create policy "messages_select_own_conversation" on public.messages
  for select using (
    public.is_active_member()
    and exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and (c.member_a = auth.uid() or c.member_b = auth.uid())
    )
  );

create policy "messages_insert_own_conversation" on public.messages
  for insert with check (
    sender_id = auth.uid()
    and public.is_active_member()
    and exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and (c.member_a = auth.uid() or c.member_b = auth.uid())
        and not public.is_blocked_pair(c.member_a, c.member_b)
    )
  );

grant insert on public.messages to authenticated;

-- Members can flag a message in their own conversation (reported/reported_reason
-- only — column grants stop them from editing anything else, including body).
create policy "messages_update_report_own_conversation" on public.messages
  for update using (
    public.is_active_member()
    and exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and (c.member_a = auth.uid() or c.member_b = auth.uid())
    )
  );

revoke update on public.messages from authenticated;
grant update (reported, reported_reason) on public.messages to authenticated;

-- Auto-flags messages that look like an attempt to share contact details —
-- email addresses, phone-number-like digit runs, or spelled-out obfuscations
-- like "name at gmail dot com". Deliberately loose/over-inclusive: false
-- positives just mean an admin reviews an innocent message, but a missed
-- real one defeats the entire point of moving off email in the first place.
create or replace function public.flag_contact_info_in_message()
returns trigger
language plpgsql
as $$
begin
  if new.body ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}'
     or new.body ~* '(\+?\d[\d\s().-]{7,}\d)'
     or new.body ~* '[a-z0-9._%-]+\s*[\(\[]?\s*at\s*[\)\]]?\s*[a-z0-9.-]+\s*[\(\[]?\s*dot\s*[\)\]]?\s*[a-z]{2,}'
  then
    new.flagged := true;
    new.flag_reason := coalesce(new.flag_reason, 'auto: message looks like it may contain contact details');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_flag_contact_info on public.messages;
create trigger trg_flag_contact_info
  before insert on public.messages
  for each row execute function public.flag_contact_info_in_message();

create or replace function public.touch_conversation_last_message()
returns trigger
language plpgsql
as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists trg_touch_conversation on public.messages;
create trigger trg_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation_last_message();

-- ============================================================
-- 8. BLOCKING & REPORTING
-- ============================================================
-- The blocks table itself lives up in section 3 (profiles' RLS policies
-- need it to exist first) — this is just its own policies, plus profile
-- reports, which nothing else depends on.

-- A member manages only their own block list: who they've blocked, and
-- unblocking (delete). There's no way to see who has blocked *you* — that's
-- deliberate, same reasoning as most platforms with this feature.
create policy "blocks_select_own" on public.blocks
  for select using (blocker_id = auth.uid());

create policy "blocks_insert_own" on public.blocks
  for insert with check (blocker_id = auth.uid() and public.is_active_member());

create policy "blocks_delete_own" on public.blocks
  for delete using (blocker_id = auth.uid());

grant select, insert, delete on public.blocks to authenticated;

-- Reporting a whole profile (fake account, inappropriate photo/bio, etc.) —
-- separate from reporting an individual chat message. Admin-only read, same
-- as consultation_requests and messages' flag/report fields.
create table if not exists public.profile_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 1000),
  reviewed_by_admin boolean not null default false,
  created_at timestamptz not null default now(),
  check (reporter_id <> reported_id)
);

alter table public.profile_reports enable row level security;

create policy "profile_reports_insert_own" on public.profile_reports
  for insert with check (reporter_id = auth.uid() and public.is_active_member());

grant insert on public.profile_reports to authenticated;

-- ============================================================
-- 9. FIRST ADMIN
-- ============================================================
-- After you've created your own account through the normal signup flow once,
-- run this (with your real user id from auth.users) to make yourself an admin:
--
-- update public.profiles set is_admin = true where id = '<your-user-id>';
