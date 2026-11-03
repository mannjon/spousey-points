"use client";

import { useMemo, useState } from "react";
import type { AppData } from "@/lib/types";
import { cancelOffer, placeOffer, placeOfferToInvitee } from "@/app/app-actions";
import AmountEntry from "../AmountEntry";
import SlideToConfirm from "../SlideToConfirm";

type Recipient =
  | { kind: "member"; id: string; label: string }
  | { kind: "invitee"; id: string; label: string };

export default function SpendTab({
  data,
  refresh,
  toast,
}: {
  data: AppData;
  refresh: () => Promise<void>;
  toast: (msg: string) => void;
}) {
  const me = data.me;
  const recipients: Recipient[] = useMemo(
    () => [
      ...data.members.map((m) => ({
        kind: "member" as const,
        id: m.id,
        label: m.screenName,
      })),
      ...data.pendingInvitees.map((pi) => ({
        kind: "invitee" as const,
        id: pi.id,
        label: `${pi.screenName} — invited, not signed up yet`,
      })),
    ],
    [data.members, data.pendingInvitees]
  );
  const [recipientKey, setRecipientKey] = useState<string | null>(null);
  const recipient =
    recipients.find((r) => `${r.kind}:${r.id}` === recipientKey) ?? recipients[0] ?? null;
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState(0);
  const [resetSignal, setResetSignal] = useState(0);
  const [slideKey, setSlideKey] = useState(0);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const canSlide =
    !!recipient && amount > 0 && amount <= me.points;

  function resetComposer() {
    setReason("");
    setAmount(0);
    setResetSignal((n) => n + 1);
    setSlideKey((n) => n + 1);
  }

  async function onSlideComplete() {
    if (!recipient) return;
    if (amount <= 0) {
      setMsg({ text: "Set an amount above zero first.", ok: false });
      setSlideKey((n) => n + 1);
      return;
    }
    if (amount > me.points) {
      setMsg({ text: "You can't spend more points than you have.", ok: false });
      setSlideKey((n) => n + 1);
      return;
    }
    const res =
      recipient.kind === "invitee"
        ? await placeOfferToInvitee({ pendingInviteId: recipient.id, amount, reason })
        : await placeOffer({ toUserId: recipient.id, amount, reason });
    if (!res.ok) {
      setMsg({ text: res.error, ok: false });
      setSlideKey((n) => n + 1);
      return;
    }
    // Placed: the composer resets to defaults right now, regardless of
    // whether the offer is later accepted, declined, or countered.
    const name =
      recipient.kind === "invitee"
        ? recipient.label.replace(" — invited, not signed up yet", "")
        : recipient.label;
    resetComposer();
    setMsg(null);
    toast(
      recipient.kind === "invitee"
        ? `Request posted to ${name} — waiting for them to sign up.`
        : `Offer sent — ${amount} points to ${name}.`
    );
    await refresh();
  }

  const outgoing = data.offers.filter((o) => o.fromUserId === me.id);

  return (
    <section className="screen active" aria-label="Spend points">
      <div className="panel" style={{ marginTop: 0 }}>
        <h2>Spend points on a favor</h2>

        <div className="field">
          <label>Who&apos;s doing the favor?</label>
          <div className="chips">
            {recipients.map((r) => (
              <button
                key={`${r.kind}:${r.id}`}
                type="button"
                aria-pressed={recipient?.kind === r.kind && recipient?.id === r.id}
                onClick={() => setRecipientKey(`${r.kind}:${r.id}`)}
              >
                {r.label}
              </button>
            ))}
            {data.children.map((c) => (
              <button key={c.id} type="button" disabled aria-pressed={false}>
                {c.name} — child (tokens only)
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label htmlFor="reason">What&apos;s the favor?</label>
          <input
            type="text"
            id="reason"
            placeholder="What's the ask?"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        <AmountEntry
          prefix="spend"
          unit="points"
          downtimeHours={me.weeklyDowntimeHours}
          lookupText={reason}
          balance={me.points}
          resetSignal={resetSignal}
          onValueChange={setAmount}
        />

        <div>
          <SlideToConfirm
            label="Slide to confirm"
            disabled={!canSlide}
            resetKey={slideKey}
            onComplete={onSlideComplete}
          />
          {msg ? (
            <p className={`form-msg ${msg.ok ? "ok" : "err"}`} role="status">
              {msg.text}
            </p>
          ) : null}
        </div>
      </div>

      {outgoing.map((o) => (
        <div className="notice" key={o.id} style={{ marginTop: 18 }}>
          <div className="t">
            Offer to {o.toName} — {o.status === "COUNTERED" ? `countered at ${o.counterAmount}` : o.amount} points
          </div>
          <div className="d">{o.reason || "a favor"} · waiting for {o.toName} to answer</div>
          {o.status === "PENDING" ? (
            <button
              type="button"
              className="btn ghost"
              onClick={async () => {
                await cancelOffer(o.id);
                toast("Offer cancelled — nothing was sent.");
                await refresh();
              }}
            >
              Cancel offer
            </button>
          ) : null}
        </div>
      ))}
    </section>
  );
}
