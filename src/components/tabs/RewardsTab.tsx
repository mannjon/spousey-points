"use client";

import { useState } from "react";
import type {
  AppData,
  PersonRewardsDTO,
  RewardDTO,
  RewardRequestDTO,
  SpecialOfferDTO,
} from "@/lib/types";
import { playSound } from "@/lib/sounds";
import { acceptNotice } from "@/app/app-actions";
import {
  approveSpecialOffer,
  contribute,
  createReward,
  createTier,
  deleteReward,
  deleteTier,
  finalizeCashIn,
  lockReward,
  redeemSpecialOffer,
  requestCashIn,
  resolveCashIn,
  sendKidReward,
  setPartAmount,
  updateReward,
} from "@/app/reward-actions";
import LockSlider from "@/components/LockSlider";

type Run = (fn: () => Promise<{ ok: boolean; error?: string }>) => Promise<boolean>;

function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

function PeopleIcon({ n }: { n: 2 | 3 }) {
  const person = (x: number, key: number) => (
    <g key={key} transform={`translate(${x} 0)`}>
      <circle cx="6" cy="4.6" r="3.1" fill="currentColor" />
      <path d="M0.4 15.4c0-3.4 2.5-5.4 5.6-5.4s5.6 2 5.6 5.4Z" fill="currentColor" />
    </g>
  );
  const w = n === 2 ? 25 : 38;
  return (
    <svg className="rw-people" viewBox={`0 0 ${w} 16`} width={w} height={16} aria-hidden="true">
      {n === 2
        ? [person(0, 0), person(13, 1)]
        : [person(0, 0), person(13, 1), person(26, 2)]}
    </svg>
  );
}

function PencilGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
      <path
        d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M14.5 6.5l3 3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function LockGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
      <path
        d="M7 10.5V7a5 5 0 0 1 10 0v3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
      />
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2" fill="currentColor" />
    </svg>
  );
}

function CoinGlyph({ lit }: { lit: boolean }) {
  return (
    <svg className="rw-coin" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill={lit ? "#a8741a" : "#5f6b66"} />
      <circle cx="12" cy="12" r="7.4" fill={lit ? "#f5c542" : "#8b968f"} />
      <g transform="translate(6.9 7.3) scale(0.425)">
        <path
          d="M12 21s-8-5.5-8-11a4.5 4.5 0 0 1 8-3 4.5 4.5 0 0 1 8 3c0 5.5-8 11-8 11Z"
          fill={lit ? "#a8741a" : "#5f6b66"}
        />
      </g>
    </svg>
  );
}

// ------------------------------------------------------------ one reward row

