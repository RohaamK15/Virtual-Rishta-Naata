// Fill these in from your Supabase project: Project Settings > API.
// The anon key is designed to be public — it only ever grants what your
// Row Level Security policies (see supabase/schema.sql) allow.
window.SUPABASE_CONFIG = {
  url: "https://mmojmirxsayijquunscj.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1tb2ptaXJ4c2F5aWpxdXVuc2NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5ODk1NzEsImV4cCI6MjA5ODU2NTU3MX0.lu_ihtvb4wSCtxQ5W1JKKcVF59exzji6Qx9EiheiRE4",
};

// RevenueCat's public SDK key for the App Store app — designed to be public,
// same reasoning as the anon key above. iOS only: Android and web still go
// entirely through Stripe (see create-checkout-session).
window.REVENUECAT_CONFIG = {
  iosApiKey: "appl_eWmwOLnAggwRmbdqrDmxjiBHTtE",
};
