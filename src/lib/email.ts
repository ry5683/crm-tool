import "server-only";

// This is the part that sends the "please approve this change order" email through Resend, an email delivery service.
// It's server-only because it uses a secret key that must never reach a browser.

// zod checks our data, Resend sends the mail, and money.ts makes dollar amounts look right.
import { Resend } from "resend";
import { z } from "zod";
import { formatCents } from "@/lib/money";

// Ground rules before we send: a real email address, text that isn't blank or crazy long,
// a total in whole cents, and a link that starts with http or https.
const approvalEmailSchema = z.object({
  to: z.email(),
  businessName: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(500),
  totalCents: z.number().int().nonnegative().max(2_147_483_647),
  approvalUrl: z.url().refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "Approval link must use HTTP or HTTPS."),
});

// Email text gets dropped into a web-page-style layout, so we swap special characters (like < and &) for harmless stand-ins.
// That stops a weird business name from breaking the layout or sneaking in code.
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

// Sends the email. If anything's wrong it throws an error so whoever called us can undo the "sent" status.
export async function sendApprovalRequestEmail(input: {
  to: string;
  businessName: string;
  description: string;
  totalCents: number;
  approvalUrl: string;
}): Promise<void> {
  // First, run the details past the ground rules.
  const parsed = approvalEmailSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(
      `Approval email details are invalid: ${parsed.error.issues[0]?.message ?? "check the values."}`,
    );
  }

  // Grab the email settings (the secret key and the "from" address) from the server's private settings. No settings, no email.
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!apiKey || !from) {
    throw new Error(
      "Email is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL on the server.",
    );
  }

  // Get everything ready: safe versions of the text and the total shown as dollars.
  const resend = new Resend(apiKey);
  const { to, businessName, description, totalCents, approvalUrl } = parsed.data;
  const safeBusinessName = escapeHtml(businessName);
  const safeDescription = escapeHtml(description);
  const safeApprovalUrl = escapeHtml(approvalUrl);
  const formattedTotal = formatCents(totalCents);

  // Off it goes. There's a plain-text version for simple mail apps and a nicer one for the rest.
  // We also strip line breaks from the subject so nobody can sneak extra lines in.
  const { error } = await resend.emails.send({
    from,
    to,
    subject: `Change order from ${businessName.replace(/[\r\n]+/g, " ")}`,
    text: [
      `${businessName} sent you a change order for approval.`,
      "",
      description,
      `Total: ${formattedTotal}`,
      "",
      `Review and respond: ${approvalUrl}`,
    ].join("\n"),
    html: [
      `<p><strong>${safeBusinessName}</strong> sent you a change order for approval.</p>`,
      `<p>${safeDescription}</p>`,
      `<p><strong>Total: ${escapeHtml(formattedTotal)}</strong></p>`,
      `<p><a href="${safeApprovalUrl}">Review and respond</a></p>`,
    ].join(""),
  });

  // If Resend says something went wrong, raise it so the caller can clean up.
  if (error) {
    throw new Error(`Resend could not send the approval email: ${error.message}`);
  }
}
