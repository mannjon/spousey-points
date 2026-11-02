"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getAppData } from "@/lib/data";
import type { AppData } from "@/lib/types";

// Full app state for the signed-in user, reloaded by the client shell
// after any mutation.
export async function refreshData(): Promise<AppData | null> {
  const me = await getCurrentUser();
  if (!me) return null;
  return getAppData(me);
}
import { points as pointsText, tokens as tokensText } from "@/lib/log";
import { parseDateTimeInput } from "@/lib/time";
import { verifierId } from "@/lib/bounty";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

const fail = (error: string): ActionResult => ({ ok: false, error });
const ok = (id?: string): ActionResult => (id ? { ok: true, id } : { ok: true });

function validAmount(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 9999;
}

// ---------------------------------------------------------------- offers

export async function placeOffer(input: {
  toUserId: string;
  amount: number;
  reason: string;
}): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (!me) return fail("Not signed in");
  if (!validAmount(input.amount)) return fail("Invalid amount");
  if (input.amount > me.points) return fail("Not enough points");
  const recipient = await prisma.user.findFirst({
    where: { id: input.toUserId, householdId: me.householdId, NOT: { id: me.id } },
  });
  if (!recipient) return fail("Invalid recipient");
  const offer = await prisma.offer.create({
    data: {
      householdId: me.householdId,
      fromUserId: me.id,
      toUserId: recipient.id,
      amount: input.amount,
      reason: input.reason.trim() || null,
      status: "PENDING",
    },
  });
  revalidatePath("/");
  return ok(offer.id);
}

async function settleOffer(offerId: string, finalAmount: number) {
  return prisma.$transaction(async (tx) => {
    const offer = await tx.offer.findUnique({ where: { id: offerId } });
    if (!offer) return fail("Not found");
    const spender = await tx.user.findUnique({ where: { id: offer.fromUserId } });
    const receiver = await tx.user.findUnique({ where: { id: offer.toUserId } });
    if (!spender || !receiver) return fail("Not found");
    if (spender.points < finalAmount) return fail("Not enough points");
    await tx.user.update({
      where: { id: spender.id },
      data: { points: { decrement: finalAmount } },
    });
    await tx.user.update({
      where: { id: receiver.id },
      data: { tokens: { increment: finalAmount } },
    });
    await tx.offer.update({
      where: { id: offer.id },
      data: { status: "ACCEPTED", amount: finalAmount, resolvedAt: new Date() },
    });
    await tx.logEntry.create({
      data: {
        householdId: offer.householdId,
        actorId: spender.id,
        subjectUserId: receiver.id,
        kind: "OFFER_ACCEPTED",
        text: `${spender.screenName} paid ${receiver.screenName} — ${offer.reason || "a favor"}`,
        amount: finalAmount,
        counteredFrom: finalAmount !== offer.amount ? offer.amount : null,
      },
    });
    return ok();
  });
}

export async function acceptOffer(offerId: string): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (!me) return fail("Not signed in");
  const offer = await prisma.offer.findFirst({
    where: { id: offerId, householdId: me.householdId },
  });
  if (!offer) return fail("Not found");
  if (offer.status === "PENDING" && offer.toUserId === me.id) {
    const res = await settleOffer(offer.id, offer.amount);
    revalidatePath("/");
    return res;
  }
  if (offer.status === "COUNTERED" && offer.fromUserId === me.id && offer.counterAmount) {
    const res = await settleOffer(offer.id, offer.counterAmount);
    revalidatePath("/");
    return res;
  }
  return fail("Not actionable");
}

