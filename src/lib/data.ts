import type { User } from "@prisma/client";
import { prisma } from "./prisma";
import { runWeeklyEngine } from "./engine";
import { getLogStats } from "./stats";
import { isIndirect } from "./log";
import { addDaysToDateString, chicagoDateString, wallParts } from "./time";
import { memberKey, seedRewardsIfNeeded, sweepFailedGoals } from "./rewards";
import type { AppData, BountyDTO, CouponDTO, PersonRewardsDTO, RewardDTO, SpecialOfferDTO } from "./types";

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

  await seedRewardsIfNeeded(householdId, me.id);
  await sweepFailedGoals(householdId);

  const [members, children, offers, bounties, notices, pendingInvitees, entries, seenRows, stats, allRewards, myTiers, rewardRequests, myLocks, specialOffers, coupons] =
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
      prisma.reward.findMany({
        where: { householdId },
        include: { parts: true, contributions: true, lockedBy: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.rewardTier.findMany({
        where: { userId: me.id },
        orderBy: { minCost: "asc" },
      }),
      prisma.rewardRequest.findMany({
        where: {
          householdId,
          status: { in: ["PENDING", "APPROVED"] },
        },
        include: { reward: true, requester: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.reward.count({
        where: { householdId, locked: true, lockedById: me.id },
      }),
      prisma.specialOffer.findMany({
        where: { householdId, status: { in: ["AVAILABLE", "PENDING"] } },
        include: { owner: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.coupon.findMany({
        where: { householdId, status: "AVAILABLE" },
        orderBy: { createdAt: "asc" },
      }),
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

  const childName = (id: string | null) =>
    id ? (children.find((c) => c.id === id)?.name ?? null) : null;

  const toRewardDTO = (r: (typeof allRewards)[number]): RewardDTO => {
    const parts = r.parts.map((pt) => {
      const contributed = r.contributions
        .filter(
          (c) =>
            (pt.memberUserId && c.partUserId === pt.memberUserId) ||
            (pt.memberChildId && c.partChildId === pt.memberChildId)
        )
        .reduce((s, c) => s + c.amount, 0);
      return {
        memberKey: memberKey(pt.memberUserId, pt.memberChildId),
        name: pt.memberUserId ? (nameOf(pt.memberUserId) ?? "") : (childName(pt.memberChildId) ?? ""),
        isChild: !!pt.memberChildId,
        isMe: pt.memberUserId === me.id,
        amount: pt.amount,
        contributed,
      };
    });
    return {
      id: r.id,
      title: r.title,
      description: r.description,
      cost: r.cost,
      kind: r.kind,
      audience: r.audience,
      isDefault: r.isDefault,
      saved: r.saved,
      freeRedeem: r.freeRedeem,
      locked: r.locked,
      lockedById: r.lockedById,
      lockedByName: r.lockedBy?.screenName ?? null,
      createdById: r.createdById,
      status: r.status,
      dueDate: r.dueDate ? r.dueDate.toISOString() : null,
      parts,
      filledTotal: r.contributions.reduce((s, c) => s + c.amount, 0),
      targetTotal: parts.length ? parts.reduce((s, pt) => s + pt.amount, 0) : r.cost,
      createdAt: r.createdAt.toISOString(),
    };
  };

  const specialEffectText = (o: (typeof specialOffers)[number]): string => {
    if (o.effect === "POINTS") return `+${o.amount ?? 0} points`;
    if (o.effect === "TOKENS") return `+${o.amount ?? 0} tokens`;
    const items = Array.isArray(o.bundle)
      ? (o.bundle as { title: string; qty: number }[])
      : [];
    return items.map((i) => `${i.qty}× ${i.title}`).join(" · ");
  };

  const toSpecialDTO = (o: (typeof specialOffers)[number]): SpecialOfferDTO => ({
    id: o.id,
    ownerId: o.ownerUserId,
    ownerName: o.owner.screenName,
    title: o.title,
    effectText: o.effect === "BUNDLE" ? "" : specialEffectText(o),
    status: o.status,
    mine: o.ownerUserId === me.id,
    bundleItems:
      o.effect === "BUNDLE" && Array.isArray(o.bundle)
        ? (o.bundle as { title: string; qty: number }[]).map((i) => ({
            title: i.title,
            qty: i.qty,
          }))
        : undefined,
  });

  const toCouponDTO = (c: (typeof coupons)[number]): CouponDTO => ({
    id: c.id,
    title: c.title,
    packName: c.packName,
    mine: c.ownerUserId === me.id,
  });

  const rewardsFor = (
    ownerType: "USER" | "CHILD",
    ownerId: string,
    ownerName: string
  ): PersonRewardsDTO => ({
    ownerType,
    ownerId,
    ownerName,
    rewards: allRewards
      .filter((r) =>
        ownerType === "USER" ? r.ownerUserId === ownerId : r.ownerChildId === ownerId
      )
      .map(toRewardDTO),
    specialOffers:
      ownerType === "USER"
        ? specialOffers.filter((o) => o.ownerUserId === ownerId).map(toSpecialDTO)
        : [],
    coupons:
      ownerType === "USER"
        ? coupons.filter((c) => c.ownerUserId === ownerId).map(toCouponDTO)
        : [],
  });

  const rewardsData = {
    tiers: myTiers.map((t) => ({ id: t.id, minCost: t.minCost, maxCost: t.maxCost })),
    mine: rewardsFor("USER", me.id, me.screenName),
    others: [
      ...members.map((m) => rewardsFor("USER", m.id, m.screenName)),
      ...children.map((c) => rewardsFor("CHILD", c.id, c.name)),
    ],
    requests: rewardRequests.map((q) => ({
        id: q.id,
        rewardId: q.rewardId,
        rewardTitle: q.reward.title,
        cost: q.reward.cost,
        requesterId: q.requesterId,
        requesterName: q.requester.screenName,
        status: q.status,
        createdAt: q.createdAt.toISOString(),
        mine: q.requesterId === me.id,
      })),
    locksUsedByMe: myLocks,
    specialPending: specialOffers
      .filter((o) => o.status === "PENDING" && o.ownerUserId !== me.id)
      .map(toSpecialDTO),
  };

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
    rewards: rewardsData,
  };
}
