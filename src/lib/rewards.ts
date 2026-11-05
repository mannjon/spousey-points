import { prisma } from "./prisma";

// Lazy seeding pass. No default rewards are seeded (Jonathan's order,
// 2026-11-05: "Dinner out" removed); the pass remains only so the
// rewardsSeeded flags still advance. Runs lazily on data load, like the
// rest of the app's lazy engines.
export async function seedRewardsIfNeeded(householdId: string, viewerId: string) {
  const viewer = await prisma.user.findUnique({ where: { id: viewerId } });
  if (viewer && !viewer.rewardsSeeded) {
    await prisma.user.update({ where: { id: viewerId }, data: { rewardsSeeded: true } });
  }
  const children = await prisma.child.findMany({
    where: { householdId, rewardsSeeded: false },
  });
  for (const child of children) {
    await prisma.child.update({ where: { id: child.id }, data: { rewardsSeeded: true } });
  }
}