export async function declineOffer(offerId: string): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (!me) return fail("Not signed in");
  const offer = await prisma.offer.findFirst({
    where: { id: offerId, householdId: me.householdId },
  });
  if (!offer) return fail("Not found");
  const actionable =
    (offer.status === "PENDING" && offer.toUserId === me.id) ||
    (offer.status === "COUNTERED" && (offer.fromUserId === me.id || offer.toUserId === me.id));
  if (!actionable) return fail("Not actionable");
  const spender = await prisma.user.findUnique({ where: { id: offer.fromUserId } });
  const receiver = await prisma.user.findUnique({ where: { id: offer.toUserId } });
  const wasCounter = offer.status === "COUNTERED";
  const inPlay = wasCounter && offer.counterAmount ? offer.counterAmount : offer.amount;
  await prisma.$transaction([
    prisma.offer.update({
      where: { id: offer.id },
      data: { status: "DECLINED", resolvedAt: new Date() },
    }),
    prisma.logEntry.create({
      data: {
        householdId: me.householdId,
        actorId: offer.fromUserId,
        subjectUserId: offer.toUserId,
        kind: "OFFER_DECLINED",
        text: wasCounter
          ? `${spender?.screenName ?? ""} declined the counter from ${receiver?.screenName ?? ""} — ${offer.reason || "a favor"}`
          : `${receiver?.screenName ?? ""} declined an offer from ${spender?.screenName ?? ""} — ${offer.reason || "a favor"}`,
        amount: inPlay,
      },
    }),
  ]);
  revalidatePath("/");
  return ok();
}

// An offer addressed to someone invited at first login who has not signed
// up yet: nothing moves and no points are spent — the request is recorded
// in the shared log, waiting for them, exactly as the app has always done.
export async function placeOfferToInvitee(input: {
  pendingInviteId: string;
  amount: number;
  reason: string;
}): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (!me) return fail("Not signed in");
  if (!validAmount(input.amount)) return fail("Invalid amount");
  if (input.amount > me.points) return fail("Not enough points");
  const invite = await prisma.pendingInvite.findFirst({
    where: { id: input.pendingInviteId, householdId: me.householdId },
  });
  if (!invite) return fail("Invalid recipient");
  const reason = input.reason.trim();
  await prisma.logEntry.create({
    data: {
      householdId: me.householdId,
      actorId: me.id,
      kind: "OFFER_TO_INVITEE",
      text: `${me.screenName} posted a request to ${invite.screenName} (not signed up yet) — ${reason || "a favor"}. It will be waiting, with the shared log, when they sign up.`,
      amount: input.amount,
    },
  });
  revalidatePath("/");
  return ok();
}

export async function cancelOffer(offerId: string): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (!me) return fail("Not signed in");
  const offer = await prisma.offer.findFirst({
    where: { id: offerId, householdId: me.householdId, fromUserId: me.id },
  });
  if (!offer || (offer.status !== "PENDING" && offer.status !== "COUNTERED")) {
    return fail("Not actionable");
  }
  await prisma.offer.update({
    where: { id: offer.id },
    data: { status: "CANCELLED", resolvedAt: new Date() },
  });
  revalidatePath("/");
  return ok();
}

export async function counterOffer(
  offerId: string,
  amount: number
): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (!me) return fail("Not signed in");
  if (!validAmount(amount)) return fail("Invalid amount");
  const offer = await prisma.offer.findFirst({
    where: { id: offerId, householdId: me.householdId, toUserId: me.id, status: "PENDING" },
  });
  if (!offer) return fail("Not actionable");
  await prisma.offer.update({
    where: { id: offer.id },
    data: { status: "COUNTERED", counterAmount: amount },
  });
  revalidatePath("/");
  return ok();
}

// ------------------------------------------------------------- balances

export async function loveTap(toUserId: string): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (!me) return fail("Not signed in");
  const recipient = await prisma.user.findFirst({
    where: { id: toUserId, householdId: me.householdId, NOT: { id: me.id } },
  });
  if (!recipient) return fail("Invalid recipient");
  const res = await prisma.$transaction(async (tx) => {
    const sender = await tx.user.findUnique({ where: { id: me.id } });
    if (!sender || sender.points < 1) return fail("Not enough points");
    await tx.user.update({
      where: { id: me.id },
      data: { points: { decrement: 1 } },
    });
    await tx.user.update({
      where: { id: recipient.id },
      data: { tokens: { increment: 1 } },
    });
    const text = `${me.screenName} sent ${recipient.screenName} a Love Tap`;
    await tx.logEntry.create({
      data: {
        householdId: me.householdId,
        actorId: me.id,
        subjectUserId: recipient.id,
        kind: "LOVE_TAP",
        text,
        amount: 1,
      },
    });
    await tx.notice.create({
      data: {
        householdId: me.householdId,
        userId: recipient.id,
        kind: "LOVE_TAP",
        text: `${me.screenName} sent you a Love Tap`,
        fromUserId: me.id,
        amount: 1,
      },
    });
    return ok();
  });
  revalidatePath("/");
  return res;
}

