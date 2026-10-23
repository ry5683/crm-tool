// This is the sign-in page (/login) where your staff type their email and password.
// (className text like "rounded-lg bg-blue-700" is Tailwind shorthand for how things look.)

// The sign-in action that fires when the form is submitted.
import { signIn } from "./actions";

// After a failed sign-in, the web address carries an "error" note, and this page can read it.
type LoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

// Next.js setting: build this page fresh each visit.
export const instant = false;

// The login page itself.
export default async function LoginPage({ searchParams }: LoginPageProps) {
  // Read the error note from the address, if there is one.
  const { error } = await searchParams;

  // Draw the page: a centered card with a heading, a spot for errors, and the sign-in form.
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-12">
      {/* The white card in the middle of the screen. */}
      <section className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        {/* The app name, the heading, and a short instruction. */}
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
          Change Orders
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950">
          Sign in
        </h1>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          Sign in with one of your plumbing company test accounts.
        </p>

        {/* A red notice that only shows up after a failed sign-in. */}
        {error === "credentials" && (
          <p
            className="mt-6 rounded-lg bg-red-50 p-3 text-sm text-red-800"
            role="alert"
          >
            Email or password is incorrect. Please try again.
          </p>
        )}

        {/* The form. Pressing the button runs the sign-in action on the server. */}
        <form action={signIn} className="mt-6 space-y-5">
          <div>
            {/* The email box. */}
            <label
              className="mb-2 block text-sm font-medium text-zinc-800"
              htmlFor="email"
            >
              Email
            </label>
            <input
              autoComplete="email"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-zinc-950 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              id="email"
              name="email"
              required
              type="email"
            />
          </div>

          <div>
            {/* The password box. What you type gets hidden. */}
            <label
              className="mb-2 block text-sm font-medium text-zinc-800"
              htmlFor="password"
            >
              Password
            </label>
            <input
              autoComplete="current-password"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-zinc-950 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              id="password"
              name="password"
              required
              type="password"
            />
          </div>

          {/* The Sign in button. */}
          <button
            className="w-full rounded-lg bg-blue-700 px-4 py-3 font-medium text-white transition-colors hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            type="submit"
          >
            Sign in
          </button>
        </form>
      </section>
    </main>
  );
}
