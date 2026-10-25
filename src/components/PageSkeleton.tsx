// Grey shimmering placeholders shown while a page's data loads, so a tap always gets an instant answer
// instead of a frozen screen. Each page folder has a tiny loading.tsx that shows one of these.
//
// "list" looks like a page of cards (jobs, customers, invoices). "detail" looks like one record (a job, a customer).
// The "loading-delay" class waits a moment before showing, so fast loads don't flash grey boxes.

export default function PageSkeleton({ variant = "list" }: { variant?: "list" | "detail" }) {
  return (
    <main className="loading-delay min-h-screen bg-zinc-50 px-4 py-8 sm:px-6 lg:px-8" aria-busy="true">
      {/* Screen readers announce this instead of the grey boxes. */}
      <p className="sr-only" role="status">
        Loading…
      </p>
      <div className="mx-auto max-w-3xl" aria-hidden="true">
        {/* Placeholder for the page heading. */}
        <div className="skeleton h-9 w-40" />
        {variant === "list" ? (
          // Three placeholder cards.
          <div className="mt-8 space-y-3">
            {[0, 1, 2].map((n) => (
              <div className="rounded-xl border border-zinc-200 bg-white p-5" key={n}>
                <div className="skeleton h-5 w-2/3" />
                <div className="skeleton mt-3 h-4 w-1/3" />
                <div className="skeleton mt-5 h-5 w-1/4" />
              </div>
            ))}
          </div>
        ) : (
          // One big card with a few lines, like a single job or customer.
          <div className="mt-8 rounded-xl border border-zinc-200 bg-white p-6">
            <div className="skeleton h-6 w-1/2" />
            <div className="skeleton mt-4 h-4 w-2/3" />
            <div className="skeleton mt-2 h-4 w-1/2" />
            <div className="mt-8 space-y-3">
              {[0, 1, 2].map((n) => (
                <div className="flex justify-between gap-4" key={n}>
                  <div className="skeleton h-4 w-1/2" />
                  <div className="skeleton h-4 w-16" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
