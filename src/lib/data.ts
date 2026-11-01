import type { User } from "@prisma/client";
import { prisma } from "./prisma";
import { runWeeklyEngine } from "./engine";
import { getLogStats } from "./stats";
import { isIndirect } from "./log";
import { addDaysToDateString, chicagoDateString, wallParts } from "./time";
import type { AppData, BountyDTO } from "./types";

// Loads everything the app shell renders, household-scoped. Runs the lazy
// weekly engine first, then lazily expires open bounties past their due
// date (work already done and awaiting verification is never expired).
export async function getAppData(user: User): Promise<AppData> {
  await runWeeklyEngine(user);
  const me = (await prisma.user.findUnique({ where: { id: user.id } })) ?? user;
  const householdId = me.householdId;
  const now = new Date();

  await prisma.bounty.updateMany({
    where: {
      householdId,
      status: { in: ["PENDING_APPROVAL", "OPEN", "CLAIMED"] },
      dueDate: { lt: now },
    },
    data: { status: "EXPIRED" },
  });

  const [members, children, offers, bounties, notices, pendingInvitees, entries, seenRows, stats] =
    await Promise.all([
      prisma.user.findMany({
        where: { householdId, NOT: { id: me.id } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.child.findMany({
        where: { householdId },
        orderBy: { createdAt: "asc" },
      }),
      prisma.offer.findMany({
        where: {
          householdId,
          status: { in: ["PENDING", "COUNTERED"] },
          OR: [{ fromUserId: me.id }, { toUserId: me.id }],
        },
        include: { fromUser: true, toUser: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.bounty.findMany({
        where: { householdId },
        include: {
          postedBy: true,
          approvedBy: true,
          claimedBy: true,
          kidClaimChild: true,
          seen: true,
          kidApprovals: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.notice.findMany({
        where: { householdId, userId: me.id, accepted: false },
        orderBy: { createdAt: "desc" },
      }),
      prisma.pendingInvite.findMany({
        where: { householdId },
        orderBy: { createdAt: "asc" },
      }),
      prisma.logEntry.findMany({
        where: { householdId },
        orderBy: { createdAt: "desc" },
        take: 300,
      }),
      prisma.logSeen.findMany({ where: { userId: me.id } }),
      getLogStats(me.id, householdId, now),
    ]);

  const nameOf = (id: string | null) => {
    if (!id) return null;
    if (id === me.id) return me.screenName;
    return members.find((m) => m.id === id)?.screenName ?? null;
  };

  const seenSet = new Set(seenRows.map((s) => s.logEntryId));
  const redeemNoticeByEntry = new Map(
    (
      await prisma.notice.findMany({
        where: { householdId, kind: "REDEEM", logEntryId: { not: null } },
        select: { logEntryId: true, accepted: true },
      })
    ).map((n) => [n.logEntryId as string, n.accepted])
  );

  const bountyDTOs: BountyDTO[] = bounties.map((b) => ({
    id: b.id,
    title: b.title,
    details: b.details,
    value: b.value,
    dueDate: b.dueDate ? b.dueDate.toISOString() : null,
    status: b.status,
    postedById: b.postedById,
    postedByName: b.postedBy.screenName,
    approvedById: b.approvedById,
    approvedByName: b.approvedBy?.screenName ?? null,
    verifiedByName: nameOf(b.workVerifiedById),
    claimedById: b.claimedById,
    claimedByName: b.claimedBy?.screenName ?? null,
    kidClaimChildId: b.kidClaimChildId,
    kidClaimChildName: b.kidClaimChild?.name ?? null,
    kidApprovals: b.kidApprovals.map((a) => a.parentId),
    seenByMe: b.seen.some((s) => s.userId === me.id),
    createdAt: b.createdAt.toISOString(),
    completedAt: b.completedAt ? b.completedAt.toISOString() : null,
  }));

  const p = wallParts(now);
  const expiry = new Date(Date.UTC(p.year, p.month, 0));
  const expiryLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(expiry);

  return {
    me: {
      id: me.id,
      screenName: me.screenName,
      points: me.points,
      tokens: me.tokens,
      weeklyDowntimeHours: me.weeklyDowntimeHours,
    },
    members: members.map((m) => ({
      id: m.id,
      screenName: m.screenName,
    })),
    children: children.map((c) => ({
      id: c.id,
      name: c.name,
      tokens: c.tokens,
      weeklyAllowanceDollars: c.weeklyAllowanceDollars,
      weeklyTokenAmount: c.weeklyTokenAmount,
    })),
    offers: offers.map((o) => ({
      id: o.id,
      fromUserId: o.fromUserId,
      fromName: o.fromUser.screenName,
      toUserId: o.toUserId,
      toName: o.toUser.screenName,
      amount: o.amount,
      counterAmount: o.counterAmount,
      reason: o.reason,
      status: o.status,
      createdAt: o.createdAt.toISOString(),
    })),
    bounties: bountyDTOs,
    notices: notices.map((n) => ({
      id: n.id,
      kind: n.kind,
      text: n.text,
      amount: n.amount,
      fromName: nameOf(n.fromUserId),
      logEntryId: n.logEntryId,
      createdAt: n.createdAt.toISOString(),
    })),
    pendingInvitees: pendingInvitees.map((pi) => ({
      id: pi.id,
      screenName: pi.screenName,
    })),
    logEntries: entries.map((e) => ({
      id: e.id,
      kind: e.kind,
      text: e.text,
      amount: e.amount,
      note: e.note,
      counteredFrom: e.counteredFrom,
      redeemAcked:
        e.kind === "REDEEM" ? (redeemNoticeByEntry.get(e.id) ?? null) : null,
      actorId: e.actorId,
      subjectUserId: e.subjectUserId,
      childId: e.childId,
      createdAt: e.createdAt.toISOString(),
      seenByMe: seenSet.has(e.id),
      indirect: isIndirect(e, me.id),
    })),
    stats,
    expiryLabel,
    todayChicago: chicagoDateString(now),
    defaultDueDate: addDaysToDateString(chicagoDateString(now), 3),
  };
}