// Form-post entry point for the Love Tap button: a plain form submit
// reaches the server even when the page's click handlers never run.
export async function loveTapFormAction(toUserId: string, _formData: FormData): Promise<void> {
  await loveTap(toUserId);
}

export async function redeemTokens(input: {
  toUserId: string;
  amount: number;
  reason: string;
}): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (!me) return fail("Not signed in");
  if (!validAmount(input.amount)) return fail("Invalid amount");
  const reason = input.reason.trim();
  const recipient = await prisma.user.findFirst({
    where: { id: input.toUserId, householdId: me.householdId, NOT: { id: me.id } },
  });
  if (!recipient) return fail("Invalid recipient");
  const res = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: me.id } });
    if (!user || user.tokens < input.amount) return fail("Not enough tokens");
    await tx.user.update({
      where: { id: me.id },
      data: { tokens: { decrement: input.amount } },
    });
    // The redemption is in the log from this moment; the notice carries it
    // to the other user, whose "Add to log" acknowledges it.
    const entry = await tx.logEntry.create({
      data: {
        householdId: me.householdId,
        actorId: me.id,
        subjectUserId: recipient.id,
        kind: "REDEEM",
        text: `${me.screenName} redeemed ${input.amount} ${input.amount === 1 ? "token" : "tokens"}${reason ? ` — ${reason}` : ""}`,
        amount: input.amount,
      },
    });
    await tx.notice.create({
      data: {
        householdId: me.householdId,
        userId: recipient.id,
        kind: "REDEEM",
        text: entry.text,
        fromUserId: me.id,
        amount: input.amount,
        logEntryId: entry.id,
      },
    });
    return ok();
  });
  revalidatePath("/");
  return res;
}

export async function acceptNotice(noticeId: string): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (!me) return fail("Not signed in");
  const notice = await prisma.notice.findFirst({
    where: { id: noticeId, householdId: me.householdId, userId: me.id, accepted: false },
  });
  if (!notice) return fail("Not found");
  await prisma.notice.update({ where: { id: notice.id }, data: { accepted: true } });
  revalidatePath("/");
  return ok();
}

export async function buyPoints(amount: number): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (!me) return fail("Not signed in");
  if (!validAmount(amount)) return fail("Invalid amount");
  const res = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: me.id } });
    if (!user || user.tokens < amount) return fail("Not enough tokens");
    await tx.user.update({
      where: { id: me.id },
      data: { tokens: { decrement: amount }, points: { increment: amount } },
    });
    await tx.logEntry.create({
      data: {
        householdId: me.householdId,
        actorId: me.id,
        kind: "BUY_POINTS",
        text: `${me.screenName} traded ${amount} ${amount === 1 ? "token" : "tokens"} for ${amount} ${amount === 1 ? "point" : "points"}`,
        amount,
      },
    });
    return ok();
  });
  revalidatePath("/");
  return res;
}

// ------------------------------------------------------------- children

export async function childAdjust(childId: string, delta: number): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (!me) return fail("Not signed in");
  if (delta !== 1 && delta !== -1) return fail("Invalid delta");
  const child = await prisma.child.findFirst({
    where: { id: childId, householdId: me.householdId },
  });
  if (!child) return fail("Not found");
  if (delta === -1 && child.tokens <= 0) return ok();
  await prisma.$transaction(async (tx) => {
    await tx.child.update({
      where: { id: child.id },
      data: { tokens: { increment: delta } },
    });
    await tx.logEntry.create({
      data: {
        householdId: me.householdId,
        actorId: me.id,
        childId: child.id,
        kind: delta === 1 ? "CHILD_CREDIT" : "CHILD_DEDUCT",
        text:
          delta === 1
            ? `${me.screenName} credited 1 token to ${child.name}`
            : `${me.screenName} deducted 1 token from ${child.name}`,
        amount: 1,
      },
    });
  });
  revalidatePath("/");
  return ok();
}

