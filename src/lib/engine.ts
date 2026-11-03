import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { monthRollovers, saturdayBoundaries } from "./time";
import { tokens as tokensText } from "./log";

// Lazy weekly engine, run on any authenticated load. Everything is driven
// by per-user / per-child markers so repeat loads are no-ops:
// - each Saturday boundary crossed: +100 points per adult, and each child
//   receives their weekly token drop. Grants are CREDITS ONLY — no balance
//   is ever debited to fund them.
// - each month rollover crossed: unused points EXPIRE (the balance lapses;
//   it does not roll over).

type EngineUser = {
  id: string;
  householdId: string;
  screenName: string;
  pointsMarkerAt: Date | null;
};

export async function runWeeklyEngine(user: EngineUser, now = new Date()) {
  const householdId = user.householdId;
  const marker = user.pointsMarkerAt;

  if (marker === null) {
    // First-ever run for this account. Signup already put this week's
    // amounts in hand (adults start at 100 points), so the boundary clock
    // simply starts now — no back-pay and no expiry for the partial week.
    // A child who has never received a drop gets their first one now: the
    // drop is their weekly allowance and never waits on a Saturday that
    // predates them.
    const firstRunChildren = await prisma.child.findMany({
      where: { householdId },
      orderBy: { createdAt: "asc" },
    });
    const firstOps: Prisma.PrismaPromise<unknown>[] = [
      prisma.user.update({
        where: { id: user.id },
        data: { pointsMarkerAt: now },
      }),
    ];
    for (const child of firstRunChildren) {
      if (child.dropMarkerAt !== null) continue;
      firstOps.push(
        prisma.child.update({
          where: { id: child.id },
          data: {
            tokens: child.tokens + child.weeklyTokenAmount,
            dropMarkerAt: now,
          },
        })
      );
      firstOps.push(
        prisma.logEntry.create({
          data: {
            householdId,
            kind: "WEEKLY_DROP",
            text: `${child.name} received the weekly drop of ${tokensText(child.weeklyTokenAmount)}`,
            amount: child.weeklyTokenAmount,
            childId: child.id,
            createdAt: now,
          },
        })
      );
    }
    await prisma.$transaction(firstOps);
    return;
  }
  const sats = saturdayBoundaries(marker, now);
  const months = monthRollovers(marker, now);
  if (!sats.length && !months.length) return;

  // Merge boundaries chronologically: at a month rollover the balance
  // lapses first; a Saturday drop landing at the same instant still lands.
  const events = [
    ...months.map((at) => ({ at, kind: "month" as const })),
    ...sats.map((at) => ({ at, kind: "saturday" as const })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  const fresh = await prisma.user.findUnique({ where: { id: user.id } });
  if (!fresh) return;
  let points = fresh.points;

  const children = await prisma.child.findMany({
    where: { householdId },
    orderBy: { createdAt: "asc" },
  });
  const childState = new Map(
    children.map((c) => [
      c.id,
      { tokens: c.tokens, marker: c.dropMarkerAt ?? marker },
    ])
  );

  const ops: Prisma.PrismaPromise<unknown>[] = [];

  for (const ev of events) {
    if (ev.kind === "month") {
      if (points > 0) {
        ops.push(
          prisma.logEntry.create({
            data: {
              householdId,
              kind: "POINTS_EXPIRED",
              text: `${points} unused points expired for ${fresh.screenName}`,
              amount: points,
              actorId: fresh.id,
              subjectUserId: fresh.id,
              createdAt: ev.at,
            },
          })
        );
      }
      points = 0;
      continue;
    }
    // Saturday: weekly points drop for this user.
    points += 100;
    ops.push(
      prisma.logEntry.create({
        data: {
          householdId,
          kind: "WEEKLY_GRANT",
          text: `Weekly points landed for ${fresh.screenName}`,
          amount: 100,
          actorId: fresh.id,
          subjectUserId: fresh.id,
          createdAt: ev.at,
        },
      })
    );
    // Saturday: weekly token drop for each child — a grant, credited from
    // nowhere; no parent's balance is touched.
    for (const child of children) {
      const st = childState.get(child.id)!;
      if (st.marker.getTime() < ev.at.getTime()) {
        st.tokens += child.weeklyTokenAmount;
        st.marker = ev.at;
        ops.push(
          prisma.logEntry.create({
            data: {
              householdId,
              kind: "WEEKLY_DROP",
              text: `${child.name} received the weekly drop of ${tokensText(child.weeklyTokenAmount)}`,
              amount: child.weeklyTokenAmount,
              childId: child.id,
              createdAt: ev.at,
            },
          })
        );
      }
    }
  }

  ops.push(
    prisma.user.update({
      where: { id: fresh.id },
      data: { points, pointsMarkerAt: now },
    })
  );
  for (const child of children) {
    const st = childState.get(child.id)!;
    ops.push(
      prisma.child.update({
        where: { id: child.id },
        data: { tokens: st.tokens, dropMarkerAt: st.marker },
      })
    );
  }
  await prisma.$transaction(ops);
}
