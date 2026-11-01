"use client";

import { useEffect, useRef, useState } from "react";
import type { AppData, BountyDTO, OfferDTO } from "@/lib/types";
import { verifierId } from "@/lib/bounty";
import { formatDateTime } from "@/lib/time";
import { playSound } from "@/lib/sounds";
import { acceptNotice, buyPoints, loveTap, redeemTokens } from "@/app/app-actions";
import SheriffBadge from "../SheriffBadge";

function HeartIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
        fill="#c2255c"
      />
    </svg>
  );
}

// The Balances badge rule: a bounty earns a badge when it is unseen for
// me, or when it is waiting on my action (approve / Accept) — the poster
// included, until they have opened it.
function badgeStatus(b: BountyDTO, meId: string): string | null {
  if (b.status === "PENDING_APPROVAL" && b.postedById !== meId) return "Needs approval";
  if (b.status === "PENDING_APPROVAL" && b.postedById === meId && !b.seenByMe)
    return "Awaiting approval";
  if (b.status === "AWAITING_VERIFY" && verifierId(b) === meId) return "Verify claim";
  if (b.status === "OPEN" && !b.seenByMe) return "";
  return null;
}

export default function BalancesTab({
  data,
  refresh,
  patchMe,
  toast,
  openBounty,
  onReviewOffer,
  onOpenSettings,
}: {
  data: AppData;
  refresh: () => Promise<void>;
  patchMe: (points: number, tokens: number) => void;
  toast: (msg: string) => void;
  openBounty: (b: BountyDTO) => void;
  onReviewOffer: (o: OfferDTO) => void;
  onOpenSettings: () => void;
}) {
  const me = data.me;
  const [tapMsg, setTapMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [redeemAmt, setRedeemAmt] = useState("");
  const [redeemReason, setRedeemReason] = useState("");
  const [redeemMsg, setRedeemMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [buyAmt, setBuyAmt] = useState("");
  const [buyMsg, setBuyMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const kissedRef = useRef<Set<string>>(new Set());

  // Love Tap receipts: the receiver hears the kiss when the tap is
  // delivered to them here — never the coin, never combined.
  useEffect(() => {
    const taps = data.notices.filter(
      (n) => n.kind === "LOVE_TAP" && !kissedRef.current.has(n.id)
    );
    if (!taps.length) return;
    for (const t of taps) kissedRef.current.add(t.id);
    playSound("kiss");
    void (async () => {
      for (const t of taps) {
        await acceptNotice(t.id);
        toast(`♥ ${t.fromName ?? "Someone"} sent you a Love Tap`);
      }
      await refresh();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.notices]);

  const badgeItems = data.bounties
    .map((b) => ({ b, status: badgeStatus(b, me.id) }))
    .filter((x) => x.status !== null) as { b: BountyDTO; status: string }[];

  const redeemNotices = data.notices.filter((n) => n.kind === "REDEEM");
  const incomingOffers = data.offers.filter(
    (o) => o.toUserId === me.id && o.status === "PENDING"
  );
  const counterOffers = data.offers.filter(
    (o) => o.fromUserId === me.id && o.status === "COUNTERED"
  );
  const other = data.members[0] ?? null;

  async function onLoveTap(toUserId: string, name: string) {
    if (me.points < 1) {
      setTapMsg({ text: "You're out of points — Love Taps come back with the Saturday drop.", ok: false });
      return;
    }
    let res: Awaited<ReturnType<typeof loveTap>>;
    try {
      res = await loveTap(toUserId);
    } catch {
      // The tap call itself died — no answer came back at all. Never sit
      // silent: say so on screen, and reload once so the phone picks up
      // the app's current code. The session flag keeps it to one reload.
      setTapMsg({ text: "That tap didn't go through — reloading the app to resync.", ok: false });
      try {
        if (!window.sessionStorage.getItem("lt-resync")) {
          window.sessionStorage.setItem("lt-resync", "1");
          window.setTimeout(() => window.location.reload(), 1200);
        }
      } catch {
        // Storage unavailable — the message above still shows.
      }
      return;
    }
    if (!res.ok) {
      setTapMsg({ text: res.error, ok: false });
      return;
    }
    playSound("chaChing");
    patchMe(me.points - 1, me.tokens);
    setTapMsg({ text: `Sent! 1 point out, 1 token banked for ${name}.`, ok: true });
    toast(`♥ Love Tap sent — ${name} banked 1 token.`);
    await refresh();
  }

  async function onRedeem() {
    const amt = Math.floor(Number(redeemAmt) || 0);
    if (amt <= 0) {
      setRedeemMsg({ text: "Enter how many tokens you're redeeming.", ok: false });
      return;
    }
    if (amt > me.tokens) {
      setRedeemMsg({ text: `You only have ${me.tokens} tokens banked.`, ok: false });
      return;
    }
    if (!other) {
      setRedeemMsg({ text: "No one else in the household yet.", ok: false });
      return;
    }
    const res = await redeemTokens({ toUserId: other.id, amount: amt, reason: redeemReason });
    if (!res.ok) {
      setRedeemMsg({ text: res.error, ok: false });
      return;
    }
    playSound("chaChing");
    patchMe(me.points, me.tokens - amt);
    setRedeemAmt("");
    setRedeemReason("");
    setRedeemMsg({
      text: `Redeemed. ${other.screenName} got the notice — it'll sit in the log once they add it.`,
      ok: true,
    });
    await refresh();
  }

  async function onBuy() {
    const amt = Math.floor(Number(buyAmt) || 0);
    if (amt <= 0) {
      setBuyMsg({ text: "Enter how many tokens to trade in.", ok: false });
      return;
    }
    if (amt > me.tokens) {
      setBuyMsg({ text: `You only have ${me.tokens} tokens banked.`, ok: false });
      return;
    }
    const res = await buyPoints(amt);
    if (!res.ok) {
      setBuyMsg({ text: res.error, ok: false });
      return;
    }
    playSound("chaChing");
    patchMe(me.points + amt, me.tokens - amt);
    setBuyAmt("");
    setBuyMsg({
      text: `Done — ${amt} points added. Heads up: points still expire ${data.expiryLabel}.`,
      ok: true,
    });
    await refresh();
  }

  return (
    <section className="screen active" aria-label="Balances">
      <div className="topbar">
        <button type="button" className="gear-btn" aria-label="Open settings" onClick={onOpenSettings}>
          ⚙
        </button>
      </div>

      <div>
        {badgeItems.length ? (
          <div className="bounty-badges" role="group" aria-label="Bounties">
            <div className="bb-row">
              {badgeItems.map(({ b, status }) => (
                <button
                  key={b.id}
                  type="button"
                  className="sheriff-badge"
                  aria-label={`${status ? status + ": " : ""}${b.title}, ${b.value} tokens.`}
                  onClick={() => openBounty(b)}
                >
                  <SheriffBadge value={b.value} wrapClass="badge-art" />
                  <span className="badge-cap">
                    {status ? <span className="badge-status">{status}</span> : null}
                    {b.title}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {incomingOffers.map((o) => (
          <div className="notice" key={o.id}>
            <div className="t">You&apos;ve got an offer</div>
            <div className="d">
              {o.fromName} has offered {o.amount} points — {o.reason || "a favor"}
            </div>
            <button type="button" className="btn" onClick={() => onReviewOffer(o)}>
              Review
            </button>
          </div>
        ))}
        {counterOffers.map((o) => (
          <div className="notice" key={o.id}>
            <div className="t">Counter offer</div>
            <div className="d">
              {o.toName} countered at {o.counterAmount} points — {o.reason || "a favor"}
            </div>
            <button type="button" className="btn" onClick={() => onReviewOffer(o)}>
              Review
            </button>
          </div>
        ))}
        {redeemNotices.map((n) => {
          const reason = n.text.includes(" — ") ? n.text.split(" — ").slice(1).join(" — ") : null;
          return (
            <div className="notice" key={n.id}>
              <div className="t">
                {n.fromName} redeemed {n.amount} {n.amount === 1 ? "token" : "tokens"}
              </div>
              <div className="d">
                “{reason || "No reason given"}” · {formatDateTime(n.createdAt)}
              </div>
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  await acceptNotice(n.id);
                  toast("Logged — redemption recorded.");
                  await refresh();
                }}
              >
                Add to log
              </button>
            </div>
          );
        })}
      </div>

      <div className="cards">
        <article className="card me">
          <div className="who">
            <span className="name">{me.screenName}</span>
            <span
              className="tag-later"
              style={{ background: "var(--green-soft)", color: "var(--green-deep)" }}
            >
              That’s you
            </span>
          </div>
          <div className="bals">
            <div className="bal pts">
              <div className="k">Points</div>
              <div className="v mono">{me.points}</div>
              <div className="sub">Expire {data.expiryLabel}</div>
            </div>
            <div className="bal tok">
              <div className="k">Tokens</div>
              <div className="v mono">{me.tokens}</div>
              <div className="sub">Banked — never expire</div>
            </div>
          </div>
        </article>
        {data.children.map((c) => (
          <article className="card" key={c.id}>
            <div className="who">
              <span className="name">{c.name}</span>
              <span className="flavor">Child · Tokens only</span>
            </div>
            <div className="bals">
              <div className="bal tok">
                <div className="k">Tokens</div>
                <div className="v mono">{c.tokens}</div>
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="panel lovetap-panel">
        <h2>
          <HeartIcon /> Love Tap
        </h2>
        {data.members.map((m) => (
          <div className="btnrow" key={m.id}>
            <button
              type="button"
              className="btn lovetap block"
              disabled={me.points < 1}
              onClick={() => onLoveTap(m.id, m.screenName)}
            >
              ♥ Love Tap — send {m.screenName} a token
            </button>
          </div>
        ))}
        {tapMsg ? (
          <p className={`form-msg ${tapMsg.ok ? "ok" : "err"}`} role="status">
            {tapMsg.text}
          </p>
        ) : null}
      </div>

      <div className="panel">
        <h2>Redeem tokens</h2>
        <div className="field">
          <label htmlFor="redeem-amt">Tokens to redeem</label>
          <div className="amtrow">
            <input
              type="number"
              id="redeem-amt"
              className="mono"
              min={1}
              step={1}
              inputMode="numeric"
              placeholder="0"
              value={redeemAmt}
              onChange={(e) => setRedeemAmt(e.target.value)}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="redeem-reason">What for?</label>
          <input
            type="text"
            id="redeem-reason"
            placeholder="e.g. Guilt-free nap, no questions asked"
            value={redeemReason}
            onChange={(e) => setRedeemReason(e.target.value)}
          />
        </div>
        <div className="btnrow">
          <button type="button" className="btn green block" onClick={onRedeem}>
            Redeem
          </button>
        </div>
        {redeemMsg ? (
          <p className={`form-msg ${redeemMsg.ok ? "ok" : "err"}`} role="status">
            {redeemMsg.text}
          </p>
        ) : null}
      </div>

      <div className="panel">
        <h2>Buy more points</h2>
        <div className="field">
          <label htmlFor="buy-amt">Tokens to trade in</label>
          <div className="amtrow">
            <input
              type="number"
              id="buy-amt"
              className="mono"
              min={1}
              step={1}
              inputMode="numeric"
              placeholder="0"
              value={buyAmt}
              onChange={(e) => setBuyAmt(e.target.value)}
            />
          </div>
        </div>
        <div className="btnrow">
          <button type="button" className="btn block" onClick={onBuy}>
            Buy points
          </button>
        </div>
        {buyMsg ? (
          <p className={`form-msg ${buyMsg.ok ? "ok" : "err"}`} role="status">
            {buyMsg.text}
          </p>
        ) : null}
      </div>
    </section>
  );
}
