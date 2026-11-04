import { prisma } from "./prisma";

// Shared reward helpers: member keys, the default reward examples, lazy
// seeding, and shared-goal failure handling (a goal that misses its due
// date fails for everyone and every contributed token goes back to the
// bank it came from).

export const memberKey = (userId: string | null, childId: string | null) =>
  userId ? `u:${userId}` : `c:${childId ?? ""}`;

export function parseMemberKey(key: string): { userId: string | null; childId: string | null } {
  if (key.startsWith("u:")) return { userId: key.slice(2), childId: null };
  if (key.startsWith("c:")) return { userId: null, childId: key.slice(2) };
  return { userId: null, childId: null };
}

export function evenSplit(total: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  const rem = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export async function refundGoal(tx: Tx, rewardId: string): Promise<number> {
  const contribs = await tx.rewardContribution.findMany({ where: { rewardId } });
  let refunded = 0;
  for (const c of contribs) {
    if (c.fromUserId) {
      await tx.user.update({
        where: { id: c.fromUserId },
        data: { tokens: { increment: c.amount } },
      });
    } else if (c.fromChildId) {
      await tx.child.update({
        where: { id: c.fromChildId },
        data: { tokens: { increment: c.amount } },
      });
    }
    refunded += c.amount;
  }
  if (contribs.length) {
    await tx.rewardContribution.deleteMany({ where: { rewardId } });
  }
  return refunded;
}

async function createDefaultRewards(
  tx: Tx,
  householdId: string,
  owner: { userId: string | null; childId: string | null },
  createdById: string
) {
  const base = {
    householdId,
    ownerUserId: owner.userId,
    ownerChildId: owner.childId,
    createdById,
    isDefault: true,
    saved: true,
  };
  await tx.reward.create({
    data: {
      ...base,
      title: "Guilt-free nap",
      description: "Time off, no questions asked.",
      cost: 25,
      kind: "PERSONAL",
      audience: "SELF",
      status: "ACTIVE",
    },
  });
  await tx.reward.create({
    data: {
      ...base,
      title: "Dinner out",
      description: "One person pays, the whole family goes.",
      cost: 150,
      kind: "SHARED_SOLO",
      audience: "FAMILY",
      status: "ACTIVE",
    },
  });
  const members = await householdMembers(tx, householdId);
  const due = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const goal = await tx.reward.create({
    data: {
      ...base,
      title: "Family movie night",
      description: "Everyone fills their part by the due date.",
      cost: 120,
      kind: "SHARED_GOAL",
      audience: "FAMILY",
      status: "OPEN",
      dueDate: due,
    },
  });
  const shares = evenSplit(120, members.length);
  for (let i = 0; i < members.length; i++) {
    await tx.rewardPart.create({
      data: {
        rewardId: goal.id,
        memberUserId: members[i].userId,
        memberChildId: members[i].childId,
        amount: shares[i],
      },
    });
  }
}

export async function householdMembers(
  db: Tx | typeof prisma,
  householdId: string
): Promise<{ userId: string | null; childId: string | null; name: string }[]> {
  const users = await db.user.findMany({
    where: { householdId },
    orderBy: { createdAt: "asc" },
  });
  const children = await db.child.findMany({
    where: { householdId },
    orderBy: { createdAt: "asc" },
  });
  return [
    ...users.map((u) => ({ userId: u.id as string | null, childId: null, name: u.screenName })),
    ...children.map((c) => ({ userId: null, childId: c.id as string | null, name: c.name })),
  ];
}

// Seeds the viewing user's default rewards once, and each child's
// default rewards once. Runs lazily on data load, like the rest of the
// app's lazy engines.
export async function seedRewardsIfNeeded(householdId: string, viewerId: string) {
  const viewer = await prisma.user.findUnique({ where: { id: viewerId } });
  if (viewer && !viewer.rewardsSeeded) {
    await prisma.$transaction(async (tx) => {
      await createDefaultRewards(tx, householdId, { userId: viewerId, childId: null }, viewerId);
      await tx.user.update({ where: { id: viewerId }, data: { rewardsSeeded: true } });
    });
  }
  const children = await prisma.child.findMany({
    where: { householdId, rewardsSeeded: false },
  });
  for (const child of children) {
    await prisma.$transaction(async (tx) => {
      await createDefaultRewards(tx, householdId, { userId: null, childId: child.id }, viewerId);
      await tx.child.update({ where: { id: child.id }, data: { rewardsSeeded: true } });
    });
  }
}

// Open shared goals past their due date: if the total was filled in time
// they complete; otherwise they fail and every contribution is refunded.
export async function sweepFailedGoals(householdId: string) {
  const now = new Date();
  const goals = await prisma.reward.findMany({
    where: { householdId, kind: "SHARED_GOAL", status: "OPEN", dueDate: { lt: now } },
    include: { parts: true, contributions: true },
  });
  for (const g of goals) {
    const target = g.parts.reduce((s, p) => s + p.amount, 0) || g.cost;
    const filled = g.contributions.reduce((s, c) => s + c.amount, 0);
    if (filled >= target) {
      await prisma.$transaction(async (tx) => {
        await tx.reward.update({ where: { id: g.id }, data: { status: "COMPLETED" } });
        await tx.logEntry.create({
          data: {
            householdId,
            actorId: null,
            kind: "REWARD_GOAL_DONE",
            text: `${g.title} is fully funded`,
            amount: filled,
          },
        });
      });
    } else {
      await prisma.$transaction(async (tx) => {
        const refunded = await refundGoal(tx, g.id);
        await tx.reward.update({ where: { id: g.id }, data: { status: "FAILED" } });
        await tx.logEntry.create({
          data: {
            householdId,
            actorId: null,
            kind: "REWARD_GOAL_FAILED",
            text:
              refunded > 0
                ? `${g.title} ended — ${refunded} tokens returned`
                : `${g.title} ended`,
            amount: refunded > 0 ? refunded : null,
          },
        });
      });
    }
  }
}
