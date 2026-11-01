// Bounty rules shared by the server page and the client board/modal.

export type BountyLike = {
  postedById: string;
  approvedById: string | null;
  claimedById: string | null;
  kidClaimChildId: string | null;
};

export const BOUNTY_STATUS_LABEL: Record<string, string> = {
  PENDING_APPROVAL: "Pending approval",
  OPEN: "Open — up for grabs",
  CLAIMED: "Grabbed — in progress",
  AWAITING_VERIFY: "Claimed — awaiting Accept",
  COMPLETED: "Completed · Paid",
  DECLINED: "Declined",
  EXPIRED: "Expired",
};

export function tokenWord(n: number): string {
  return n === 1 ? "token" : "tokens";
}

// Printed status for posters and the modal, with the app's wording and
// the CSS key each status carries.
export function bountyStatusInfo(
  status: string,
  dueDate: string | null,
  now: Date = new Date()
): { key: string; label: string } {
  const expired =
    status !== "COMPLETED" && dueDate !== null && now.getTime() > new Date(dueDate).getTime();
  if (status === "COMPLETED") return { key: "done", label: "Completed · Paid" };
  if (expired) return { key: "expired", label: "Expired" };
  if (status === "PENDING_APPROVAL") return { key: "pending", label: "Pending approval" };
  if (status === "OPEN") return { key: "open", label: "Open — up for grabs" };
  if (status === "CLAIMED") return { key: "grabbed", label: "Grabbed — in progress" };
  if (status === "AWAITING_VERIFY") return { key: "verify", label: "Claimed — awaiting Accept" };
  if (status === "DECLINED") return { key: "expired", label: "Declined" };
  if (status === "EXPIRED") return { key: "expired", label: "Expired" };
  return { key: "open", label: status };
}

export function countdownText(
  status: string,
  dueDate: string | null,
  now: Date = new Date()
): { text: string; expired: boolean; soon: boolean } {
  if (status === "COMPLETED") return { text: "Paid ✓", expired: false, soon: false };
  if (!dueDate) return { text: "", expired: false, soon: false };
  const ms = new Date(dueDate).getTime() - now.getTime();
  if (ms <= 0) {
    const ago = Math.abs(ms);
    const hd = Math.floor(ago / 3600000);
    const dd = Math.floor(hd / 24);
    return {
      text:
        dd > 0
          ? `Expired ${dd}d ${hd % 24}h ago`
          : `Expired ${hd}h ${Math.floor((ago % 3600000) / 60000)}m ago`,
      expired: true,
      soon: false,
    };
  }
  let s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  s %= 86400;
  const h = Math.floor(s / 3600);
  s %= 3600;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  const txt =
    (d > 0 ? `${d}d ` : "") +
    `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return { text: txt, expired: false, soon: ms < 86400000 };
}

// Board ordering: active first (open, grabbed, awaiting verify, pending
// approval), completed next, expired/declined last.
export function bountyRank(status: string): number {
  switch (status) {
    case "OPEN":
      return 0;
    case "CLAIMED":
      return 1;
    case "AWAITING_VERIFY":
      return 2;
    case "PENDING_APPROVAL":
      return 3;
    case "COMPLETED":
      return 4;
    default:
      return 5;
  }
}

// Who verifies finished work: never the person who did the work.
// - Kid claim: the poster approves the work.
// - Poster did the work: the approver verifies.
// - Anyone else did the work: the poster verifies.
export function verifierId(b: BountyLike): string | null {
  if (!b.claimedById && !b.kidClaimChildId) return null;
  if (b.kidClaimChildId) return b.postedById;
  if (b.claimedById === b.postedById) return b.approvedById;
  return b.postedById;
}
