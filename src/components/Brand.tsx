// The Tinkr logo: a little rounded blue badge with a "T", followed by the name.
// It's used at the top of pages so people always know what app they're in.

// "size" picks a small or large version.
export default function Brand({ size = "sm" }: { size?: "sm" | "lg" }) {
  // Bigger badge and text on the sign-in page, smaller everywhere else.
  const badge = size === "lg" ? "h-10 w-10 text-xl" : "h-7 w-7 text-sm";
  const text = size === "lg" ? "text-2xl" : "text-base";

  return (
    <span className="inline-flex items-center gap-2">
      {/* The badge itself. */}
      <span
        aria-hidden="true"
        className={`${badge} flex items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-blue-800 font-bold text-white shadow-sm`}
      >
        T
      </span>
      {/* The name. */}
      <span className={`${text} font-bold tracking-tight text-zinc-900 print:text-black`}>
        Tinkr
      </span>
    </span>
  );
}