export async function updateChildSettings(fd: FormData) {
  const me = await getCurrentUser();
  if (!me) return;
  const childId = String(fd.get("childId") ?? "");
  const child = await prisma.child.findFirst({
    where: { id: childId, householdId: me.householdId },
  });
  if (!child) return;
  const allowance = Number.parseFloat(String(fd.get("weeklyAllowanceDollars") ?? ""));
  const tokenAmount = Number.parseInt(String(fd.get("weeklyTokenAmount") ?? ""), 10);
  await prisma.child.update({
    where: { id: child.id },
    data: {
      ...(Number.isFinite(allowance) && allowance >= 0
        ? { weeklyAllowanceDollars: allowance }
        : {}),
      ...(Number.isFinite(tokenAmount) && tokenAmount >= 1
        ? { weeklyTokenAmount: tokenAmount }
        : {}),
    },
  });
  revalidatePath("/");
}

// ------------------------------------------------------------- bounties

export async function postBounty(input: {
  title: string;
  details: string;
  value: number;
  dueDate: string;
}): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (!me) return fail("Not signed in");
  const title = input.title.trim();
  if (!title) return fail("Title required");
  if (!validAmount(input.value)) return fail("Invalid value");
  const due = parseDateTimeInput(input.dueDate);
  if (!due) return fail("Invalid date");
  const bounty = await prisma.$transaction(async (tx) => {
    const created = await tx.bounty.create({
      data: {
        householdId: me.householdId,
        title,
        details: input.details.trim() || null,
        value: input.value,
        dueDate: due,
        status: "PENDING_APPROVAL",
        postedById: me.id,
      },
    });
    await tx.bountySeen.create({ data: { bountyId: created.id, userId: me.id } });
    await tx.logEntry.create({
      data: {
        householdId: me.householdId,
        actorId: me.id,
        kind: "BOUNTY_POSTED",
        text: `${me.screenName} posted bounty “${title}” — ${input.value} ${input.value === 1 ? "token" : "tokens"}, awaiting approval`,
        amount: input.value,
      },
    });
    return created;
  });
  revalidatePath("/");
  return ok(bounty.id);
}

async function getBounty(me: { id: string; householdId: string }, bountyId: string) {
  return prisma.bounty.findFirst({
    where: { id: bountyId, householdId: me.householdId },
    include: { postedBy: true, claimedBy: true, kidClaimChild: true },
  });
}

export async function approveBounty(input: {
  bountyId: string;
  value: number;
  dueDate: string;
}): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (!me) return fail("Not signed in");
  if (!validAmount(input.value)) return fail("Invalid value");
  const due = parseDateTimeInput(input.dueDate);
  if (!due) return fail("Invalid date");
  const bounty = await getBounty(me, input.bountyId);
  if (!bounty || bounty.status !== "PENDING_APPROVAL" || bounty.postedById === me.id) {
    return fail("Not actionable");
  }
  await prisma.bounty.update({
    where: { id: bounty.id },
    data: { status: "OPEN", value: input.value, dueDate: due, approvedById: me.id },
  });
  await prisma.logEntry.create({
    data: {
      householdId: me.householdId,
      actorId: me.id,
      kind: "BOUNTY_APPROVED",
      text: `${me.screenName} approved bounty “${bounty.title}” — ${input.value} ${input.value === 1 ? "token" : "tokens"}`,
      amount: input.value,
    },
  });
  revalidatePath("/");
  return ok();
}

export async function declineBounty(bountyId: string): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (!me) return fail("Not signed in");
  const bounty = await getBounty(me, bountyId);
  if (!bounty || bounty.status !== "PENDING_APPROVAL" || bounty.postedById === me.id) {
    return fail("Not actionable");
  }
  await prisma.bounty.update({ where: { id: bounty.id }, data: { status: "DECLINED" } });
  await prisma.logEntry.create({
    data: {
      householdId: me.householdId,
      actorId: me.id,
      kind: "BOUNTY_DECLINED",
      text: `${me.screenName} declined bounty “${bounty.title}”`,
      amount: bounty.value,
    },
  });
  revalidatePath("/");
  return ok();
}

export async function claimBounty(bountyId: string): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (!me) return fail("Not signed in");
  const bounty = await getBounty(me, bountyId);
  if (!bounty || bounty.status !== "OPEN" || bounty.claimedById || bounty.kidClaimChildId) {
    return fail("Not actionable");
  }
  await prisma.bounty.update({
    where: { id: bounty.id },
    data: { status: "CLAIMED", claimedById: me.id },
  });
  await prisma.logEntry.create({
    data: {
      householdId: me.householdId,
      actorId: me.id,
      kind: "BOUNTY_GRABBED",
      text: `${me.screenName} grabbed bounty “${bounty.title}”`,
      amount: bounty.value,
    },
  });
  revalidatePath("/");
  return ok();
}

