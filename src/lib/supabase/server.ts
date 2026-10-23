// Sets up the line to our database for code running on the server (the computer hosting the app).
// It carries the visitor's login cookies, small notes their browser keeps, so the database knows who's asking.

// Borrowing Supabase's helper, Next.js's cookie access, and our settings reader.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseConfig } from "./config";

// Makes a fresh database connection for whoever's visiting right now.
export async function createClient() {
  // Grab this visitor's cookies and the database settings.
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabaseConfig();

  // Now tell the database helper how to read and save the login cookies.
  return createServerClient(url, anonKey, {
    cookies: {
      // Reading: hand over all the visitor's cookies.
      getAll() {
        return cookieStore.getAll();
      },
      // Writing: save refreshed login cookies.
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch (error) {
          // Some pages aren't allowed to save cookies. That's fine, because proxy.ts refreshes the login anyway,
          // so we ignore just that case and let any other problem through.
          if (
            error instanceof Error &&
            error.message.includes(
              "Cookies can only be modified in a Server Action or Route Handler",
            )
          ) {
            return;
          }

          throw error;
        }
      },
    },
  });
}
