// One-off: encrypts customer email/phone/address rows that were saved before field encryption existed.
// Safe to re-run; already-encrypted values are skipped. Usage: npm run encrypt:existing
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { encryptContact } from "../src/lib/field-crypto";

async function main() {
  loadEnvConfig(process.cwd());
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase URL and service role key must be set in .env.local.");
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await supabase.from("customers").select("id, email, phone, address");
  if (error) throw new Error(`Could not read customers: ${error.message}`);

  let updated = 0;
  for (const row of data) {
    const { id, ...contact } = row;
    const sealed = encryptContact(contact);
    if (JSON.stringify(sealed) === JSON.stringify(contact)) continue;
    const { error: updateError } = await supabase.from("customers").update(sealed).eq("id", id);
    if (updateError) throw new Error(`Could not update customer ${id}: ${updateError.message}`);
    updated += 1;
  }
  console.log(`Encrypted ${updated} of ${data.length} customers.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
