"use client";

import { useState } from "react";
import type {
  AppData,
  PersonRewardsDTO,
  RewardDTO,
  RewardRequestDTO,
} from "@/lib/types";
import { playSound } from "@/lib/sounds";
import { acceptNotice } from "@/app/app-actions";
import {
  contribute,
  createReward,
  createTier,
  deleteReward,
  deleteTier,
  finalizeCashIn,
  lockReward,
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
}) {
  const [descOpen, setDescOpen] = useState(false);
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
    if (await run(() => requestCashIn(reward.id))) {
      toast("Sent for approval.");
      await refresh();
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
    <div
      className="panel rw-row"
      style={
        !affordable && !done ? { opacity: 0.3, filter: "grayscale(0.5)" } : undefined
      }
    >
      <div className="rw-line">
        {reward.audience !== "SELF" && (
          <PeopleIcon n={reward.audience === "FAMILY" ? 3 : 2} />
        )}
        <div className="rw-title">{reward.title}</div>
        <div className="rw-cost">
          {reward.cost} <span>tokens</span>
        </div>
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
        {reward.description ? (
          <button
            type="button"
            className="rw-iconbtn rw-chev"
            aria-label="Show description"
            onClick={() => setDescOpen((v) => !v)}
          >
            {descOpen ? "▴" : "▾"}
          </button>
        ) : null}
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
      {reward.saved && !isGoal && <div className="rw-sub">Saved</div>}

      {descOpen && reward.description && <p className="rw-desc">{reward.description}</p>}

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

      {!editOpen && (
        <div className="btnrow">
          {isGoal ? (
            <button type="button" className="btn ghost" onClick={() => setGoalOpen((v) => !v)}>
              {goalOpen ? "Close parts" : "Parts"}
            </button>
          ) : mine ? (
            myRequest ? (
              <button type="button" className="btn" disabled>
                {myRequest.status === "APPROVED"
                  ? "Approved — tap above to finalize"
                  : "Sent — waiting"}
              </button>
            ) : (
              <button
                type="button"
                className="btn green"
                disabled={!affordable}
                onClick={onCashIn}
              >
                Cash in
              </button>
            )
          ) : section.ownerType === "CHILD" ? (
            <button type="button" className="btn green" onClick={onSendKid}>
              Send
            </button>
          ) : null}
          {canEdit && (
            <button type="button" className="btn ghost" onClick={() => setEditOpen(true)}>
              Edit
            </button>
          )}
          {canDelete && (
            <button type="button" className="btn red" onClick={onDelete}>
              Remove
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

  async function onFinalize(q: RewardRequestDTO) {
    if (await run(() => finalizeCashIn(q.id))) {
      playSound("chaChing");
      patchMe(me.points, me.tokens - q.cost);
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
