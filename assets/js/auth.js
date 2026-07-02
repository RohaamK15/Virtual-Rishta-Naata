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

async function vrnMyProfile() {
  const user = await vrnCurrentUser();
  if (!user) return null;
  const { data, error } = await sb.from("profiles").select("*").eq("id", user.id).single();
  if (error) throw error;
  return data;
}

async function vrnCreateProfile(profile) {
  const user = await vrnCurrentUser();
  if (!user) throw new Error("Not signed in");
  const { data, error } = await sb
    .from("profiles")
    .insert({ id: user.id, ...profile })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Any active member can read another active member's full row — enforced by
// the profiles_select_active_members RLS policy in supabase/schema.sql.
async function vrnGetProfileByRef(refCode) {
  const { data, error } = await sb.from("profiles").select("*").eq("ref_code", refCode).single();
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
