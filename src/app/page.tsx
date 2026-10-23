// This is the home page, the bare web address. It shows nothing itself; it just sends people along to the jobs list.

// Next.js's tool for sending a visitor to another page.
import { redirect } from "next/navigation";

// Whenever someone opens the home page, forward them to /jobs (which asks them to sign in if they haven't).
export default function Home() {
  redirect("/jobs");
}
