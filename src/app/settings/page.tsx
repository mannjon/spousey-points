import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { brandName } from "@/lib/classify";
import { updateDowntime, changeVersion, logout } from "../actions";

export const dynamic = "force-dynamic";

const THEME_CLASS = {
  SILVER: "theme-silver",
  SPOUSEY: "theme-spousey",
  FAMILY: "theme-family",
} as const;

const VERSION_OPTIONS = [
  { value: "SPOUSEY", label: "Spousey Points" },
  { value: "SILVER", label: "Silver Points" },
  { value: "FAMILY", label: "Family Points" },
] as const;

const REFERENCE_FACTS = [
  "Points land every Saturday",
  "Unused points expire on the last day of the month",
  "Tokens never expire",
  "Points received land as tokens",
];

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <main
      className={`${THEME_CLASS[user.version]} min-h-screen`}
      style={{ background: "var(--bg)", color: "var(--ink)" }}
    >
      <div className="mx-auto flex w-full max-w-md flex-col gap-[18px] px-[18px] pt-6 pb-[18px]">
        <header className="flex items-center justify-between">
          <h1 className="font-script text-5xl">{brandName(user.version)}</h1>
          <Link href="/" className="font-semibold underline">
            Balances
          </Link>
        </header>

        <form action={updateDowntime} className="panel flex flex-col gap-[18px]">
          <label className="flex flex-col gap-2">
            <span className="font-semibold">Weekly downtime (hours)</span>
            <input
              name="weeklyDowntimeHours"
              type="number"
              min={0}
              max={168}
              defaultValue={user.weeklyDowntimeHours}
              className="input"
            />
          </label>
          <button type="submit" className="btn-accent w-full">
            Save
          </button>
        </form>

        <form action={changeVersion} className="panel flex flex-col gap-2">
          {VERSION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="submit"
              name="version"
              value={opt.value}
              className="w-full rounded-lg px-4 py-3 text-left font-semibold"
              style={
                user.version === opt.value
                  ? { background: "var(--accent)", color: "var(--accent-ink)" }
                  : { border: "1px solid var(--line)" }
              }
            >
              {opt.label}
            </button>
          ))}
        </form>

        <details className="panel">
          <summary className="cursor-pointer font-semibold">Reference</summary>
          <ul className="mt-[18px] flex list-disc flex-col gap-2 pl-5">
            {REFERENCE_FACTS.map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
        </details>

        <form action={logout}>
          <button type="submit" className="btn-accent w-full">
            Log out
          </button>
        </form>
      </div>
    </main>
  );
}
