// Think of this as a doorman who greets every visitor before the page loads and quietly refreshes their login so they stay signed in.
// He doesn't turn anyone away; each page checks sign-in on its own.

// Borrowing Supabase's helper, Next.js's request/response types, and our settings reader.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase/config";

// Runs on every page visit.
export async function proxy(request: NextRequest) {
  const { url, anonKey } = getSupabaseConfig();
  // Start with "let the visitor carry on as normal."
  let response = NextResponse.next({ request });

  // Set up a database connection that can read cookies from the visit and write updated ones back.
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      // Reading: the visitor's cookies.
      getAll() {
        return request.cookies.getAll();
      },
      // Writing: save refreshed login cookies, both for the rest of this visit and in the reply to the browser.
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        // Rebuild the reply so it carries the updated cookies.
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });

        // Copy over any extra instructions (headers) the login library wants sent back.
        for (const [name, value] of Object.entries(headers)) {
          response.headers.set(name, value);
        }
      },
    },
  });

  // This checks the login and refreshes it if needed. We don't need the answer; the fresh cookies are the point.
  await supabase.auth.getClaims();
  // Send the visitor on to the page they asked for.
  return response;
}

// Which pages this runs on: everything except built-in files and images, which don't need a login refresh.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
