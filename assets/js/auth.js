// Shared auth/profile helpers. Requires supabase-client.js loaded first.

async function vrnSignUp(email, password) {
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) throw error;
  return data.user;
}

async function vrnSignIn(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

// Google sign-in/linking is TEMPORARILY DISABLED (2026-08-24) — despite
// hiding the "Continue with Google" button behind the vrn_google_linked
// localStorage flag (see login.html), new orphaned Google sign-ins kept
// appearing, most likely because the already-published Android app (a
// separate native build, not this website) still bundles an older version
// of this code from before that fix and can't be patched by a web deploy.
// Disabling it here stops it for every client, old app builds included,
// without depending on a new Play Store release. The Google provider is
// also disabled directly in Supabase Dashboard > Authentication > Providers
// as a second, server-side guarantee — restore both together once the
// underlying flow is fixed and a fresh native build has actually shipped.
async function vrnSignInWithGoogle() {
  throw new Error("Google sign-in is temporarily unavailable — please sign in with your email and password.");
}

async function vrnLinkGoogleIdentity() {
  throw new Error("Linking a Google account is temporarily unavailable.");
}

// Called from account.html once a Google identity is already linked.
// Supabase's unlinkIdentity() needs the actual identity object (not just a
// provider name), and refuses to remove the last remaining identity on an
// account — neither is a real risk here, since every VRN account always has
// its original email/password identity from signup, so unlinking Google
// just removes that one alternative sign-in path, never the account itself.
async function vrnUnlinkGoogleIdentity() {
  const { data, error: listError } = await sb.auth.getUserIdentities();
  if (listError) throw listError;
  const googleIdentity = data?.identities?.find((i) => i.provider === "google");
  if (!googleIdentity) throw new Error("No linked Google account found.");
  const { error } = await sb.auth.unlinkIdentity(googleIdentity);
  if (error) throw error;
}

async function vrnRequestPasswordReset(email) {
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password.html`,
  });
  if (error) throw error;
}

async function vrnUpdatePassword(newPassword) {
  const { error } = await sb.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

async function vrnSignOut() {
  await sb.auth.signOut();
  window.location.href = "/login.html";
}

async function vrnCurrentUser() {
  const { data: { user } } = await sb.auth.getUser();
  return user;
}

// Redirects to /login.html if not signed in. Call at the top of any protected page.
async function vrnRequireAuth() {
  const user = await vrnCurrentUser();
  if (!user) {
    window.location.href = "/login.html";
    return null;
  }
  return user;
}

// Call after vrnRequireAuth() on any page needing full paid-feature access
// (search, messages, chat). Without this, a member who isn't fully active
// yet — not approved, or approved but not paid/comped — would land on
// search.html and just silently see "0 profiles found": RLS returns an
// empty set, not an error, since is_active_member() requires both
// profile_status = 'approved' AND (subscription_status = 'active' or
// is_comped). Sends them to account.html instead, which explains exactly
// which of those is missing and what to do next (edit + resubmit if
// rejected, or complete payment if approved but unpaid).
async function vrnRequireActiveMembership() {
  const profile = await vrnMyProfile();
  const isActive = profile && profile.profile_status === "approved" && (profile.subscription_status === "active" || profile.is_comped);
  if (!isActive) {
    window.location.href = "/account.html";
    return null;
  }
  return profile;
}

// Postgres requires SELECT * to have table-wide privilege — with only the
// column-level grant in schema.sql (contact_email and the Stripe IDs are
// deliberately excluded from it), a bare select("*") fails outright with
// "permission denied for table profiles" rather than just omitting those
// columns. Every client-side profile read has to name its columns explicitly.
const PROFILE_COLUMNS = [
  "id", "ref_code", "gender", "age", "height", "qualifications", "employment",
  "immigration_status", "city", "county", "country", "is_ahmadi", "local_jamaat",
  "had_previous", "previous_type", "previous_duration", "has_children",
  "preference_line", "country_looking_in", "consider_pakistan", "additional_note",
  "about", "has_photo", "photo_path", "photo_status", "photo_rejection_reason",
  "profile_status", "profile_rejection_reason",
  "plan", "subscription_status", "is_comped", "is_admin", "chat_guidelines_accepted_at",
  "onboarding_completed_at", "theme_preference", "push_enabled", "created_at",
  "email_marketing_opt_out", "verified_by_admin",
].join(", ");

async function vrnMyProfile() {
  const user = await vrnCurrentUser();
  if (!user) return null;
  const { data, error } = await sb.from("profiles").select(PROFILE_COLUMNS).eq("id", user.id).single();
  if (error) throw error;
  return data;
}

// Any active member can read another active member's full row — enforced by
// the profiles_select_active_members RLS policy in supabase/schema.sql.
async function vrnGetProfileByRef(refCode) {
  const { data, error } = await sb.from("profiles").select(PROFILE_COLUMNS).eq("ref_code", refCode).single();
  if (error) throw error;
  return data;
}

// Search-page listing. RLS already restricts this to active members viewing
// active members, but it deliberately can't exclude people the caller has
// blocked here: profiles_select_blocked_by_me (needed so account.html can
// show "who have I blocked") is OR'd together with every other SELECT
// policy, and RLS has no way to tell "this is the blocked-list widget" apart
// from "this is a normal search" — both are just a select on profiles. So a
// blocked member would otherwise still appear in search results, directly
// contradicting what blocking a member promises. Filtered here instead.
async function vrnSearchProfiles(filters = {}) {
  const me = await vrnCurrentUser();
  const myProfile = await vrnMyProfile();
  // This is a matrimonial platform for opposite-gender matches only — always
  // enforced, never a user-choosable filter. The real security boundary is
  // get_or_create_conversation's own gender check in schema.sql; this just
  // keeps search results from showing profiles a member could never actually
  // message anyway.
  const oppositeGender = myProfile.gender === "M" ? "F" : "M";
  const { data: myBlocks } = await sb.from("blocks").select("blocked_id").eq("blocker_id", me.id);
  const blockedIds = (myBlocks || []).map((b) => b.blocked_id);

  let query = sb.from("profiles")
    .select("id, ref_code, gender, age, height, country, city, county, consider_pakistan, had_previous, previous_type, has_children, immigration_status")
    .neq("id", me.id).eq("gender", oppositeGender);
  if (blockedIds.length) query = query.not("id", "in", `(${blockedIds.join(",")})`);
  if (filters.minAge) query = query.gte("age", filters.minAge);
  if (filters.maxAge) query = query.lte("age", filters.maxAge);
  if (filters.country) query = query.eq("country", filters.country);
  if (filters.city) query = query.ilike("city", `%${filters.city}%`);
  if (filters.county) query = query.ilike("county", `%${filters.county}%`);
  if (filters.considerPakistan) query = query.eq("consider_pakistan", filters.considerPakistan === "Yes");
  if (filters.hasChildren) query = query.eq("has_children", filters.hasChildren === "Yes");
  if (filters.immigrationStatus) query = query.eq("immigration_status", filters.immigrationStatus);
  if (filters.maritalHistory === "Never") {
    query = query.eq("had_previous", false);
  } else if (filters.maritalHistory === "Engaged") {
    query = query.eq("had_previous", true).eq("previous_type", "Engagement");
  } else if (filters.maritalHistory === "Married") {
    query = query.eq("had_previous", true).in("previous_type", ["Nikah", "Marriage"]);
  }
  const { data, error } = await query;
  if (error) throw error;

  // Height is free-text ("5'9" etc.) so a numeric range can't be done as a
  // database query — parsed and filtered here instead, same reasoning as the
  // signup form's own height format check.
  let results = data;
  if (filters.minHeightInches || filters.maxHeightInches) {
    results = results.filter((p) => {
      const match = String(p.height || "").match(/^(\d)'(\d{1,2})"?$/);
      if (!match) return false;
      const totalInches = +match[1] * 12 + +match[2];
      if (filters.minHeightInches && totalInches < filters.minHeightInches) return false;
      if (filters.maxHeightInches && totalInches > filters.maxHeightInches) return false;
      return true;
    });
  }
  return results;
}
