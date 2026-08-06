/* ============================================================
   SUPABASE CLIENT — single point of connection to the backend.
   ------------------------------------------------------------
   The key here is the PUBLISHABLE (public) key — safe to ship in
   client-side code, because every table is protected by Row
   Level Security policies (see schema.sql). It can only ever do
   what those policies allow, regardless of who has it.
   NEVER put the "secret"/"service_role" key here or anywhere in
   this app — that key bypasses all security policies.
   ============================================================ */
const SUPABASE_URL = "https://hecgceomzundsqhtvbum.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_m6ja7cGjlGnZ0s4_qXAv5w_9lCak_4B";

// `supabase` here is the global from the CDN script tag in index.html
// (window.supabase), not to be confused with our own client instance below.
export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
