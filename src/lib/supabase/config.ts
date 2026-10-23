// Looks up our Supabase address and public key from the app's settings file (.env.local). Supabase is the online
// database and login service we use. Everything else asks this file so the settings are read in one spot.

// Reads the settings and hands them back, or stops with a helpful message if something's missing.
export function getSupabaseConfig() {
  // The database's web address and its public "anon" key. That key is safe to show; the database's own rules protect the data.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If a setting is missing, or still the placeholder text, spell out exactly what to fill in.
  if (!url || !anonKey || url.startsWith("your-") || anonKey.startsWith("your-")) {
    throw new Error(
      "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) in the project-root .env.local file.",
    );
  }

  // Hand the two settings back.
  return { url, anonKey };
}
