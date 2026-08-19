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

// Entry point from login.html's "Continue with Google" button — reachable
// while signed out. Google sign-in here is scoped to EXISTING paying members
// only: Supabase's signInWithOAuth will happily create a brand-new auth user
// for anyone, even someone who's never signed up, so it's auth-callback.html
// (the redirectTo target) that guards against that ever becoming real access
// — no matching active + approved profile there means an immediate sign-out.
async function vrnSignInWithGoogle() {
  const { data, error } = await sb.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/auth-callback.html` },
  });
  if (error) throw error;
  if (window.Capacitor?.isNativePlatform?.() && window.Capacitor.Plugins?.Browser) {
    await window.Capacitor.Plugins.Browser.open({ url: data.url });
  } else {
    window.location.href = data.url;
  }
}

// Only ever called from account.html, by a member who is ALREADY signed in
// with email/password — this links a Google identity onto their EXISTING
// auth user so they can use either to log in from then on. Requires "Manual
// Linking" to be enabled in Supabase Dashboard > Authentication > Settings.
async function vrnLinkGoogleIdentity() {
  const { data, error } = await sb.auth.linkIdentity({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/account.html?googleLinked=1` },
  });
  if (error) throw error;
  if (window.Capacitor?.isNativePlatform?.() && window.Capacitor.Plugins?.Browser) {
    await window.Capacitor.Plugins.Browser.open({ url: data.url });
  } else {
    window.location.href = data.url;
  }
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
  "residential_status", "city", "county", "country", "is_ahmadi", "local_jamaat",
  "had_previous", "previous_type", "previous_duration", "has_children",
  "preference_line", "country_looking_in", "consider_pakistan", "additional_note",
  "about", "has_photo", "photo_path", "photo_status", "photo_rejection_reason",
  "profile_status", "profile_rejection_reason",
  "plan", "subscription_status", "is_comped", "is_admin", "chat_guidelines_accepted_at",
  "onboarding_completed_at", "theme_preference", "created_at",
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
// active members; we only select the fields the card actually shows.
async function vrnSearchProfiles(filters = {}) {
  let query = sb.from("profiles").select("ref_code, gender, age, country, consider_pakistan");
  if (filters.gender) query = query.eq("gender", filters.gender);
  if (filters.minAge) query = query.gte("age", filters.minAge);
  if (filters.maxAge) query = query.lte("age", filters.maxAge);
  if (filters.country) query = query.eq("country", filters.country);
  if (filters.considerPakistan) query = query.eq("consider_pakistan", filters.considerPakistan === "Yes");
  const { data, error } = await query;
  if (error) throw error;
  return data;
}
