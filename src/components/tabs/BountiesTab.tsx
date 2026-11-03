"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AppData, BountyDTO } from "@/lib/types";
import { bountyRank, bountyStatusInfo, verifierId } from "@/lib/bounty";
import { formatDateTime } from "@/lib/time";
import { postBounty } from "@/app/app-actions";
import AmountEntry from "../AmountEntry";
import SlideToConfirm from "../SlideToConfirm";
import SheriffBadge, { NewBurst } from "../SheriffBadge";

function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function defaultDue(): string {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  d.setMinutes(0, 0, 0);
  return toLocalInput(d);
}

// Scroll the board into view with a short ease (170–360ms by distance),
// then — only once the scroll has fully come to rest — materialize the
// new poster (0.6s fade + grow from 0.92). A 1600ms backstop covers the
// cases where the animation can't run.
function scrollToBoardThenMaterialize(boardEl: HTMLElement, done: () => void) {
  const startY = window.scrollY;
  const targetY = Math.max(0, startY + boardEl.getBoundingClientRect().top - 12);
  const dist = Math.abs(targetY - startY);
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    setTimeout(done, 90);
  };
  setTimeout(finish, 1600);
  if (dist < 4) {
    finish();
    return;
  }
  const dur = Math.min(360, Math.max(170, dist * 0.35));
  const t0 = performance.now();
  const frame = (t: number) => {
    if (finished) return;
    const k = Math.min(1, (t - t0) / dur);
    const eased = 1 - Math.pow(1 - k, 3);
    window.scrollTo(0, startY + (targetY - startY) * eased);
    if (k < 1) requestAnimationFrame(frame);
    else finish();
  };
  requestAnimationFrame(frame);
}

