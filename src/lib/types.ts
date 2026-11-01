// Serializable DTOs passed from the server page into the client tabs.

export type MeDTO = {
  id: string;
  screenName: string;
  points: number;
  tokens: number;
  weeklyDowntimeHours: number;
};

export type MemberDTO = {
  id: string;
  screenName: string;
};

export type ChildDTO = {
  id: string;
  name: string;
  tokens: number;
  weeklyAllowanceDollars: number;
  weeklyTokenAmount: number;
};

export type OfferDTO = {
  id: string;
  fromUserId: string;
  fromName: string;
  toUserId: string;
  toName: string;
  amount: number;
  counterAmount: number | null;
  reason: string | null;
  status: string;
  createdAt: string;
};

export type BountyDTO = {
  id: string;
  title: string;
  details: string | null;
  value: number;
  dueDate: string | null;
  status: string;
  postedById: string;
  postedByName: string;
  approvedById: string | null;
  approvedByName: string | null;
  verifiedByName: string | null;
  claimedById: string | null;
  claimedByName: string | null;
  kidClaimChildId: string | null;
  kidClaimChildName: string | null;
  kidApprovals: string[];
  seenByMe: boolean;
  createdAt: string;
  completedAt: string | null;
};

export type NoticeDTO = {
  id: string;
  kind: string;
  text: string;
  amount: number | null;
  fromName: string | null;
  logEntryId: string | null;
  createdAt: string;
};

export type PendingInviteDTO = {
  id: string;
  screenName: string;
};

export type LogEntryDTO = {
  id: string;
  kind: string;
  text: string;
  amount: number | null;
  note: string | null;
  counteredFrom: number | null;
  redeemAcked: boolean | null;
  actorId: string | null;
  subjectUserId: string | null;
  childId: string | null;
  createdAt: string;
  seenByMe: boolean;
  indirect: boolean;
};

export type StatsDTO = {
  ptsUsedWeek: number;
  avgPtsUsedWeek: number;
  tokensUsedWeek: number;
  avgTokensEarnedWeek: number;
  allTimeTokensEarned: number;
  totalRequestsMade: number;
  totalRequestsCompleted: number;
  avgFreeTimePct: number;
};

export type AppData = {
  me: MeDTO;
  members: MemberDTO[];
  children: ChildDTO[];
  offers: OfferDTO[];
  bounties: BountyDTO[];
  notices: NoticeDTO[];
  pendingInvitees: PendingInviteDTO[];
  logEntries: LogEntryDTO[];
  stats: StatsDTO;
  expiryLabel: string;
  todayChicago: string;
  defaultDueDate: string;
};
