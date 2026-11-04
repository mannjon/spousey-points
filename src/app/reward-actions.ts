"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { tokens as tokensText } from "@/lib/log";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

const fail = (error: string): ActionResult => ({ ok: false, error });
const ok = (id?: string): ActionResult => (id ? { ok: true, id } : { ok: true });

const SAVED_LIMIT = 20;
const LOCK_LIMIT = 10;

function validCost(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 999999;
}

async function getReward(householdId: string, rewardId: string) {
  return prisma.reward.findFirst({ where: { id: rewardId, householdId } });
}

async function otherAdults(householdId: string, exceptId: string) {
  return prisma.user.findMany({
    where: { householdId, NOT: { id: exceptId } },
    orderBy: { createdAt: "asc" },
  });
}

// ------------------------------------------------------------------ create

export async function createReward(input: {
  ownerType: "USER" | "CHILD";
  ownerId: string;
  title: string;
  description: string;
  cost: number;
  kind: "PERSONAL" | "SHARED_SOLO";
  audience: "SELF" | "PLUS_ONE" | "FAMILY";
  saved: boolean;
  overwriteId: string | null;
}): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (!me) return fail("Not signed in");
  const title = input.title.trim();
  if (!title) return fail("Give the reward a title.");
  if (!validCost(input.cost)) return fail("Enter a token cost of 1 or more.");

  const ownerUserId = input.ownerType === "USER" ? input.ownerId : null;
  const ownerChildId = input.ownerType === "CHILD" ? input.ownerId : null;
  if (ownerUserId) {
    const u = await prisma.user.findFirst({
      where: { id: ownerUserId, householdId: me.householdId },
    });
    if (!u) return fail("That person is not in your household.");
  }
  if (ownerChildId) {
    const c = await prisma.child.findFirst({
      where: { id: ownerChildId, householdId: me.householdId },
    });
    if (!c) return fail("That child is not in your household.");
  }

  const id = await prisma.$transaction(async (tx) => {
    if (input.saved) {
      const count = await tx.reward.count({
        where: {
          householdId: me.householdId,
          saved: true,
          ...(ownerUserId ? { ownerUserId } : { ownerChildId: ownerChildId! }),
        },
      });
      if (count >= SAVED_LIMIT) {
        if (!input.overwriteId) {
          throw new Error("NO_SLOTS");
        }
        const over = await tx.reward.findFirst({
          where: {
            id: input.overwriteId,
            householdId: me.householdId,
            saved: true,
            ...(ownerUserId ? { ownerUserId } : { ownerChildId: ownerChildId! }),
          },
        });
        if (!over) throw new Error("That reward is not on their list.");
        if (over.locked && over.lockedById !== me.id) {
          throw new Error("That reward is locked and cannot be overwritten.");
        }
        await tx.reward.delete({ where: { id: over.id } });
      }
    }
    const reward = await tx.reward.create({
      data: {
        householdId: me.householdId,
        ownerUserId,
        ownerChildId,
        createdById: me.id,
        title,
        description: input.description.trim() || null,
        cost: input.cost,
        kind: input.kind,
        audience: input.kind === "PERSONAL" ? "SELF" : input.audience,
        saved: input.saved,
        status: "ACTIVE",
      },
    });
    return reward.id;
  }).catch((e: Error) => {
    if (e.message === "NO_SLOTS") return null;
    throw e;
  });
  if (id === null) {
    return fail(
      `No free slots — they already have ${SAVED_LIMIT} saved rewards. Pick one to overwrite.`
    );
  }
  revalidatePath("/");
  return ok(id);
}

// ------------------------------------------------------------------ edit / delete / lock

export async function updateReward(input: {
  rewardId: string;
  title: string;
  description: string;
  cost: number;
}): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (!me) return fail("Not signed in");
  const reward = await getReward(me.householdId, input.rewardId);
  if (!reward) return fail("Not found");
  // Editing belongs to the owner (adults edit their own; parents edit a
  // child's). Adding and removing are the shared spouse actions.
  const editable =
    reward.ownerUserId === me.id || reward.ownerChildId !== null;
  if (!editable) return fail("Only the owner can edit that reward.");
  const title = input.title.trim();
  if (!title) return fail("Give the reward a title.");
  const data: { title: string; description: string | null; cost?: number } = {
    title,
    description: input.description.trim() || null,
  };
  if (!validCost(input.cost)) return fail("Enter a token cost of 1 or more.");
  data.cost = input.cost;
  await prisma.reward.update({ where: { id: reward.id }, data });
  revalidatePath("/");
  return ok();
}

export async function deleteReward(rewardId: string): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (!me) return fail("Not signed in");
  const reward = await getReward(me.householdId, rewardId);
  if (!reward) return fail("Not found");
  // A lock set by the person who made the reward blocks everyone else
  // from deleting it. The person who locked it can still remove it.
  if (reward.locked && reward.lockedById !== me.id) {
    return fail("That reward is locked and cannot be removed.");
  }
  await prisma.reward.delete({ where: { id: reward.id } });
  revalidatePath("/");
  return ok();
}

