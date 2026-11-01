import Link from "next/link";
import { signup } from "../actions";

export const dynamic = "force-dynamic";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="theme-spousey min-h-screen">
      <div className="mx-auto w-full max-w-sm px-[18px] pt-12 pb-[18px]">
        <h1 className="font-script text-center text-6xl">Spousey Points</h1>

        <form action={signup} className="panel mt-8 flex flex-col gap-[18px]">
          <label className="flex flex-col gap-2">
            <span className="font-semibold">Screen name</span>
            <input name="screenName" required autoComplete="username" className="input" />
          </label>
          <label className="flex flex-col gap-2">
            <span className="font-semibold">Password</span>
            <input
              name="password"
              type="password"
              required
              autoComplete="new-password"
              className="input"
            />
          </label>

          <label className="flex items-center gap-3 font-semibold">
            <input type="checkbox" name="kidsAtHome" className="h-5 w-5" />
            Kids at home?
          </label>
          <label className="flex flex-col gap-2">
            <span className="font-semibold">Age</span>
            <input name="age" type="number" min={0} max={120} className="input" />
          </label>
          <label className="flex items-center gap-3 font-semibold">
            <input type="checkbox" name="retired" className="h-5 w-5" />
            Retired?
          </label>
          <label className="flex flex-col gap-2">
            <span className="font-semibold">Free time (hours per week)</span>
            <input name="freeTimeHours" type="number" min={0} max={168} className="input" />
          </label>
          <label className="flex flex-col gap-2">
            <span className="font-semibold">Children&apos;s names</span>
            <input name="childNames" className="input" />
          </label>

          {error === "taken" ? (
            <p style={{ color: "var(--accent)" }} className="font-semibold">
              That screen name is taken
            </p>
          ) : error ? (
            <p style={{ color: "var(--accent)" }} className="font-semibold">
              Screen name and password are required
            </p>
          ) : null}

          <button type="submit" className="btn-accent w-full">
            Sign up
          </button>
          <Link href="/login" className="text-center font-semibold underline">
            Log in
          </Link>
        </form>
      </div>
    </main>
  );
}
