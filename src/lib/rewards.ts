import { prisma } from "./prisma";

// Shared reward helpers: the default reward examples and lazy seeding.

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

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
      title: "Dinner out",
      description: "One person pays, the whole family goes.",
      cost: 150,
      kind: "SHARED_SOLO",
      audience: "FAMILY",
      status: "ACTIVE",
    },
  });
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

