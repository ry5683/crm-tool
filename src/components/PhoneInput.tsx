"use client";

// A phone number box that tidies what you type into (555) 123-4567 as you go, so nobody has to think about the format.
// It's the same box on the new-job form and the edit form.

import { useState } from "react";
import { formatPhoneAsTyped, formatPhone } from "@/lib/contact";

export default function PhoneInput({
  defaultValue,
  id = "customerPhone",
  name = "customerPhone",
}: {
  defaultValue?: string | null;
  id?: string;
  name?: string;
}) {
  // Start with the saved number (neatly formatted), or empty.
  const [value, setValue] = useState(defaultValue ? formatPhone(defaultValue) : "");

  return (
    <input
      autoComplete="tel"
      className="w-full rounded-lg border border-zinc-300 px-3 py-2.5"
      id={id}
      inputMode="tel"
      name={name}
      onChange={(event) => setValue(formatPhoneAsTyped(event.target.value))}
      pattern="\(\d{3}\) \d{3}-\d{4}"
      placeholder="(555) 123-4567"
      required
      title="Enter a complete phone number like (555) 123-4567."
      type="tel"
      value={value}
    />
  );
}
