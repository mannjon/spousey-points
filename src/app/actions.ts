"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { Version } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  hashPassword,
  verifyPassword,
  setSession,
  clearSession,
  getCurrentUser,
} from "@/lib/auth";
import { classify } from "@/lib/classify";

function str(fd: FormData, key: string) {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function num(fd: FormData, key: string): number | null {
  const v = str(fd, key);
  if (!v) return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

export async function login(fd: FormData) {
  const screenName = str(fd, "screenName");
  const password = str(fd, "password");
  const user = await prisma.user.findUnique({ where: { screenName } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    redirect("/login?error=1");
  }
  await setSession(user.id);
  redirect("/");
}

export async function signup(fd: FormData) {
  const screenName = str(fd, "screenName");
  const password = str(fd, "password");
  if (!screenName || !password) redirect("/login?error=missing");

  const existing = await prisma.user.findUnique({ where: { screenName } });
  if (existing) redirect("/login?error=taken");

  const kidsAtHome = str(fd, "kids") === "yes";
  const version = classify({
    kidsAtHome,
    ageBand: str(fd, "age"),
    workStatus: str(fd, "work"),
    freeTimeBand: str(fd, "freetime"),
  });

  // If this screen name was invited at someone's first login, the new user
  // joins that household instead of starting a new one.
  const invite = await prisma.pendingInvite.findFirst({
    where: { screenName: { equals: screenName, mode: "insensitive" } },
    orderBy: { createdAt: "asc" },
  });

  const household = invite
    ? { id: invite.householdId }
    : await prisma.household.create({ data: {} });
  const user = await prisma.user.create({
    data: {
      householdId: household.id,
      screenName,
      passwordHash: await hashPassword(password),
      version,
      points: 100,
      tokens: 0,
      pointsMarkerAt: new Date(),
    },
  });

  if (!invite && version === "FAMILY") {
    const names = str(fd, "childNames")
      .split(/[\n,]/)
      .map((n) => n.trim())
      .filter(Boolean);
    const allowance = Number.parseFloat(str(fd, "childAllowance"));
    for (const name of names) {
      const child = await prisma.child.create({
        data: {
          householdId: household.id,
          name,
          tokens: 100,
          dropMarkerAt: new Date(),
          weeklyAllowanceDollars:
            Number.isFinite(allowance) && allowance >= 0 ? allowance : 5,
        },
      });
      await prisma.logEntry.create({
        data: {
          householdId: household.id,
          kind: "WEEKLY_DROP",
          text: `${name} received the weekly drop of 100 tokens`,
          amount: 100,
          childId: child.id,
        },
      });
    }
  }

  await setSession(user.id);
  redirect("/");
}

export async function logout() {
  await clearSession();
  redirect("/login");
}

// First-login invite sheet: sending records the invitee screen names as
// pending invites on the household and marks the prompt done in the same
// flow, so it never appears again.
export async function inviteSend(fd: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const names = [str(fd, "inviteName") || str(fd, "inviteContact")].filter(Boolean);
  for (const screenName of names) {
    await prisma.pendingInvite.create({
      data: {
        householdId: user.householdId,
        invitedById: user.id,
        screenName,
      },
    });
    await prisma.logEntry.create({
      data: {
        householdId: user.householdId,
        actorId: user.id,
        kind: "INVITE",
        text: `Invite sent to ${screenName}`,
        amount: 0,
      },
    });
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { invitePromptDone: true },
  });
  revalidatePath("/");
}

export async function inviteDismiss() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await prisma.user.update({
    where: { id: user.id },
    data: { invitePromptDone: true },
  });
  revalidatePath("/");
}

export async function updateDowntime(fd: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const hours = num(fd, "weeklyDowntimeHours");
  if (hours !== null && hours > 0) {
    await prisma.user.update({
      where: { id: user.id },
      data: { weeklyDowntimeHours: hours },
    });
  }
  revalidatePath("/");
}

export async function changeVersion(fd: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const version = str(fd, "version") as Version;
  if (["SPOUSEY", "SILVER", "FAMILY"].includes(version)) {
    await prisma.user.update({
      where: { id: user.id },
      data: { version },
    });
  }
  revalidatePath("/");
}