export async function kidClaimBounty(
  bountyId: string,
  childId: string
): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (!me) return fail("Not signed in");
  const bounty = await getBounty(me, bountyId);
  const child = await prisma.child.findFirst({
    where: { id: childId, householdId: me.householdId },
  });
  if (!bounty || !child || bounty.status !== "OPEN" || bounty.claimedById || bounty.kidClaimChildId) {
    return fail("Not actionable");
  }
  await prisma.bounty.update({
    where: { id: bounty.id },
    data: { kidClaimChildId: child.id },
  });
  await prisma.logEntry.create({
    data: {
      householdId: me.householdId,
      actorId: me.id,
      childId: child.id,
      kind: "KID_CLAIM",
      text: `${child.name} wants bounty “${bounty.title}” — both parents must approve before the grab`,
      amount: bounty.value,
    },
  });
  revalidatePath("/");
  return ok();
}

export async function approveKidClaim(bountyId: string): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (!me) return fail("Not signed in");
  const bounty = await getBounty(me, bountyId);
  if (!bounty || bounty.status !== "OPEN" || !bounty.kidClaimChildId || !bounty.kidClaimChild) {
    return fail("Not actionable");
  }
  const parentCount = await prisma.user.count({ where: { householdId: me.householdId } });
  if (parentCount < 2) return fail("Needs both parents");
  await prisma.bountyKidApproval.upsert({
    where: { bountyId_parentId: { bountyId: bounty.id, parentId: me.id } },
    create: { bountyId: bounty.id, parentId: me.id },
    update: {},
  });
  // Both parents approving unlocks the grab — it does not take the bounty
  // itself. The grab is its own step (kidGrabBounty).
  revalidatePath("/");
  return ok();
}

// After both parents have approved, a parent grabs the bounty for the child.
export async function kidGrabBounty(bountyId: string): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (!me) return fail("Not signed in");
  const bounty = await getBounty(me, bountyId);
  if (!bounty || bounty.status !== "OPEN" || !bounty.kidClaimChildId) {
    return fail("Not actionable");
  }
  const approvals = await prisma.bountyKidApproval.count({
    where: { bountyId: bounty.id },
  });
  if (approvals < 2) return fail("Needs both parents");
  await prisma.bounty.update({
    where: { id: bounty.id },
    data: { status: "CLAIMED" },
  });
  revalidatePath("/");
  return ok();
}

// The hunter lets a grabbed bounty go; it returns to the open pool. A kid
// claim that is let go clears the claim and both parents' approvals.
export async function releaseBounty(bountyId: string): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (!me) return fail("Not signed in");
  const bounty = await getBounty(me, bountyId);
  if (!bounty || bounty.status !== "CLAIMED") return fail("Not actionable");
  if (!bounty.kidClaimChildId && bounty.claimedById !== me.id) {
    return fail("Not actionable");
  }
  await prisma.$transaction(async (tx) => {
    if (bounty.kidClaimChildId) {
      await tx.bountyKidApproval.deleteMany({ where: { bountyId: bounty.id } });
    }
    await tx.bounty.update({
      where: { id: bounty.id },
      data: { status: "OPEN", claimedById: null, kidClaimChildId: null },
    });
  });
  revalidatePath("/");
  return ok();
}

export async function withdrawKidClaim(bountyId: string): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (!me) return fail("Not signed in");
  const bounty = await getBounty(me, bountyId);
  if (!bounty || bounty.status !== "OPEN" || !bounty.kidClaimChildId) {
    return fail("Not actionable");
  }
  await prisma.$transaction(async (tx) => {
    await tx.bountyKidApproval.deleteMany({ where: { bountyId: bounty.id } });
    await tx.bounty.update({
      where: { id: bounty.id },
      data: { kidClaimChildId: null },
    });
  });
  revalidatePath("/");
  return ok();
}

