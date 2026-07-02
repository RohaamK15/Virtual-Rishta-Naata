// Requires supabase-config.js and the Supabase JS CDN script to be loaded first.
const sb = window.supabase.createClient(
  window.SUPABASE_CONFIG.url,
  window.SUPABASE_CONFIG.anonKey
);
