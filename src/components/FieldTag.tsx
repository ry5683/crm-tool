// Tiny labels that sit next to a field's name so people instantly know whether they can skip it.
// A red star means "you have to fill this in"; "(optional)" means "skip it if you like".

// Put <FieldTag required /> after a label for a must-fill box, or <FieldTag /> for an optional one.
// "hint" adds a short extra note, like "(needed to send approvals)".
export function FieldTag({
  required = false,
  hint,
}: {
  required?: boolean;
  hint?: string;
}) {
  return required ? (
    <>
      {/* The star is for eyes; the hidden word is for screen readers. */}
      <span aria-hidden="true" className="ml-0.5 font-semibold text-red-600">
        *
      </span>
      <span className="sr-only"> (required)</span>
      {hint && <span className="ml-1 text-xs font-normal text-zinc-500">{hint}</span>}
    </>
  ) : (
    <span className="ml-1 text-xs font-normal text-zinc-500">
      (optional{hint ? `, ${hint}` : ""})
    </span>
  );
}

// A one-line legend placed at the top of a form to explain the red star.
export function RequiredNote() {
  return (
    <p className="text-xs text-zinc-500">
      <span aria-hidden="true" className="font-semibold text-red-600">
        *
      </span>{" "}
      Required
    </p>
  );
}