export async function markBountyDone(bountyId: string): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (!me) return fail("Not signed in");
  const bounty = await getBounty(me, bountyId);
  if (!bounty || bounty.status !== "CLAIMED") return fail("Not actionable");
  // A user claimer marks their own work; a kid claim is marked by a parent.
  if (!bounty.kidClaimChildId && bounty.claimedById !== me.id) {
    return fail("Not actionable");
  }
  const verifier = verifierId(bounty);
  const verifierUser = verifier
    ? await prisma.user.findUnique({ where: { id: verifier } })
    : null;
  const workerName = bounty.kidClaimChild
    ? bounty.kidClaimChild.name
    : me.screenName;
  await prisma.$transaction([
    prisma.bounty.update({
      where: { id: bounty.id },
      data: { status: "AWAITING_VERIFY" },
    }),
    prisma.logEntry.create({
      data: {
        householdId: me.householdId,
        actorId: me.id,
        childId: bounty.kidClaimChildId,
        kind: "BOUNTY_CLAIMED",
        text: `${workerName} claimed bounty “${bounty.title}” — awaiting ${verifierUser?.screenName ?? "the verifier"} to Accept`,
        amount: bounty.value,
      },
    }),
  ]);
  revalidatePath("/");
  return ok();
}

export async function verifyBounty(
  bountyId: string,
  accept: boolean
): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (!me) return fail("Not signed in");
  const bounty = await getBounty(me, bountyId);
  if (!bounty || bounty.status !== "AWAITING_VERIFY") return fail("Not actionable");
  if (verifierId(bounty) !== me.id) return fail("Not the verifier");
  if (!accept) {
    await prisma.bounty.update({ where: { id: bounty.id }, data: { status: "CLAIMED" } });
    revalidatePath("/");
    return ok();
  }
  const child = bounty.kidClaimChild;
  const claimer = bounty.claimedBy;
  await prisma.$transaction(async (tx) => {
    await tx.bounty.update({
      where: { id: bounty.id },
      data: { status: "COMPLETED", completedAt: new Date(), workVerifiedById: me.id },
    });
    if (child) {
      await tx.child.update({
        where: { id: child.id },
        data: { tokens: { increment: bounty.value } },
      });
      await tx.logEntry.create({
        data: {
          householdId: me.householdId,
          actorId: me.id,
          childId: child.id,
          kind: "BOUNTY_EARNED",
          text: `Bounty paid — ${child.name} earned ${tokensText(bounty.value)} for “${bounty.title}”`,
          amount: bounty.value,
        },
      });
    } else if (claimer) {
      await tx.user.update({
        where: { id: claimer.id },
        data: { tokens: { increment: bounty.value } },
      });
      await tx.logEntry.create({
        data: {
          householdId: me.householdId,
          actorId: me.id,
          subjectUserId: claimer.id,
          kind: "BOUNTY_EARNED",
          text: `Bounty paid — ${claimer.screenName} earned ${tokensText(bounty.value)} for “${bounty.title}”`,
          amount: bounty.value,
        },
      });
    }
  });
  revalidatePath("/");
  return ok();
}

export async function markBountySeen(bountyId: string): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (!me) return fail("Not signed in");
  const bounty = await prisma.bounty.findFirst({
    where: { id: bountyId, householdId: me.householdId },
    select: { id: true },
  });
  if (!bounty) return fail("Not found");
  await prisma.bountySeen.upsert({
    where: { bountyId_userId: { bountyId: bounty.id, userId: me.id } },
    create: { bountyId: bounty.id, userId: me.id },
    update: {},
  });
  revalidatePath("/");
  return ok();
}

// ------------------------------------------------------------------ log

export async function updateLogNote(
  entryId: string,
  note: string
): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (!me) return fail("Not signed in");
  const entry = await prisma.logEntry.findFirst({
    where: { id: entryId, householdId: me.householdId },
    select: { id: true },
  });
  if (!entry) return fail("Not found");
  await prisma.logEntry.update({
    where: { id: entry.id },
    data: { note: note.trim() || null },
  });
  revalidatePath("/");
  return ok();
}

export async function markLogSeen(entryIds: string[]): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (!me) return fail("Not signed in");
  const ids = [...new Set(entryIds)].slice(0, 200);
  if (ids.length === 0) return ok();
  const entries = await prisma.logEntry.findMany({
    where: { id: { in: ids }, householdId: me.householdId },
    select: { id: true },
  });
  if (entries.length > 0) {
    await prisma.logSeen.createMany({
      data: entries.map((e) => ({ logEntryId: e.id, userId: me.id })),
      skipDuplicates: true,
    });
  }
  revalidatePath("/");
  return ok();
}