export async function lockReward(rewardId: string): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (!me) return fail("Not signed in");
  const reward = await getReward(me.householdId, rewardId);
  if (!reward) return fail("Not found");
  if (reward.locked) return fail("That reward is already locked.");
  if (reward.createdById !== me.id) {
    return fail("Only the person who made the reward can lock it.");
  }
  const used = await prisma.reward.count({
    where: { householdId: me.householdId, locked: true, lockedById: me.id },
  });
  if (used >= LOCK_LIMIT) {
    return fail(`You already have ${LOCK_LIMIT} locked rewards.`);
  }
  await prisma.reward.update({
    where: { id: reward.id },
    data: { locked: true, lockedById: me.id },
  });
  revalidatePath("/");
  return ok();
}

// ------------------------------------------------------------------ kid cash-in
// A kid's cash-in just sends a notification to the parents. That is the
// whole flow: no approval, no balance change.

export async function sendKidReward(rewardId: string): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (!me) return fail("Not signed in");
  const reward = await getReward(me.householdId, rewardId);
  if (!reward || !reward.ownerChildId) return fail("Not found");
  const child = await prisma.child.findUnique({ where: { id: reward.ownerChildId } });
  if (!child) return fail("Not found");
  const parents = await prisma.user.findMany({ where: { householdId: me.householdId } });
  await prisma.$transaction(async (tx) => {
    for (const p of parents) {
      await tx.notice.create({
        data: {
          householdId: me.householdId,
          userId: p.id,
          kind: "REWARD_KID",
          text: `${child.name} sent: ${reward.title} — ${tokensText(reward.cost)}`,
          amount: reward.cost,
        },
      });
    }
    await tx.logEntry.create({
      data: {
        householdId: me.householdId,
        actorId: me.id,
        childId: child.id,
        kind: "REWARD_KID_SENT",
        text: `${child.name} sent ${reward.title}`,
        amount: reward.cost,
      },
    });
  });
  revalidatePath("/");
  return ok();
}

// ------------------------------------------------------------------ adult cash-in
// Request → the other adult approves → the requester finalizes with a
// tap. Only at the tap does the requester's token balance decrease.

export async function requestCashIn(rewardId: string): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (!me) return fail("Not signed in");
  const reward = await getReward(me.householdId, rewardId);
  if (!reward) return fail("Not found");
  if (reward.ownerUserId !== me.id) return fail("You can only cash in your own rewards.");
  if (!reward.freeRedeem && me.tokens < reward.cost)
    return fail("You don't have enough tokens for that yet.");
  const existing = await prisma.rewardRequest.findFirst({
    where: { rewardId: reward.id, requesterId: me.id, status: { in: ["PENDING", "APPROVED"] } },
  });
  if (existing) return fail("That cash-in is already sent.");
  const others = await otherAdults(me.householdId, me.id);
  const req = await prisma.$transaction(async (tx) => {
    const created = await tx.rewardRequest.create({
      data: { householdId: me.householdId, rewardId: reward.id, requesterId: me.id },
    });
    for (const o of others) {
      await tx.notice.create({
        data: {
          householdId: me.householdId,
          userId: o.id,
          kind: "REWARD_REQUEST",
          text: `${me.screenName} wants to cash in: ${reward.title} — ${tokensText(reward.cost)}`,
          fromUserId: me.id,
          amount: reward.cost,
        },
      });
    }
    return created;
  });
  revalidatePath("/");
  return ok(req.id);
}

export async function resolveCashIn(
  requestId: string,
  approve: boolean
): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (!me) return fail("Not signed in");
  const req = await prisma.rewardRequest.findFirst({
    where: { id: requestId, householdId: me.householdId, status: "PENDING" },
    include: { reward: true, requester: true },
  });
  if (!req) return fail("Not found");
  if (req.requesterId === me.id) return fail("You can't approve your own cash-in.");
  await prisma.$transaction(async (tx) => {
    await tx.rewardRequest.update({
      where: { id: req.id },
      data: { status: approve ? "APPROVED" : "DECLINED", resolvedAt: new Date() },
    });
    await tx.notice.create({
      data: {
        householdId: me.householdId,
        userId: req.requesterId,
        kind: approve ? "REWARD_APPROVED" : "REWARD_DECLINED",
        text: approve
          ? `${me.screenName} approved your cash-in: ${req.reward.title} — tap to finalize`
          : `${me.screenName} declined your cash-in: ${req.reward.title}`,
        fromUserId: me.id,
        amount: req.reward.cost,
      },
    });
  });
  revalidatePath("/");
  return ok();
}

