import "server-only";

// A database connection with full admin powers (the "service role"). It can create logins and ignores the normal row-level locks.
// That's dangerous in the wrong hands, so it's server-only (this file can never be sent to a browser) and we only use it
// in places that have already confirmed the visitor is a business owner.

import { createClient } from "@supabase/supabase-js";

// Builds the admin connection from the server's private settings, or stops with a helpful message if a setting is missing.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey || serviceRoleKey.startsWith("your-")) {
    throw new Error(
      "Set SUPABASE_SERVICE_ROLE_KEY in the project-root .env.local file to invite team members.",
    );
  }

  // No session saving: this connection is used for one quick job and then forgotten.
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
