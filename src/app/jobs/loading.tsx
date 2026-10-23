// What shows for a split second while the jobs list loads: grey shimmering placeholder cards,
// so the page feels like it's already arriving instead of showing a blank screen.

export default function Loading() {
  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        {/* Placeholder for the "Jobs" heading. */}
        <div className="skeleton h-9 w-32" />
        {/* Three placeholder job cards. */}
        <div className="mt-8 space-y-3">
          {[0, 1, 2].map((n) => (
            <div className="rounded-xl border border-zinc-200 bg-white p-5" key={n}>
              <div className="skeleton h-5 w-2/3" />
              <div className="skeleton mt-3 h-4 w-1/3" />
              <div className="skeleton mt-5 h-5 w-1/4" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