export default function BountiesTab({
  data,
  refresh,
  toast,
  openBounty,
}: {
  data: AppData;
  refresh: () => Promise<void>;
  toast: (msg: string) => void;
  openBounty: (b: BountyDTO) => void;
}) {
  const me = data.me;
  const boardRef = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [due, setDue] = useState(defaultDue);
  const [amount, setAmount] = useState(0);
  const [resetSignal, setResetSignal] = useState(0);
  const [slideKey, setSlideKey] = useState(0);
  const [pendingMatId, setPendingMatId] = useState<string | null>(null);
  const [materializeId, setMaterializeId] = useState<string | null>(null);

  const ordered = useMemo(() => {
    return data.bounties
      .map((b, i) => ({ b, i }))
      .sort((x, y) => bountyRank(x.b.status) - bountyRank(y.b.status) || x.i - y.i)
      .map((x) => x.b);
  }, [data.bounties]);

  const openCount = data.bounties.filter((b) => b.status === "OPEN").length;

  useEffect(() => {
    if (!pendingMatId) return;
    const board = boardRef.current;
    if (!board) return;
    scrollToBoardThenMaterialize(board, () => {
      setMaterializeId(pendingMatId);
      setPendingMatId(null);
      setTimeout(() => setMaterializeId(null), 900);
    });
  }, [pendingMatId]);

  async function onPost() {
    const t = title.trim();
    if (!t) {
      toast("Give the bounty a title first.");
      setSlideKey((n) => n + 1);
      return;
    }
    if (amount <= 0) {
      toast("Set a reward above zero first.");
      setSlideKey((n) => n + 1);
      return;
    }
    const res = await postBounty({ title: t, details, value: amount, dueDate: due });
    if (!res.ok) {
      toast(res.error);
      setSlideKey((n) => n + 1);
      return;
    }
    // Posted: the form resets fully, right now. No text ever renders
    // in or under the form.
    setTitle("");
    setDetails("");
    setDue(defaultDue());
    setAmount(0);
    setResetSignal((n) => n + 1);
    setSlideKey((n) => n + 1);
    await refresh();
    if (res.id) setPendingMatId(res.id);
    const other = data.members[0];
    if (other) toast(`Bounty posted — pending approval from ${other.screenName}.`);
  }

  const notices: { key: string; title: string; body: React.ReactNode; rose?: boolean }[] = [];
  for (const b of data.bounties) {
    if (b.status === "PENDING_APPROVAL" && b.postedById !== me.id) {
      notices.push({
        key: b.id + "-approve",
        title: "Bounty needs your approval",
        body: (
          <>
            “{b.title}” — {b.value} tokens, due {b.dueDate ? formatDateTime(b.dueDate) : ""}.
            Review it below to agree the value &amp; date.
          </>
        ),
      });
    }
    if (b.status === "AWAITING_VERIFY" && verifierId(b) === me.id) {
      notices.push({
        key: b.id + "-verify",
        title: "Bounty claimed — verify it",
        rose: true,
        body: (
          <>
            {b.claimedByName ?? b.kidClaimChildName} says “{b.title}” is done. Hit{" "}
            <strong>Accept</strong> to pay {b.value} tokens.
          </>
        ),
      });
    }
    if (b.status === "AWAITING_VERIFY" && b.claimedById === me.id) {
      const vName =
        data.members.find((m) => m.id === verifierId(b))?.screenName ?? "";
      notices.push({
        key: b.id + "-sent",
        title: "Claim sent",
        body: (
          <>
            Waiting for {vName} to Accept “{b.title}” and release {b.value} tokens.
          </>
        ),
      });
    }
  }

  return (
    <section className="screen active" aria-label="Bounties">
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <h2 style={{ fontSize: "1.35rem", fontWeight: 800 }}>Bounties</h2>
        <span className="mono" style={{ fontSize: ".85rem", color: "var(--muted)" }}>
          {openCount} open · {data.bounties.length} total
        </span>
      </div>

      <div>
        {notices.map((n) => (
          <div
            className="notice"
            key={n.key}
            style={
              n.rose
                ? { borderColor: "var(--rose)", background: "var(--rose-soft)" }
                : undefined
            }
          >
            <div className="t">{n.title}</div>
            <div className="d">{n.body}</div>
          </div>
        ))}
      </div>

      <div className="bounty-list" ref={boardRef}>
        {ordered.length === 0 ? (
          <div className="empty">No bounties yet — post the first one below.</div>
        ) : (
          ordered.map((b) => {
            const st = bountyStatusInfo(b.status, b.dueDate);
            const unviewed = !b.seenByMe;
            const cls =
              `bounty-card${b.postedById === me.id ? " mine" : ""}` +
              `${unviewed ? " is-unviewed" : ""}` +
              `${b.id === pendingMatId ? " materialize-pending" : ""}` +
              `${b.id === materializeId ? " materialize" : ""}`;
            return (
              <article
                key={b.id}
                className={cls}
                tabIndex={0}
                role="button"
                aria-label={`${b.title}, ${b.value} tokens, ${unviewed ? "New" : st.label}. Tap for details.`}
                onClick={() => openBounty(b)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openBounty(b);
                  }
                }}
              >
                <SheriffBadge value={b.value} wrapClass="poster-badge" />
                <span className="bounty-title">{b.title}</span>
                {unviewed ? (
                  <div className="poster-newburst">
                    <NewBurst />
                  </div>
                ) : (
                  <div className="poster-status">
                    <span className={`bstatus ${st.key}`}>{st.label}</span>
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>

      <div className="panel bounty-create" style={{ marginTop: 18 }}>
        <h2>Post a bounty</h2>
        <div className="field">
          <label htmlFor="bounty-title">Bounty — what needs doing?</label>
          <input
            type="text"
            id="bounty-title"
            placeholder="e.g. Deep-clean the garage"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="bounty-desc">Details (optional)</label>
          <textarea
            id="bounty-desc"
            placeholder="What counts as done? Any notes for the hunter…"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
          />
        </div>
        <div>
          <div className="field" style={{ marginTop: 18 }}>
            <label htmlFor="bounty-due">Complete by</label>
            <input
              type="datetime-local"
              id="bounty-due"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </div>
        </div>
        <AmountEntry
          prefix="bounty"
          unit="tokens"
          downtimeHours={me.weeklyDowntimeHours}
          lookupText={`${title} ${details}`}
          balance={null}
          resetSignal={resetSignal}
          onValueChange={setAmount}
        />
        <div className="btnrow">
          <SlideToConfirm
            label="Slide to post"
            gold
            inRow
            resetKey={slideKey}
            onComplete={onPost}
          />
        </div>
      </div>
    </section>
  );
}
