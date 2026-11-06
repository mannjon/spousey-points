"use client";

import { useEffect, useRef, useState } from "react";
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
  createReward,
  deleteReward,
  finalizeCashIn,
  lockReward,
  requestCashIn,
  resolveCashIn,
  sendKidReward,
  updateReward,
  useSpecialOffer,
} from "@/app/reward-actions";
import LockSlider from "@/components/LockSlider";

type Run = (fn: () => Promise<{ ok: boolean; error?: string }>) => Promise<boolean>;


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
  const [eTitle, setETitle] = useState(reward.title);
  const [eCost, setECost] = useState(String(reward.cost));
  const [eDesc, setEDesc] = useState(reward.description ?? "");

  const mine = section.ownerType === "USER" && section.ownerId === meId;
  const affordable = ownerTokens === null ? true : ownerTokens >= reward.cost;
  const band =
    reward.cost <= 10
      ? "rw-band0"
      : reward.cost <= 25
        ? "rw-band1"
        : reward.cost <= 100
          ? "rw-band2"
          : reward.cost <= 250
            ? "rw-band3"
            : "rw-band4";
  const titleRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.fontSize = "";
    let size = parseFloat(window.getComputedStyle(el).fontSize);
    while (el.scrollWidth > el.clientWidth && size > 11) {
      size -= 0.5;
      el.style.fontSize = `${size}px`;
    }
  }, [reward.title]);
  const done = reward.status === "COMPLETED" || reward.status === "FAILED";
  const showAfford = ownerTokens !== null && affordable && !done;
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

  return (
    <div className={`panel rw-row ${band}${showAfford ? " rw-afford" : ""}`}>
      <div className="rw-line">
        {mine ? (
          <button
            type="button"
            className="rw-cost rw-coinbtn"
            disabled={!!myRequest}
            onClick={onCashIn}
          >
            <span
              className={`rw-coindisc${ownerTokens !== null && !affordable ? " dim" : ""}`}
            >
              {reward.cost}
            </span>
            {myRequest
              ? myRequest.status === "APPROVED"
                ? "Approved"
                : "Sent"
              : null}
          </button>
        ) : (
          <div className="rw-cost">
            <span
              className={`rw-coindisc${ownerTokens !== null && !affordable ? " dim" : ""}`}
            >
              {reward.cost}
            </span>
          </div>
        )}
        <div className="rw-title" ref={titleRef}>{reward.title}</div>
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

      {!editOpen && section.ownerType === "CHILD" && (
        <div className="btnrow">
          <button type="button" className="btn green" onClick={onSendKid}>
            Send
          </button>
        </div>
      )}
    </div>
  );
}

function StarGlyph() {
  return (
    <svg className="rw-star" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2.5l2.95 5.98 6.6.96-4.78 4.66 1.13 6.58L12 17.57l-5.9 3.1 1.13-6.57L2.45 9.44l6.6-.96L12 2.5Z"
        fill="#f5c542"
        stroke="#a8741a"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
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
  const [confirming, setConfirming] = useState(false);

  async function onConfirm() {
    if (await run(() => useSpecialOffer(offer.id))) {
      setConfirming(false);
      toast("Used.");
      await refresh();
    }
  }

  return (
    <div
      className="panel rw-row rw-special"
      onClick={() => {
        if (offer.mine) setConfirming(true);
      }}
    >
      <div className="rw-line">
        <StarGlyph />
        <div className="rw-title">{offer.title}</div>
        <GiftBg />
      </div>
      {confirming && (
        <div
          className="sheet open"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            e.stopPropagation();
            if (e.target === e.currentTarget) setConfirming(false);
          }}
        >
          <div className="box rw-confirm">
            <div className="rw-confirm-top">
              <div className="rw-confirm-q">
                Redeem {offer.effectText ? offer.effectText : offer.title}?
              </div>
              <button
                type="button"
                className="rw-confirm-x"
                aria-label="Close"
                onClick={() => setConfirming(false)}
              >
                ✕
              </button>
            </div>
            <div
              style={{
                display: "flex",
                gap: 12,
                justifyContent: "flex-end",
                marginTop: 18,
              }}
            >
              <button
                type="button"
                className="btn red"
                aria-label="No"
                onClick={() => setConfirming(false)}
              >
                ✕
              </button>
              <button
                type="button"
                className="btn green"
                aria-label="Yes"
                onClick={onConfirm}
              >
                ✓
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------ one person's list

function PersonSection({
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
  const sorted = [...section.rewards].sort(
    (a, b) => a.cost - b.cost || a.createdAt.localeCompare(b.createdAt)
  );
  const [specialOpen, setSpecialOpen] = useState(false);

  return (
    <div className="rw-section">
      <h3 className="rw-owner">{section.ownerName}</h3>
      {section.ownerType === "USER" && (
        <div className={specialOpen ? "rw-special-box open" : "rw-special-box"}>
          <button
            type="button"
            className="rw-special-head rw-special-toggle"
            aria-expanded={specialOpen}
            onClick={() => setSpecialOpen((v) => !v)}
          >
            <span className="rw-line">
              <StarGlyph />
              <span>Special Offers</span>
            </span>
            <span className="rw-chev" aria-hidden="true">
              {specialOpen ? "▴" : "▾"}
            </span>
          </button>
          {specialOpen && (
            <div className="rw-special-body">
              {(section.specialOffers ?? []).map((o) => (
                <SpecialRow key={o.id} offer={o} run={run} refresh={refresh} toast={toast} />
              ))}
            </div>
          )}
        </div>
      )}
      {sorted.map((r) => (
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
  const [kind, setKind] = useState<"PERSONAL" | "SHARED_SOLO">("PERSONAL");
  const [audience, setAudience] = useState<"PLUS_ONE" | "FAMILY">("FAMILY");
  const [saveIt, setSaveIt] = useState(true);
  const [overwriteId, setOverwriteId] = useState<string | null>(null);
  const [showOverwrite, setShowOverwrite] = useState(false);

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
