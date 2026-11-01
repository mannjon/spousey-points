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
  if (!screenName || !password) redirect("/signup?error=1");

  const existing = await prisma.user.findUnique({ where: { screenName } });
  if (existing) redirect("/signup?error=taken");

  const kidsAtHome = fd.get("kidsAtHome") === "on";
  const version = classify({
    kidsAtHome,
    age: num(fd, "age"),
    retired: fd.get("retired") === "on",
    freeTimeHours: num(fd, "freeTimeHours"),
  });

  const household = await prisma.household.create({ data: {} });
  const user = await prisma.user.create({
    data: {
      householdId: household.id,
      screenName,
      passwordHash: await hashPassword(password),
      version,
      points: 100,
      tokens: 0,
    },
  });

  if (version === "FAMILY") {
    const names = str(fd, "childNames")
      .split(/[\n,]/)
      .map((n) => n.trim())
      .filter(Boolean);
    for (const name of names) {
      await prisma.child.create({
        data: { householdId: household.id, name, tokens: 0 },
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
  const names = str(fd, "invitees")
    .split(/[\n,]/)
    .map((n) => n.trim())
    .filter(Boolean);
  for (const screenName of names) {
    await prisma.pendingInvite.create({
      data: {
        householdId: user.householdId,
        invitedById: user.id,
        screenName,
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
  if (hours !== null && hours >= 0) {
    await prisma.user.update({
      where: { id: user.id },
      data: { weeklyDowntimeHours: hours },
    });
  }
  revalidatePath("/settings");
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
  revalidatePath("/settings");
  revalidatePath("/");
}
