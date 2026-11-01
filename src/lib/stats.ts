import { prisma } from "./prisma";
import { startOfWeekSaturday } from "./time";
import type { StatsDTO } from "./types";

// Log stats for one user, computed from the log the way the app defines
// them. Weeks run Saturday to Saturday. "Involves me" = I am the actor,
// the subject, or the entry concerns one of my household's children.
// - Points used: offers I sent that were accepted + Love Taps I sent.
// - Tokens used: my own redemptions + my own token→points buy-backs.
//   A bounty completion is NOT token use — the reward is earned, nobody pays.
// - Tokens earned: offers accepted to me + Love Taps to me + bounties I earned.
// - Requests made: offers I sent (accepted or declined) + bounties I posted.
// - Requests completed: offers I sent that were accepted + bounties I verified.
// - Free time: each point/token of work done FOR me is 1% of a week's
//   100-point downtime; averaged over the weeks since my first entry.
export async function getLogStats(
  userId: string,
  householdId: string,
  now = new Date()
): Promise<StatsDTO> {
  const weekStart = startOfWeekSaturday(now);
  const entries = await prisma.logEntry.findMany({
    where: {
      householdId,
      OR: [{ actorId: userId }, { subjectUserId: userId }, { childId: { not: null } }],
    },
    orderBy: { createdAt: "asc" },
  });

  let weeks = 1;
  if (entries.length) {
    const firstWeek = startOfWeekSaturday(entries[0].createdAt);
    weeks = Math.max(
      1,
      Math.round((weekStart.getTime() - firstWeek.getTime()) / 604800000) + 1
    );
  }

  const sum = (list: typeof entries) =>
    list.reduce((a, e) => a + (e.amount ?? 0), 0);
  const isPtsUsed = (e: (typeof entries)[number]) =>
    (e.kind === "OFFER_ACCEPTED" && e.actorId === userId) ||
    (e.kind === "LOVE_TAP" && e.actorId === userId);
  const isTokUsed = (e: (typeof entries)[number]) =>
    (e.kind === "REDEEM" || e.kind === "BUY_POINTS") && e.actorId === userId;
  const isTokEarned = (e: (typeof entries)[number]) =>
    (e.kind === "OFFER_ACCEPTED" && e.subjectUserId === userId) ||
    (e.kind === "LOVE_TAP" && e.subjectUserId === userId) ||
    (e.kind === "BOUNTY_EARNED" && e.subjectUserId === userId);
  const isDid = (e: (typeof entries)[number]) =>
    (e.kind === "OFFER_ACCEPTED" && e.subjectUserId === userId) ||
    (e.kind === "BOUNTY_EARNED" && e.subjectUserId === userId);

  const ptsWeek = sum(entries.filter((e) => isPtsUsed(e) && e.createdAt >= weekStart));
  const ptsAll = sum(entries.filter(isPtsUsed));
  const tokWeek = sum(entries.filter((e) => isTokUsed(e) && e.createdAt >= weekStart));
  const tokEarnedAll = sum(entries.filter(isTokEarned));
  const made = entries.filter(
    (e) =>
      (e.kind === "OFFER_ACCEPTED" && e.actorId === userId) ||
      (e.kind === "OFFER_DECLINED" && e.actorId === userId) ||
      (e.kind === "BOUNTY_POSTED" && e.actorId === userId)
  ).length;
  const completed = entries.filter(
    (e) =>
      (e.kind === "OFFER_ACCEPTED" && e.actorId === userId) ||
      (e.kind === "BOUNTY_EARNED" && e.actorId === userId)
  ).length;
  const didValue = sum(entries.filter(isDid));

  return {
    ptsUsedWeek: ptsWeek,
    avgPtsUsedWeek: Math.round(ptsAll / weeks),
    tokensUsedWeek: tokWeek,
    avgTokensEarnedWeek: Math.round(tokEarnedAll / weeks),
    allTimeTokensEarned: tokEarnedAll,
    totalRequestsMade: made,
    totalRequestsCompleted: completed,
    avgFreeTimePct: Math.round((didValue / weeks) * 10) / 10,
  };
}
