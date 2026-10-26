// The reasons a customer can pick when declining, and the rules for the extra note. The database enforces the same rules.

export const DECLINE_NOTE_MAX = 300;

export const DECLINE_REASONS = [
  { code: "too_expensive", label: "The price is too high" },
  { code: "not_needed", label: "I don't think this work is needed" },
  { code: "other_quote", label: "I'm getting another quote" },
  { code: "need_to_discuss", label: "I need to talk it over first" },
  { code: "other", label: "Other" },
] as const;

export type DeclineReasonCode = (typeof DECLINE_REASONS)[number]["code"];

export function isDeclineReasonCode(value: unknown): value is DeclineReasonCode {
  return DECLINE_REASONS.some((reason) => reason.code === value);
}

export function declineReasonLabel(code: string | null | undefined): string | null {
  return DECLINE_REASONS.find((reason) => reason.code === code)?.label ?? null;
}

// "Other" needs a written explanation; the other reasons treat the note as optional.
export function declineNoteError(code: DeclineReasonCode, note: string): string | null {
  const trimmed = note.trim();
  if (trimmed.length > DECLINE_NOTE_MAX) {
    return `Keep your note to ${DECLINE_NOTE_MAX} characters or fewer.`;
  }
  if (code === "other" && trimmed.length === 0) {
    return "Please tell us the reason.";
  }
  return null;
}
