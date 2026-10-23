"use server";

// This is what happens when someone deletes a job. It's a "server action": a function that runs on our server when a form gets sent.
// The red Delete button on the job screens triggers it.

// Borrowed tools: refresh saved pages, move you to another page, a checker for incoming info (zod), and our login/database connection (Supabase).
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// What we tell the screen afterwards: an error message if something went wrong, or null (nothing) if it's all fine.
export type DeleteJobState = { error: string | null };

// The rule for a valid request: it has to come with a proper job ID, not random junk.
const deleteJobInputSchema = z.object({ jobId: z.uuid() });

// The actual delete. It runs when the Delete button's form is sent.
export async function deleteJob(
  _previousState: DeleteJobState,
  formData: FormData,
): Promise<DeleteJobState> {
  // Double-check the job ID we got. The server never just trusts the browser, because anything coming from a browser can be tampered with.
  const parsed = deleteJobInputSchema.safeParse({
    jobId: formData.get("jobId"),
  });
  if (!parsed.success) {
    return { error: "Choose a valid job." };
  }

  // Make sure you're signed in. If you're not, we send you to the login page; we don't want strangers deleting jobs.
  const supabase = await createClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  if (!claims?.claims) {
    if (claimsError && claimsError.name !== "AuthSessionMissingError") {
      throw new Error(`Could not verify your sign-in: ${claimsError.message}`);
    }
    redirect("/login");
  }

  // Ask the database to delete the job. Whether this person is actually allowed to is the database's call too, so a failure comes back as an error.
  const { error } = await supabase.rpc("delete_job", {
    p_job_id: parsed.data.jobId,
  });
  if (error) {
    return { error: `Could not delete this job: ${error.message}` };
  }

  // Deleted! Refresh the jobs list so the job disappears from it, then take you back there.
  revalidatePath("/jobs");
  redirect("/jobs");
}
