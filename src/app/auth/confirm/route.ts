// This is the page a new teammate lands on from their invite email. It's a plain "route" (it has no screen of its own).
// It trades the one-time code in the link for a real sign-in, then sends them to pick a password.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");

  // We only accept invite links here. Anything else goes back to the sign-in page.
  if (!tokenHash || type !== "invite") {
    return NextResponse.redirect(new URL("/login?error=invite", request.url));
  }

  // Swap the one-time code for a signed-in session. It works once; a used or expired link fails here.
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type: "invite", token_hash: tokenHash });
  if (error) {
    return NextResponse.redirect(new URL("/login?error=invite", request.url));
  }

  return NextResponse.redirect(new URL("/welcome", request.url));
}
