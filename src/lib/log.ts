// Shared log helpers: pluralization and the "changed indirectly" dot rule.

export function plural(n: number, singular: string): string {
  return `${n} ${singular}${n === 1 ? "" : "s"}`;
}

export function points(n: number): string {
  return plural(n, "point");
}

export function tokens(n: number): string {
  return plural(n, "token");
}

const SYSTEM_KINDS = new Set(["WEEKLY_GRANT", "WEEKLY_DROP", "POINTS_EXPIRED"]);

type EntryLike = {
  kind: string;
  actorId: string | null;
};

// An entry is indirect for a user when it records a change they did not make
// themselves: someone else's action, or a system event. A bounty earning is
// credited to the claimer but caused by the verifier, so it is indirect for
// the claimer too.
export function isIndirect(entry: EntryLike, userId: string): boolean {
  if (entry.kind === "BOUNTY_EARNED" && entry.actorId === userId) return true;
  if (SYSTEM_KINDS.has(entry.kind)) return true;
  return entry.actorId !== userId;
}