export async function finalizeCashIn(requestId: string): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (!me) return fail("Not signed in");
  const req = await prisma.rewardRequest.findFirst({
    where: { id: requestId, householdId: me.householdId, status: "APPROVED" },
    include: { reward: true },
  });
  if (!req) return fail("Not found");
  if (req.requesterId !== me.id) return fail("Only the person cashing in can finalize it.");
  const fresh = await prisma.user.findUnique({ where: { id: me.id } });
  if (!req.reward.freeRedeem && (!fresh || fresh.tokens < req.reward.cost)) {
    return fail("You don't have enough tokens for that anymore.");
  }
  const others = await otherAdults(me.householdId, me.id);
  await prisma.$transaction(async (tx) => {
    if (!req.reward.freeRedeem) {
      await tx.user.update({
        where: { id: me.id },
        data: { tokens: { decrement: req.reward.cost } },
      });
    }
    await tx.rewardRequest.update({
      where: { id: req.id },
      data: { status: "FINALIZED", resolvedAt: new Date() },
    });
    await tx.logEntry.create({
      data: {
        householdId: me.householdId,
        actorId: me.id,
        subjectUserId: me.id,
        kind: "REWARD_CASHIN",
        text: `${me.screenName} cashed in ${req.reward.title}`,
        amount: req.reward.cost,
      },
    });
    for (const o of others) {
      await tx.notice.create({
        data: {
          householdId: me.householdId,
          userId: o.id,
          kind: "REWARD_DONE",
          text: `${me.screenName} cashed in ${req.reward.title} — ${tokensText(req.reward.cost)}`,
          fromUserId: me.id,
          amount: req.reward.cost,
        },
      });
    }
    if (req.reward.freeRedeem) {
      // A granted copy is consumed by using it: the copy itself goes away.
      await tx.reward.delete({ where: { id: req.rewardId } });
    }
  });
  revalidatePath("/");
  return ok();
}

// ------------------------------------------------------------- special offers

// Special rewards are presents: they sit in the owner's Special Offers
// already available, and using one applies it right away — no redeem
// request, no approval. Using one logs it and lets the other adults know.
export async function useSpecialOffer(offerId: string): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (!me) return fail("Not signed in");
  const offer = await prisma.specialOffer.findFirst({
    where: { id: offerId, householdId: me.householdId },
  });
  if (!offer) return fail("Not found");
  if (offer.ownerUserId !== me.id) return fail("That special reward isn't yours.");
  if (offer.status !== "AVAILABLE") return fail("That special reward is already used.");
  const others = await otherAdults(me.householdId, me.id);
  await prisma.$transaction(async (tx) => {
    if (offer.effect === "POINTS" && offer.amount) {
      await tx.user.update({
        where: { id: me.id },
        data: { points: { increment: offer.amount } },
      });
    } else if (offer.effect === "TOKENS" && offer.amount) {
      await tx.user.update({
        where: { id: me.id },
        data: { tokens: { increment: offer.amount } },
      });
    } else if (offer.effect === "BUNDLE") {
      const items = Array.isArray(offer.bundle)
        ? (offer.bundle as { title: string; qty: number }[])
        : [];
      for (const item of items) {
        for (let i = 0; i < item.qty; i++) {
          await tx.coupon.create({
            data: {
              householdId: me.householdId,
              ownerUserId: me.id,
              title: item.title,
              packName: offer.title,
            },
          });
        }
      }
    }
    await tx.specialOffer.update({
      where: { id: offer.id },
      data: { status: "CONSUMED", resolvedAt: new Date() },
    });
    await tx.logEntry.create({
      data: {
        householdId: me.householdId,
        actorId: me.id,
        subjectUserId: me.id,
        kind: "SPECIAL",
        text: `${me.screenName} used a special reward: ${offer.title}`,
      },
    });
    for (const o of others) {
      await tx.notice.create({
        data: {
          householdId: me.householdId,
          userId: o.id,
          kind: "SPECIAL_USED",
          text: `${me.screenName} used a special reward: ${offer.title}`,
          fromUserId: me.id,
        },
      });
    }
  });
  revalidatePath("/");
  return ok();
}

export async function useCoupon(couponId: string): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (!me) return fail("Not signed in");
  const coupon = await prisma.coupon.findFirst({
    where: { id: couponId, householdId: me.householdId },
  });
  if (!coupon) return fail("Not found");
  if (coupon.ownerUserId !== me.id) return fail("That coupon isn't yours.");
  if (coupon.status !== "AVAILABLE") return fail("That coupon is already used.");
  const others = await otherAdults(me.householdId, me.id);
  await prisma.$transaction(async (tx) => {
    await tx.coupon.update({
      where: { id: coupon.id },
      data: { status: "USED", usedAt: new Date() },
    });
    await tx.logEntry.create({
      data: {
        householdId: me.householdId,
        actorId: me.id,
        subjectUserId: me.id,
        kind: "COUPON",
        text: `${me.screenName} used a coupon: ${coupon.title}`,
      },
    });
    for (const o of others) {
      await tx.notice.create({
        data: {
          householdId: me.householdId,
          userId: o.id,
          kind: "COUPON_USED",
          text: `${me.screenName} used a coupon: ${coupon.title}`,
          fromUserId: me.id,
        },
      });
    }
  });
  revalidatePath("/");
  return ok();
}
