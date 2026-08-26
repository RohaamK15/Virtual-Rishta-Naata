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
  immigration_status text check (immigration_status in ('Citizen','Permanent Resident / ILR','Work Visa','Student Visa','Spouse/Family Visa','Asylum Seeker/Refugee','Other')),
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
  photo_path text,               -- storage path in the profile-photos bucket, either gender
  -- null until a photo is uploaded. Reset to 'pending' automatically whenever
  -- photo_path changes (see trg_reset_photo_status below) — members never get
  -- direct write access to this column, only admins (service role) can set it
  -- to 'approved'/'rejected', via admin-review-photo. A pending/rejected photo
  -- is never shown to other members — see get-profile-photo.
  photo_status text check (photo_status in ('pending','approved','rejected')),
  photo_rejection_reason text,
  -- Whole-profile moderation, independent of photo_status. Starts 'pending' the
  -- moment a profile is created (see submit-profile-for-review) and is reset back to
  -- 'pending' automatically whenever any member-editable content field changes
  -- (see trg_reset_profile_status below) — same reasoning as photo_status:
  -- members never get direct write access, only admins via admin-review-profile.
  -- Gates search visibility (profiles_select_active_members) AND the member's
  -- own ability to browse/message/block/report (is_active_member()) — an
  -- unapproved profile can't use those features either, not just be hidden.
  profile_status text not null default 'pending' check (profile_status in ('pending','approved','rejected')),
  profile_rejection_reason text,
  plan text check (plan in ('monthly','annual')),
  subscription_status text not null default 'pending' check (subscription_status in ('pending','active','cancelled','past_due')),
  stripe_customer_id text,
  stripe_subscription_id text,
  is_admin boolean not null default false,
  -- Set by the device itself after registering with FCM/APNs (see
  -- vrnRegisterForPush in app.js) — never selectable by any client (including
  -- the owner), only used server-side by send-message-push to know where to
  -- deliver a push for a new chat message.
  push_token text,
  push_platform text check (push_platform in ('android','ios')),
  -- Member-controlled: unlike push_token/push_platform above, this one IS
  -- both readable and writable by the owner — it's the "Notification
  -- Preferences" toggle on account.html, checked by send-message-push
  -- before delivering a new-message push.
  push_enabled boolean not null default true,
  -- Set once the member has acknowledged the in-app messaging guidelines —
  -- see the CHAT & MESSAGING section below. Shown once, not on every chat.
  chat_guidelines_accepted_at timestamptz,
  -- Set once the member has completed (or skipped) the first-visit onboarding
  -- tour on search.html. Shown once, not on every visit — separate from
  -- chat_guidelines_accepted_at, which gates a different, later flow.
  onboarding_completed_at timestamptz,
  -- Member's manual light/dark choice, persisted so it follows them across
  -- devices. Signed-out visitors get a cookie-based fallback instead (see
  -- vrnApplyTheme in app.js) since they have no profile row yet.
  theme_preference text check (theme_preference in ('light','dark')),
  -- Admin-granted free access — bypasses the payment requirement only, never
  -- the content-approval requirement. See is_active_member() below: a comped
  -- member still needs profile_status = 'approved' like everyone else, this
  -- just means subscription_status never has to become 'active'. Only ever
  -- set by admin-set-comped (service role) — never in the update grant.
  is_comped boolean not null default false,
  -- For internal/reviewer test accounts (e.g. Apple App Review's TestFlight
  -- sign-in) that need full is_active_member() functionality to browse and
  -- message real members, but must never appear in real members' own browse
  -- results. Same exclusion shape as is_admin below, just for a different
  -- reason. Never in the update grant — service role only.
  is_hidden_from_browse boolean not null default false,
  -- GDPR consent evidence, set once by submit-profile-for-review at the
  -- moment an account is actually created — deliberately NOT in the member
  -- update grant below, so it's an immutable record of when consent was
  -- given, not something a member (or a bug) could later rewrite or clear.
  -- tos_accepted_at backs the mandatory Terms-of-Service gate (agree-
  -- terms.html) with a real per-account record, since a browser localStorage
  -- flag alone can't prove any specific account agreed to anything.
  tos_accepted_at timestamptz,
  -- Ahmadi Muslim status and Ahmadi Verification details are "special
  -- category data" (religious belief) under UK GDPR Article 9 — processing
  -- it requires a specific Article 9(2) condition, and explicit consent is
  -- the one that applies here. This must be its own affirmative action,
  -- separate from general Terms-of-Service agreement (bundling the two
  -- would not meet the "explicit" and "specific" bar), captured at signup
  -- alongside the Ahmadi Muslim question itself. See signup.html Step 3.
  religious_data_consent_at timestamptz,
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

