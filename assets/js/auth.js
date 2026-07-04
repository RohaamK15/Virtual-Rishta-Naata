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
  "plan", "subscription_status", "is_admin", "chat_guidelines_accepted_at", "created_at",
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
