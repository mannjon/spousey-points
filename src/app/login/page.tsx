import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { login } from "../actions";
import CoinsStack from "@/components/CoinsStack";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/");
  const { error } = await searchParams;

  return (
    <main className="theme-spousey relative min-h-screen overflow-hidden">
      <div className="mx-auto flex min-h-screen w-full max-w-sm flex-col items-center px-[18px] pt-16 pb-40">
        <div className="flex items-center gap-3">
          <span style={{ color: "var(--accent)" }} className="text-2xl">
            ♥
          </span>
          <h1 className="font-script text-6xl">Spousey Points</h1>
          <span style={{ color: "var(--accent)" }} className="text-2xl">
            ♥
          </span>
        </div>

        <form action={login} className="panel mt-10 flex w-full flex-col gap-[18px]">
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
              autoComplete="current-password"
              className="input"
            />
          </label>
          {error ? (
            <p style={{ color: "var(--accent)" }} className="font-semibold">
              Wrong screen name or password
            </p>
          ) : null}
          <button type="submit" className="btn-accent w-full">
            Log in
          </button>
          <Link href="/signup" className="text-center font-semibold underline">
            Sign up
          </Link>
        </form>
      </div>
      <CoinsStack />
    </main>
  );
}