-- Whenever photo_path changes — a new upload, a replacement, or removal —
-- photo_status resets automatically. This is the only way photo_status ever
-- changes to 'pending': members are never granted UPDATE on that column
-- directly (see the grant in section 3), so there's no way to self-approve.
-- A trigger can still set columns the calling role has no grant on; only the
-- statement's own SET clause is subject to column grants.
create or replace function public.reset_photo_status_on_change()
returns trigger
language plpgsql
as $$
begin
  if new.photo_path is distinct from old.photo_path then
    new.photo_status := case when new.photo_path is null then null else 'pending' end;
    new.photo_rejection_reason := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reset_photo_status on public.profiles;
create trigger trg_reset_photo_status
  before update on public.profiles
  for each row execute function public.reset_photo_status_on_change();

-- Same idea as reset_photo_status_on_change, but for the whole profile: any
-- change to a field actually shown to other members sends it back to
-- 'pending' for re-review. Deliberately excludes contact_email (private,
-- never shown to other members), has_photo/photo_path (governed by the photo
-- trigger above), and chat_guidelines_accepted_at/onboarding_completed_at/
-- theme_preference/is_comped/push_token/push_platform/push_enabled (operational metadata,
-- not profile content — must never affect visibility).
create or replace function public.reset_profile_status_on_change()
returns trigger
language plpgsql
as $$
begin
  if (new.gender, new.age, new.height, new.qualifications, new.employment, new.immigration_status,
      new.city, new.county, new.country, new.is_ahmadi, new.local_jamaat, new.had_previous,
      new.previous_type, new.previous_duration, new.has_children, new.preference_line,
      new.country_looking_in, new.consider_pakistan, new.additional_note, new.about)
     is distinct from
     (old.gender, old.age, old.height, old.qualifications, old.employment, old.immigration_status,
      old.city, old.county, old.country, old.is_ahmadi, old.local_jamaat, old.had_previous,
      old.previous_type, old.previous_duration, old.has_children, old.preference_line,
      old.country_looking_in, old.consider_pakistan, old.additional_note, old.about)
  then
    new.profile_status := 'pending';
    new.profile_rejection_reason := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reset_profile_status on public.profiles;
create trigger trg_reset_profile_status
  before update on public.profiles
  for each row execute function public.reset_profile_status_on_change();

-- Ahmadi verification answers (Local Jamaat, Local Sadr's name/contact,
-- positions held, when joined, and Jamaat activity) collected at signup and
-- on every resubmission (trg_reset_profile_status above sends any content
-- edit back to 'pending', so a fresh review always needs fresh answers).
-- Deliberately a separate table with ZERO RLS policies below — reachable
-- only through the service-role client inside submit-profile-for-review,
-- submit-profile-verification and the admin-* edge functions, never
-- directly from any client, not even the profile's own owner. This is
-- one-time-viewing data for the admin's approve/reject decision only:
-- admin-review-profile deletes this row the instant a decision is made, so
-- it should never exist for a profile that isn't currently pending review.
create table if not exists public.profile_verification (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  local_jamaat text not null,
  sadr_name_contact text not null,
  positions_held text not null,
  joined_jamaat text not null,
  jamaat_activity text not null,
  -- Path in the verification-videos bucket (see PHOTO STORAGE section below)
  -- for their short self-introduction video. Same one-time-viewing model as
  -- the text fields above: admin-review-profile deletes both this row AND
  -- the underlying storage object the instant a decision is made — this is
  -- the most sensitive thing collected here (face + voice), so minimizing
  -- how long it's retained matters most for this field specifically.
  video_path text not null
);
alter table public.profile_verification enable row level security;

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
  gender, age, height, qualifications, employment, immigration_status,
  city, county, country, is_ahmadi, local_jamaat, had_previous,
  previous_type, previous_duration, has_children,
  preference_line, country_looking_in,
  consider_pakistan, additional_note, about, contact_email,
  has_photo, photo_path, chat_guidelines_accepted_at, onboarding_completed_at,
  theme_preference, push_token, push_platform, push_enabled
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
  id, ref_code, gender, age, height, qualifications, employment, immigration_status,
  city, county, country, is_ahmadi, local_jamaat, had_previous, previous_type,
  previous_duration, has_children, preference_line, country_looking_in,
  consider_pakistan, additional_note, about, has_photo, photo_path,
  photo_status, photo_rejection_reason, profile_status, profile_rejection_reason,
  plan, subscription_status, is_comped, is_admin, chat_guidelines_accepted_at,
  onboarding_completed_at, theme_preference, push_enabled, created_at,
  tos_accepted_at, religious_data_consent_at
) on public.profiles to authenticated;

