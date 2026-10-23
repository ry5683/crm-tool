import { loadEnvConfig } from "@next/env";
import { z } from "zod";
import { sendApprovalRequestEmail } from "../src/lib/email";

async function main() {
  loadEnvConfig(process.cwd());

  const recipient = z.email().safeParse(process.argv[2]);
  if (!recipient.success) {
    throw new Error("Usage: npm run email:test -- your@email.com");
  }

  await sendApprovalRequestEmail({
    to: recipient.data,
    businessName: "Change Orders email test",
    description:
      "Delivery test only. This is not a real change order or approval request.",
    totalCents: 17_500,
    approvalUrl: "https://example.com/email-test",
  });

  console.info("Test email sent. The example.com link is a placeholder.");
}

void main();
