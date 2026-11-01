import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { brandName } from "@/lib/classify";
import AppTabs from "@/components/AppTabs";
import InviteSheet from "@/components/InviteSheet";

export const dynamic = "force-dynamic";

const THEME_CLASS = {
  SILVER: "theme-silver",
  SPOUSEY: "theme-spousey",
  FAMILY: "theme-family",
} as const;

function BalanceCard({
  name,
  points,
  tokens,
}: {
  name: string;
  points?: number;
  tokens: number;
}) {
  return (
    <section className="panel flex flex-col gap-2">
      <h3 className="text-xl font-semibold">{name}</h3>
      {points !== undefined ? (
        <p className="flex justify-between">
          <span className="font-semibold">POINTS</span>
          <span>{points}</span>
        </p>
      ) : null}
      <p className="flex justify-between">
        <span className="font-semibold">TOKENS</span>
        <span>{tokens}</span>
      </p>
    </section>
  );
}

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [members, children] = await Promise.all([
    prisma.user.findMany({
      where: { householdId: user.householdId, NOT: { id: user.id } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.child.findMany({
      where: { householdId: user.householdId },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const balances = (
    <div className="flex flex-col gap-[18px]">
      <BalanceCard name={user.screenName} points={user.points} tokens={user.tokens} />
      {members.map((m) => (
        <BalanceCard key={m.id} name={m.screenName} points={m.points} tokens={m.tokens} />
      ))}
      {children.map((c) => (
        <BalanceCard key={c.id} name={c.name} tokens={c.tokens} />
      ))}
    </div>
  );

  return (
    <main
      className={`${THEME_CLASS[user.version]} min-h-screen`}
      style={{ background: "var(--bg)", color: "var(--ink)" }}
    >
      <div className="mx-auto w-full max-w-md px-[18px] pt-6 pb-24">
        <header className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span style={{ color: "var(--accent)" }}>♥</span>
            <h1 className="font-script text-5xl">{brandName(user.version)}</h1>
            <span style={{ color: "var(--accent)" }}>♥</span>
          </div>
          <Link href="/settings" aria-label="Settings" className="p-2 text-2xl">
            ⚙
          </Link>
        </header>

        <AppTabs balances={balances} />
      </div>

      {!user.invitePromptDone ? <InviteSheet /> : null}
    </main>
  );
}