-- Any active, paying member can view the full details of another active member.
-- (The "reference code / age / country only" preview on the search page is a
-- front-end presentation choice — the underlying row is the same one exposed here.)
--
-- This needs a SECURITY DEFINER helper rather than a plain subquery: a policy
-- on `profiles` that queries `profiles` again triggers the same policy for
-- that inner query too, which recurses infinitely. A security definer
-- function owned by the table owner bypasses RLS for just that inner lookup.
-- Requires profile_status = 'approved' as well as (an active subscription OR
-- admin-granted comped access): a member whose own profile hasn't cleared
-- review yet can't use paid features (browse, message, block, report)
-- either — not just be hidden from others. Comping only ever substitutes for
-- payment, never for approval.
create or replace function public.is_active_member()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and profile_status = 'approved'
      and (subscription_status = 'active' or is_comped = true)
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
    (subscription_status = 'active' or is_comped = true) and profile_status = 'approved'
    and not is_admin
    and not is_hidden_from_browse
    and public.is_active_member()
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
-- 4. PHOTO STORAGE (optional, either gender)
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

-- Without this, re-uploading to a path that already has an object (the
-- "Change Photo" flow's upsert:true, or re-uploading right after Remove
-- Photo if the delete hasn't fully propagated yet) fails with "new row
-- violates row-level security policy" — upsert updates the existing row
-- rather than inserting a fresh one once an object exists at that path.
create policy "profile_photos_update_own" on storage.objects
  for update using (
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
-- 4b. AHMADI VERIFICATION VIDEO STORAGE
-- ============================================================
-- Short self-introduction video, required as part of Ahmadi Verification
-- (see profile_verification above). No select/delete policy for the member
-- themselves — deliberately admin-only, one-time-viewing: admin-review-
-- profile deletes the object here the instant a decision is made, and
-- nothing else ever reads it back except through the admin-* Edge
-- Functions' service-role client generating a short-lived signed URL.
insert into storage.buckets (id, name, public)
values ('verification-videos', 'verification-videos', false)
on conflict (id) do nothing;

create policy "verification_videos_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'verification-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Needed for the same reason as profile_photos_update_own: a retry after a
-- failed submit-profile-verification call re-uploads to the same path.
create policy "verification_videos_update_own" on storage.objects
  for update using (
    bucket_id = 'verification-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

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

-- Column-level grant so a direct client insert can't set payment_status,
-- status, or stripe_checkout_session_id itself — those are only ever
-- written by create-consultation-checkout/stripe-webhook (service-role).
-- The revoke first matters even on a fresh install: Supabase applies its own
-- default broad table privileges to every new table automatically.
revoke insert on public.consultation_requests from anon, authenticated;
grant insert (id, email, ref_code, phone, message) on public.consultation_requests to anon, authenticated;

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

-- Column-level grant: id/stripe_checkout_session_id are only ever set by
-- create-signup-checkout/stripe-webhook (service-role), never by a direct
-- client insert. profile_data itself is sanitized to a content-only
-- allowlist in both of those functions before ever reaching profiles. The
-- revoke first matters even on a fresh install: Supabase applies its own
-- default broad table privileges to every new table automatically.
revoke insert on public.pending_signups from anon, authenticated;
grant insert (email, password, profile_data, photo_data_url, plan) on public.pending_signups to anon, authenticated;

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
  my_gender text;
  other_gender text;
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

  select gender into other_gender from public.profiles
  where id = other_user_id and profile_status = 'approved'
    and (subscription_status = 'active' or is_comped = true)
    and not is_admin;
  if other_gender is null then
    raise exception 'That member is not currently active';
  end if;

  -- This is a matrimonial platform for opposite-gender matches only — never
  -- weakened to a client-side/UI-only rule, since this function is the sole
  -- way any conversation ever gets created (see comment above).
  select gender into my_gender from public.profiles where id = me;
  if my_gender = other_gender then
    raise exception 'Messaging is only available between opposite-gender members';
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

-- Column-level grant: without the revoke-then-column-grant here (same
-- pattern as the update grant below), a client insert could preset
-- reviewed_by_admin=true on their own message, hiding it from
-- admin-list-flagged-messages' review queue even when the auto-flag trigger
-- below would otherwise correctly catch it for sharing contact details —
-- completely bypassing the moderation system this feature exists to enforce.
revoke insert on public.messages from authenticated;
grant insert (conversation_id, sender_id, body) on public.messages to authenticated;

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

-- Contact details in messages are no longer restricted or auto-flagged —
-- sharing them (email first, then further details once both parties are
-- comfortable) is now advised in chat.html's Messaging Guidelines rather
-- than policed. flagged/flag_reason stay on the table for members'
-- self-reports (see messages_update_report_own_conversation) and any future
-- manual admin use; nothing sets them automatically anymore.

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

-- Column-level grant: without the revoke-then-column-grant, a reporter could
-- preset reviewed_by_admin=true on their own submitted report, hiding it
-- from admin-list-profile-reports' queue immediately.
revoke insert on public.profile_reports from authenticated;
grant insert (reporter_id, reported_id, reason) on public.profile_reports to authenticated;

-- ============================================================
-- 9. ADMIN ACTION AUDIT LOG
-- ============================================================
-- Backs the Privacy Policy's promise that "administrative access is
-- restricted to verified admin accounts and logged" — previously that
-- second half wasn't actually true anywhere in the codebase. Every
-- sensitive admin action (approving/rejecting a profile or photo, granting
-- comp access, deleting an account, viewing a flagged/reported member's
-- conversation history) writes a row here. Deliberately a separate table
-- with ZERO RLS policies, same reasoning as profile_verification — reachable
-- only through the service-role client inside admin-* Edge Functions, never
-- directly from any client, not even an admin's own. Nothing here is ever
-- deleted automatically; it's a permanent accountability record.
create table if not exists public.admin_action_log (
  id uuid primary key default gen_random_uuid(),
  -- Nullable (not "not null") specifically so `on delete set null` can work —
  -- if an admin account is ever removed, existing log rows survive with
  -- admin_id cleared rather than being deleted or blocking the removal.
  admin_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_profile_id uuid references public.profiles(id) on delete set null,
  detail text,
  created_at timestamptz not null default now()
);
alter table public.admin_action_log enable row level security;

-- ============================================================
-- 10. MINIMUM APP VERSION (force-update gate)
-- ============================================================
-- Backs assets/js/app.js's vrnEnforceMinAppVersion — a native app build
-- already installed on someone's phone can't be patched by a web deploy, so
-- anything that must reach every user immediately (like disabling Google
-- sign-in, 2026-08-24) needs a way to force an update. Public SELECT since
-- the app checks this before the member is even signed in; no INSERT/
-- UPDATE/DELETE policy at all for anon/authenticated, so this can only ever
-- be changed by hand via the SQL Editor (or a future admin-only function) —
-- never by any client, which matters since a malicious write here could
-- lock every user out of the app.
create table if not exists public.app_min_version (
  platform text primary key check (platform in ('android','ios')),
  min_build_number int not null,
  updated_at timestamptz not null default now()
);
alter table public.app_min_version enable row level security;

create policy "app_min_version_select_anyone" on public.app_min_version
  for select using (true);

revoke insert, update, delete on public.app_min_version from anon, authenticated;
grant select on public.app_min_version to anon, authenticated;

-- Android's min_build_number is bumped to 17 alongside this release (the one
-- that actually disables Google sign-in) specifically so every build at or
-- below 16 — which still shows the Google button with no server-side
-- backstop other than the Supabase provider toggle — is forced to update.
-- No iOS row yet: the app hasn't shipped there, so nothing is enforced for
-- that platform until its first real release adds one.
insert into public.app_min_version (platform, min_build_number) values ('android', 17)
on conflict (platform) do update set min_build_number = excluded.min_build_number, updated_at = now();

-- ============================================================
-- 11. EMAIL TEMPLATES
-- ============================================================
-- Saved reusable messages for the admin email broadcast tool (see
-- admin-send-email-broadcast) — lets admin reuse a message (like the
-- first-40-members discount announcement) without retyping it, or pick
-- "write your own" and compose fresh each time. Deliberately a separate
-- table with ZERO RLS policies, same reasoning as profile_verification —
-- reachable only through the service-role client inside admin-* Edge
-- Functions, never directly from any client.
create table if not exists public.email_template (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null,
  body text not null,
  is_html boolean not null default false,
  -- Optional per-template sender, e.g. "Virtual Rishta Naata <memberships@
  -- virtualrishtanaata.com>" for payment-related templates vs "...
  -- <announcements@...>" for general ones — null falls back to the
  -- EMAIL_FROM secret. Only the domain needs verifying in Resend, not each
  -- individual address, so any local part at a verified domain works with
  -- no extra setup.
  from_address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.email_template enable row level security;

-- ============================================================
-- 12. FIRST ADMIN
-- ============================================================
-- After you've created your own account through the normal signup flow once,
-- run this (with your real user id from auth.users) to make yourself an admin:
--
-- update public.profiles set is_admin = true where id = '<your-user-id>';
