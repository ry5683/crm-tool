// The "Edit job" page. It looks up the job, its customers, the technicians and the estimate lines, then shows the same job form you used to create it, already filled in.
// The saving happens in actions.ts next door.

// Borrowed tools: links, redirect and "not found" helpers, our login/database connection (Supabase), the job form and the save function.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import JobForm from "../../new/JobForm";
import { updateJob } from "./actions";

// Quick descriptions of the info we pull in. A Job is its ID, business, customer, assigned technician and description.
type Job = {
  id: string;
  business_id: string;
  customer_id: string;
  assigned_tech_id: string | null;
  description: string;
};

// A customer: their name and contact details.
type Customer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
};

// A team member, identified by their user ID.
type Member = { user_id: string };

// One line of the estimate: what it is, the quantity (in thousandths) and the price per item in cents.
type EstimateLine = {
  id: string;
  description: string;
  quantity_milli: number;
  unit_price_cents: number;
};

// The job's ID, which comes from the web address.
type EditJobPageProps = { params: Promise<{ id: string }> };

// A Next.js setting. It tells the framework not to nag about this page's loading speed, since it waits on live data from our server.
export const instant = false;

// Turns a stored quantity (in thousandths) into normal text for the form, so 2000 becomes "2".
function quantityValueFromMilli(quantityMilli: number): string {
  return quantityMilli % 1_000 === 0
    ? String(quantityMilli / 1_000)
    : (quantityMilli / 1_000).toString();
}

// The page itself. It's built on the server, before anything gets to your browser.
export default async function EditJobPage({ params }: EditJobPageProps) {
  // Wait until someone's actually visiting, so we show fresh info. Then we read the job's ID from the web address.
  await connection();
  const { id } = await params;
  // Are you signed in? If not, we send you to the login page, because we don't want strangers poking around.
  const supabase = await createClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();

  if (!claims?.claims) {
    if (claimsError && claimsError.name !== "AuthSessionMissingError") {
      throw new Error(`Could not verify your sign-in: ${claimsError.message}`);
    }
    redirect("/login");
  }

  // Look up the job. If it's not there (or isn't yours to see), we show a "not found" page.
  const { data: jobData, error: jobError } = await supabase
    .from("jobs")
    .select("id, business_id, customer_id, assigned_tech_id, description")
    .eq("id", id)
    .maybeSingle();

  if (jobError) {
    throw new Error(`Could not load the job: ${jobError.message}`);
  }
  if (!jobData) {
    notFound();
  }

  // Fetch the business's customers, its technicians and this job's estimate lines all at once, which is quicker than one by one.
  const job = jobData as Job;
  const [{ data: customerData, error: customerError }, { data: memberData, error: memberError }, { data: lineData, error: lineError }] =
    await Promise.all([
      supabase
        .from("customers")
        .select("id, name, email, phone, address")
        .eq("business_id", job.business_id)
        .order("name", { ascending: true }),
      supabase
        .from("members")
        .select("user_id")
        .eq("business_id", job.business_id)
        .eq("role", "tech"),
      supabase
        .from("estimate_lines")
        .select("id, description, quantity_milli, unit_price_cents")
        .eq("business_id", job.business_id)
        .eq("job_id", job.id)
        .order("created_at", { ascending: true }),
    ]);

  // If any of those lookups failed, stop and say so.
  if (customerError) {
    throw new Error(`Could not load customers: ${customerError.message}`);
  }
  if (memberError) {
    throw new Error(`Could not load technicians: ${memberError.message}`);
  }
  if (lineError) {
    throw new Error(`Could not load estimate lines: ${lineError.message}`);
  }

  // Make sure the job's customer is in the list we loaded. If it isn't, something's off, so we show "not found".
  const customers = customerData as Customer[];
  const estimateLines = lineData as EstimateLine[];
  if (!customers.some((customer) => customer.id === job.customer_id)) {
    notFound();
  }

  // Now we draw the page.
  return (
    <main className="animate-rise min-h-screen bg-zinc-50 px-4 py-8 sm:px-6 lg:px-8">
      {/* A centered column that holds everything. */}
      <div className="mx-auto max-w-3xl">
        {/* The top: a back link, the title and a short explainer. */}
        <header>
          <Link
            className="text-sm font-medium text-blue-700 hover:underline"
            href={`/jobs/${job.id}`}
          >
            ← Back to job
          </Link>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950">
            Edit job
          </h1>
          <p className="mt-2 text-zinc-600">
            Update customer details, the job description, and the estimate lines.
          </p>
        </header>
        {/* The same job form, filled in with this job's current info. Prices go from cents back into dollars so they read normally. */}
        <JobForm
          action={updateJob}
          customers={customers}
          initial={{
            jobId: job.id,
            customerId: job.customer_id,
            description: job.description,
            assignedTechId: job.assigned_tech_id,
            lines: estimateLines.map((line) => ({
              description: line.description,
              quantity: quantityValueFromMilli(line.quantity_milli),
              unitPrice: (line.unit_price_cents / 100).toFixed(2),
            })),
          }}
          technicians={(memberData as Member[]).map((member) => ({
            userId: member.user_id,
          }))}
        />
      </div>
    </main>
  );
}