function RewardRow({
  reward,
  section,
  meId,
  ownerTokens,
  requests,
  locksUsedByMe,
  run,
  refresh,
  toast,
  onCashInSent,
}: {
  reward: RewardDTO;
  section: PersonRewardsDTO;
  meId: string;
  ownerTokens: number | null;
  requests: RewardRequestDTO[];
  locksUsedByMe: number;
  run: Run;
  refresh: () => Promise<void>;
  toast: (t: string) => void;
  onCashInSent: (cost: number) => void;
}) {
  const [lockOpen, setLockOpen] = useState(false);
  const [lockKey, setLockKey] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [eTitle, setETitle] = useState(reward.title);
  const [eCost, setECost] = useState(String(reward.cost));
  const [eDesc, setEDesc] = useState(reward.description ?? "");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [partEdits, setPartEdits] = useState<Record<string, string>>({});

  const isGoal = reward.kind === "SHARED_GOAL";
  const mine = section.ownerType === "USER" && section.ownerId === meId;
  const affordable = isGoal || ownerTokens === null ? true : ownerTokens >= reward.cost;
  const done = reward.status === "COMPLETED" || reward.status === "FAILED";
  const showAfford = !isGoal && ownerTokens !== null && affordable && !done;
  const canLock = reward.createdById === meId && !reward.locked;
  const canDelete = !(reward.locked && reward.lockedById !== meId);
  const canEdit = mine || section.ownerType === "CHILD";
  const myRequest = requests.find(
    (q) =>
      q.rewardId === reward.id &&
      q.mine &&
      (q.status === "PENDING" || q.status === "APPROVED")
  );

  async function onCashIn() {
    playSound("chaChing");
    if (await run(() => requestCashIn(reward.id))) {
      toast("Sent for approval.");
      await refresh();
      if (!reward.freeRedeem) onCashInSent(reward.cost);
    }
  }

  async function onSendKid() {
    if (await run(() => sendKidReward(reward.id))) {
      toast("Sent.");
      await refresh();
    }
  }

  async function onDelete() {
    if (await run(() => deleteReward(reward.id))) {
      toast("Removed.");
      await refresh();
    }
  }

  async function onSaveEdit() {
    if (
      await run(() =>
        updateReward({
          rewardId: reward.id,
          title: eTitle,
          description: eDesc,
          cost: Math.floor(Number(eCost) || 0),
        })
      )
    ) {
      setEditOpen(false);
      toast("Saved.");
      await refresh();
    }
  }

  async function onLockComplete() {
    if (await run(() => lockReward(reward.id))) {
      setLockOpen(false);
      toast("Locked.");
      await refresh();
    } else {
      setLockKey((k) => k + 1);
    }
  }

  async function onContribute(memberKey: string) {
    const amt = Math.floor(Number(amounts[memberKey]) || 0);
    if (amt <= 0) {
      toast("Enter 1 or more tokens.");
      return;
    }
    if (await run(() => contribute({ rewardId: reward.id, memberKey, amount: amt }))) {
      setAmounts((a) => ({ ...a, [memberKey]: "" }));
      toast("Added.");
      await refresh();
    }
  }

  async function onSetPart(memberKey: string, current: number) {
    const raw = partEdits[memberKey];
    const amt = raw === undefined ? current : Math.floor(Number(raw) || 0);
    if (await run(() => setPartAmount({ rewardId: reward.id, memberKey, amount: amt }))) {
      toast("Part set.");
      await refresh();
    }
  }

  return (
    <div className={`panel rw-row${showAfford ? " rw-afford" : ""}`}>
      <div className="rw-line">
        {mine && !isGoal ? (
          <button
            type="button"
            className="rw-cost rw-coinbtn"
            disabled={!!myRequest}
            onClick={onCashIn}
          >
            {ownerTokens !== null && <CoinGlyph lit={affordable} />}
            {myRequest
              ? myRequest.status === "APPROVED"
                ? "Approved"
                : "Sent"
              : reward.cost}
          </button>
        ) : (
          <div className="rw-cost">
            {!isGoal && ownerTokens !== null && <CoinGlyph lit={affordable} />}
            {reward.cost}
          </div>
        )}
        {reward.audience !== "SELF" && (
          <PeopleIcon n={reward.audience === "FAMILY" ? 3 : 2} />
        )}
        <div className="rw-title">{reward.title}</div>
        {canEdit && !editOpen && (
          <button
            type="button"
            className="rw-iconbtn"
            aria-label="Edit this reward"
            onClick={() => setEditOpen(true)}
          >
            <PencilGlyph />
          </button>
        )}
        {reward.locked ? (
          <span
            className="rw-lockon"
            title={reward.lockedByName ? `Locked by ${reward.lockedByName}` : "Locked"}
          >
            <LockGlyph />
          </span>
        ) : canLock ? (
          <button
            type="button"
            className="rw-iconbtn"
            aria-label="Lock this reward"
            onClick={() => setLockOpen((v) => !v)}
          >
            <LockGlyph />
          </button>
        ) : null}
        {canDelete && !editOpen && (
          <button
            type="button"
            className="rw-iconbtn rw-x"
            aria-label="Remove this reward"
            onClick={onDelete}
          >
            ✕
          </button>
        )}
      </div>

      {isGoal && (
        <div className="rw-sub">
          {reward.status === "COMPLETED"
            ? "Funded"
            : reward.status === "FAILED"
              ? "Ended — tokens returned"
              : `${reward.filledTotal} of ${reward.targetTotal} tokens${
                  reward.dueDate ? ` · Due ${fmtDate(reward.dueDate)}` : ""
                }`}
        </div>
      )}
      {lockOpen && !reward.locked && (
        <div className="rw-lockwrap">
          <LockSlider resetKey={lockKey} onComplete={onLockComplete} />
          {locksUsedByMe >= 10 && (
            <div className="rw-sub">You already have 10 locked rewards.</div>
          )}
        </div>
      )}

      {editOpen && (
        <div>
          <div className="field">
            <label>Title</label>
            <input value={eTitle} onChange={(e) => setETitle(e.target.value)} />
          </div>
          {reward.kind !== "SHARED_GOAL" && (
            <div className="field">
              <label>Token cost</label>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                value={eCost}
                onChange={(e) => setECost(e.target.value)}
              />
            </div>
          )}
          <div className="field">
            <label>Description</label>
            <input value={eDesc} onChange={(e) => setEDesc(e.target.value)} />
          </div>
          <div className="btnrow">
            <button type="button" className="btn green" onClick={onSaveEdit}>
              Save
            </button>
            <button type="button" className="btn ghost" onClick={() => setEditOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {goalOpen && isGoal && (
        <div className="rw-goal">
          {reward.parts.map((p) => {
            const actionable = reward.status === "OPEN" && (p.isMe || p.isChild);
            return (
              <div className="rw-part" key={p.memberKey}>
                <div className="rw-partline">
                  <span className="rw-partname">{p.name}</span>
                  <span className="rw-partamt">
                    {p.contributed} of {p.amount}
                  </span>
                </div>
                {actionable && (
                  <>
                    <div className="amtrow">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        placeholder="Tokens"
                        value={amounts[p.memberKey] ?? ""}
                        onChange={(e) =>
                          setAmounts((a) => ({ ...a, [p.memberKey]: e.target.value }))
                        }
                      />
                      <button
                        type="button"
                        className="btn green"
                        onClick={() => onContribute(p.memberKey)}
                      >
                        Add
                      </button>
                    </div>
                    <div className="amtrow" style={{ marginTop: 18 }}>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        placeholder={`Part: ${p.amount}`}
                        value={partEdits[p.memberKey] ?? ""}
                        onChange={(e) =>
                          setPartEdits((a) => ({ ...a, [p.memberKey]: e.target.value }))
                        }
                      />
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => onSetPart(p.memberKey, p.amount)}
                      >
                        Set part
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
          {reward.status === "OPEN" && (
            <div className="rw-part">
              <div className="rw-partline">
                <span className="rw-partname">Extra from my tokens</span>
              </div>
              <div className="amtrow">
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  placeholder="Tokens"
                  value={amounts["extra"] ?? ""}
                  onChange={(e) => setAmounts((a) => ({ ...a, extra: e.target.value }))}
                />
                <button
                  type="button"
                  className="btn green"
                  onClick={() => onContribute("extra")}
                >
                  Add
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {!editOpen && isGoal && (
        <div className="btnrow">
          <button type="button" className="btn ghost" onClick={() => setGoalOpen((v) => !v)}>
            {goalOpen ? "Close parts" : "Parts"}
          </button>
        </div>
      )}
      {!editOpen && !isGoal && section.ownerType === "CHILD" && (
        <div className="btnrow">
          <button type="button" className="btn green" onClick={onSendKid}>
            Send
          </button>
        </div>
      )}
    </div>
  );
}

function GiftBg() {
  return (
    <svg className="rw-giftbg" viewBox="0 0 24 24" aria-hidden="true">
      <g fill="none" stroke="#ffffff" strokeWidth="1.4">
        <rect x="4" y="10" width="16" height="9.5" rx="1" />
        <rect x="3" y="6.5" width="18" height="3.5" rx="1" />
        <path d="M12 6.5v13" />
        <path d="M12 6.5c-4 0-4.6-3.6-2.2-3.6C11.5 2.9 12 5 12 6.5Zm0 0c4 0 4.6-3.6 2.2-3.6C12.5 2.9 12 5 12 6.5Z" />
      </g>
    </svg>
  );
}

function SpecialRow({
  offer,
  run,
  refresh,
  toast,
}: {
  offer: SpecialOfferDTO;
  run: Run;
  refresh: () => Promise<void>;
  toast: (t: string) => void;
}) {
  async function onRedeem() {
    if (await run(() => redeemSpecialOffer(offer.id))) {
      toast("Sent.");
      await refresh();
    }
  }

  return (
    <div className="panel rw-row rw-special">
      <GiftBg />
      <div className="rw-line">
        <div className="rw-title">{offer.title}</div>
      </div>
      <div className="rw-sub">{offer.effectText}</div>
      {offer.mine && (
        <div className="btnrow">
          {offer.status === "PENDING" ? (
            <button type="button" className="btn" disabled>
              Sent — waiting for approval
            </button>
          ) : (
            <button type="button" className="btn green" onClick={onRedeem}>
              Redeem
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------ one person's list

function PersonSection({
  section,
  tiers,
  meId,
  ownerTokens,
  requests,
  locksUsedByMe,
  run,
  refresh,
  toast,
  onCashInSent,
}: {
  section: PersonRewardsDTO;
  tiers: AppData["rewards"]["tiers"];
  meId: string;
  ownerTokens: number | null;
  requests: RewardRequestDTO[];
  locksUsedByMe: number;
  run: Run;
  refresh: () => Promise<void>;
  toast: (t: string) => void;
  onCashInSent: (cost: number) => void;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const sorted = [...section.rewards].sort(
    (a, b) => a.cost - b.cost || a.createdAt.localeCompare(b.createdAt)
  );
  const groups: { key: string; label: string | null; rows: RewardDTO[] }[] = [];
  if (tiers.length === 0) {
    groups.push({ key: "all", label: null, rows: sorted });
  } else {
    const used = new Set<string>();
    for (const t of tiers) {
      const rows = sorted.filter(
        (r) =>
          !used.has(r.id) && r.cost >= t.minCost && (t.maxCost === null || r.cost <= t.maxCost)
      );
      rows.forEach((r) => used.add(r.id));
      if (rows.length) {
        groups.push({
          key: t.id,
          label: t.maxCost === null ? `${t.minCost}+ tokens` : `${t.minCost}–${t.maxCost} tokens`,
          rows,
        });
      }
    }
    const rest = sorted.filter((r) => !used.has(r.id));
    if (rest.length) groups.push({ key: "other", label: "Other", rows: rest });
  }

  return (
    <div className="rw-section">
      <h3 className="rw-owner">{section.ownerName}</h3>
      {section.ownerType === "USER" && (
        <div>
          <div className="rw-special-head">Special Offers</div>
          {(section.specialOffers ?? []).map((o) => (
            <SpecialRow key={o.id} offer={o} run={run} refresh={refresh} toast={toast} />
          ))}
        </div>
      )}
      {groups.map((g) => (
        <div key={g.key}>
          {g.label !== null && (
            <button
              type="button"
              className="rw-tierhead"
              onClick={() => setCollapsed((c) => ({ ...c, [g.key]: !c[g.key] }))}
            >
              <span>{g.label}</span>
              <span>
                {g.rows.length} {collapsed[g.key] ? "▸" : "▾"}
              </span>
            </button>
          )}
          {!collapsed[g.key] &&
            g.rows.map((r) => (
              <RewardRow
                key={r.id}
                reward={r}
                section={section}
                meId={meId}
                ownerTokens={ownerTokens}
                requests={requests}
                locksUsedByMe={locksUsedByMe}
                run={run}
                refresh={refresh}
                toast={toast}
                onCashInSent={onCashInSent}
              />
            ))}
        </div>
      ))}
      {section.rewards.length === 0 && <div className="rw-sub">No rewards yet.</div>}
    </div>
  );
}

// ------------------------------------------------------------ the tab

export default function RewardsTab({
  data,
  refresh,
  toast,
  patchMe,
}: {
  data: AppData;
  refresh: () => Promise<void>;
  toast: (t: string) => void;
  patchMe: (points: number, tokens: number) => void;
}) {
  const me = data.me;
  const rw = data.rewards;

  const onCashInSent = (cost: number) => patchMe(me.points, me.tokens - cost);

  const run: Run = async (fn) => {
    const res = await fn();
    if (!res.ok) {
      toast(res.error ?? "Something went wrong.");
      return false;
    }
    return true;
  };

  const toApprove = rw.requests.filter((q) => !q.mine && q.status === "PENDING");
  const myApproved = rw.requests.filter((q) => q.mine && q.status === "APPROVED");
  const kidNotices = data.notices.filter((n) => n.kind === "REWARD_KID");

  const ownerOptions = [
    { key: `u:${me.id}`, label: "Me", type: "USER" as const, id: me.id },
    ...data.members.map((m) => ({
      key: `u:${m.id}`,
      label: m.screenName,
      type: "USER" as const,
      id: m.id,
    })),
    ...data.children.map((c) => ({
      key: `c:${c.id}`,
      label: c.name,
      type: "CHILD" as const,
      id: c.id,
    })),
  ];
  const [ownerKey, setOwnerKey] = useState(`u:${me.id}`);
  const [title, setTitle] = useState("");
  const [cost, setCost] = useState("");
  const [desc, setDesc] = useState("");
  const [kind, setKind] = useState<"PERSONAL" | "SHARED_SOLO" | "SHARED_GOAL">("PERSONAL");
  const [audience, setAudience] = useState<"PLUS_ONE" | "FAMILY">("FAMILY");
  const [dueDate, setDueDate] = useState("");
  const [saveIt, setSaveIt] = useState(true);
  const [overwriteId, setOverwriteId] = useState<string | null>(null);
  const [showOverwrite, setShowOverwrite] = useState(false);

  const [tierMin, setTierMin] = useState("");
  const [tierMax, setTierMax] = useState("");

  const ownerOf = (key: string) => ownerOptions.find((o) => o.key === key) ?? ownerOptions[0];
  const personFor = (key: string) => {
    const o = ownerOf(key);
    if (o.type === "USER" && o.id === me.id) return rw.mine;
    return rw.others.find((p) => p.ownerType === o.type && p.ownerId === o.id) ?? null;
  };
  const savedFor = (key: string) => {
    const person = personFor(key);
    return person ? person.rewards.filter((r) => r.saved) : [];
  };

  function resetComposer() {
    setOwnerKey(`u:${me.id}`);
    setTitle("");
    setCost("");
    setDesc("");
    setKind("PERSONAL");
    setAudience("FAMILY");
    setDueDate("");
    setSaveIt(true);
    setOverwriteId(null);
    setShowOverwrite(false);
  }

  async function submitReward(overwrite: string | null) {
    const o = ownerOf(ownerKey);
    if (
      await run(() =>
        createReward({
          ownerType: o.type,
          ownerId: o.id,
          title,
          description: desc,
          cost: Math.floor(Number(cost) || 0),
          kind,
          audience: kind === "PERSONAL" ? "SELF" : audience,
          saved: saveIt,
          dueDate,
          overwriteId: overwrite,
        })
      )
    ) {
      resetComposer();
      toast("Added.");
      await refresh();
    }
  }

  async function onAddReward() {
    if (saveIt && !overwriteId && savedFor(ownerKey).length >= 20) {
      setShowOverwrite(true);
      return;
    }
    await submitReward(overwriteId);
  }

  async function onApproveSpecial(o: SpecialOfferDTO) {
    if (await run(() => approveSpecialOffer(o.id))) {
      toast("Approved.");
      await refresh();
    }
  }

  async function onFinalize(q: RewardRequestDTO) {
    if (await run(() => finalizeCashIn(q.id))) {
      playSound("chaChing");
      toast("Cashed in.");
      await refresh();
    }
  }

  return (
    <div className="rw">
      <h2 className="rw-h">Rewards</h2>

      {(toApprove.length > 0 || myApproved.length > 0) && (
        <div className="panel">
          <h2>Cash-in requests</h2>
          {toApprove.map((q) => (
            <div className="rw-req" key={q.id}>
              <div className="rw-reqtext">
                {q.requesterName} wants to cash in: {q.rewardTitle} — {q.cost} tokens
              </div>
              <div className="btnrow">
                <button
                  type="button"
                  className="btn green"
                  onClick={async () => {
                    if (await run(() => resolveCashIn(q.id, true))) {
                      toast("Approved.");
                      await refresh();
                    }
                  }}
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="btn red"
                  onClick={async () => {
                    if (await run(() => resolveCashIn(q.id, false))) {
                      toast("Declined.");
                      await refresh();
                    }
                  }}
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
          {myApproved.map((q) => (
            <div className="rw-req" key={q.id}>
              <div className="rw-reqtext">
                {q.rewardTitle} — {q.cost} tokens · Approved
              </div>
              <div className="btnrow">
                <button type="button" className="btn green" onClick={() => onFinalize(q)}>
                  Tap to finalize
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(rw.specialPending ?? []).length > 0 && (
        <div className="panel">
          <h2>Special offers</h2>
          {(rw.specialPending ?? []).map((o) => (
            <div className="rw-req" key={o.id}>
              <div className="rw-reqtext">
                {o.ownerName} wants to redeem: {o.title} — {o.effectText}
              </div>
              <div className="btnrow">
                <button
                  type="button"
                  className="btn green"
                  onClick={() => onApproveSpecial(o)}
                >
                  Tap to approve
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {kidNotices.map((n) => (
        <div className="notice" key={n.id}>
          <div className="t">{n.text}</div>
          <button
            type="button"
            className="btn"
            onClick={async () => {
              await acceptNotice(n.id);
              await refresh();
            }}
          >
            OK
          </button>
        </div>
      ))}

      <PersonSection
        section={rw.mine}
        tiers={rw.tiers}
        meId={me.id}
        ownerTokens={me.tokens}
        requests={rw.requests}
        locksUsedByMe={rw.locksUsedByMe}
        run={run}
        refresh={refresh}
        toast={toast}
        onCashInSent={onCashInSent}
      />
      {rw.others.map((p) => (
        <PersonSection
          key={`${p.ownerType}:${p.ownerId}`}
          section={p}
          tiers={rw.tiers}
          meId={me.id}
          ownerTokens={
            p.ownerType === "CHILD"
              ? (data.children.find((c) => c.id === p.ownerId)?.tokens ?? null)
              : null
          }
          requests={rw.requests}
          locksUsedByMe={rw.locksUsedByMe}
          run={run}
          refresh={refresh}
          toast={toast}
          onCashInSent={onCashInSent}
        />
      ))}

      <div className="panel">
        <h2>Tiers</h2>
        {rw.tiers.map((t) => (
          <div className="rw-tierline" key={t.id}>
            <span>
              {t.maxCost === null ? `${t.minCost}+ tokens` : `${t.minCost}–${t.maxCost} tokens`}
            </span>
            <button
              type="button"
              className="btn ghost rw-small"
              onClick={async () => {
                if (await run(() => deleteTier(t.id))) {
                  toast("Tier removed.");
                  await refresh();
                }
              }}
            >
              Remove
            </button>
          </div>
        ))}
        <div className="amtrow" style={{ marginTop: 18 }}>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="From"
            value={tierMin}
            onChange={(e) => setTierMin(e.target.value)}
          />
          <input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="To (blank = no top)"
            value={tierMax}
            onChange={(e) => setTierMax(e.target.value)}
          />
        </div>
        <div className="btnrow">
          <button
            type="button"
            className="btn green"
            onClick={async () => {
              const min = Math.floor(Number(tierMin) || 0);
              const max = tierMax.trim() === "" ? null : Math.floor(Number(tierMax) || 0);
              if (await run(() => createTier({ minCost: min, maxCost: max }))) {
                setTierMin("");
                setTierMax("");
                toast("Tier added.");
                await refresh();
              }
            }}
          >
            Add tier
          </button>
        </div>
      </div>

      <div className="panel">
        <h2>Add a reward</h2>
        <div className="field">
          <label>For</label>
          <select
            value={ownerKey}
            onChange={(e) => {
              setOwnerKey(e.target.value);
              setOverwriteId(null);
              setShowOverwrite(false);
            }}
          >
            {ownerOptions.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Reward</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Reward title" />
        </div>
        <div className="field">
          <label>Token cost</label>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            placeholder="Tokens"
          />
        </div>
        <div className="field">
          <label>Description (optional)</label>
          <input value={desc} onChange={(e) => setDesc(e.target.value)} />
        </div>
        <div className="field">
          <label>Type</label>
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="PERSONAL">Personal</option>
            <option value="SHARED_SOLO">Shared — one person pays</option>
            <option value="SHARED_GOAL">Shared goal — everyone fills a part</option>
          </select>
        </div>
        {kind !== "PERSONAL" && (
          <div className="field">
            <label>Who it is for</label>
            <select value={audience} onChange={(e) => setAudience(e.target.value as typeof audience)}>
              <option value="PLUS_ONE">One other person</option>
              <option value="FAMILY">Whole family</option>
            </select>
          </div>
        )}
        {kind === "SHARED_GOAL" && (
          <div className="field">
            <label>Due date</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        )}
        <div className="field">
          <label>
            <input
              type="checkbox"
              checked={saveIt}
              onChange={(e) => setSaveIt(e.target.checked)}
              style={{ width: "auto", marginRight: 10 }}
            />
            Save to their list
          </label>
        </div>
        {showOverwrite && (
          <div className="field">
            <label>No free slots — pick one to overwrite</label>
            {savedFor(ownerKey).map((r) => (
              <button
                type="button"
                key={r.id}
                className={`btn block ${overwriteId === r.id ? "green" : "ghost"}`}
                style={{ marginTop: 10 }}
                onClick={() => setOverwriteId(r.id)}
              >
                {r.title} — {r.cost} tokens
              </button>
            ))}
          </div>
        )}
        <div className="btnrow">
          <button type="button" className="btn green" onClick={onAddReward}>
            Add reward
          </button>
        </div>
      </div>
    </div>
  );
}
