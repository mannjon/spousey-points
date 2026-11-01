"use client";

import { useState } from "react";
import type { OfferDTO } from "@/lib/types";
import { digitsOf, valueOf } from "@/lib/estimate";
import { playSound } from "@/lib/sounds";
import { acceptOffer, counterOffer, declineOffer } from "@/app/app-actions";

// The offer overlay: "[USERNAME] has offered [POINTVALUE] for [REASON]",
// the amount big in the center as tappable digits, ▲/▼ steppers for the
// tapped column, green Accept / red Decline. Changing the amount turns
// Accept into "Counter"; a counter returns to the spender, whose view
// is not editable and settles with "Accept counter".
export default function OfferSheet({
  offer,
  mode,
  myPoints,
  onClose,
  refresh,
  toast,
}: {
  offer: OfferDTO;
  mode: "review" | "counter";
  myPoints: number;
  onClose: () => void;
  refresh: () => Promise<void>;
  toast: (msg: string) => void;
}) {
  const startAmount = mode === "counter" ? (offer.counterAmount ?? offer.amount) : offer.amount;
  const [odDigits, setOdDigits] = useState<number[]>(() => digitsOf(startAmount));
  const [odSel, setOdSel] = useState(3);
  const [msg, setMsg] = useState("");
  const v = valueOf(odDigits);
  const editable = mode === "review";
  const changed = editable && v !== offer.amount;
  const counterBlocked = mode === "counter" && myPoints < v;

  function step(delta: number) {
    const d = [...odDigits];
    d[odSel] = (((d[odSel] + delta) % 10) + 10) % 10;
    setOdDigits(d);
  }

  async function onAccept() {
    if (mode === "review") {
      if (v <= 0) {
        setMsg(
          changed
            ? "A counter of zero isn't a counter — raise it or decline."
            : "An offer of zero can't be accepted — raise it or decline."
        );
        return;
      }
      if (changed) {
        const res = await counterOffer(offer.id, v);
        if (!res.ok) {
          setMsg(res.error);
          return;
        }
        toast(`${offer.toName} countered at ${v} — back to ${offer.fromName} to decide.`);
        onClose();
        await refresh();
        return;
      }
      const res = await acceptOffer(offer.id);
      if (!res.ok) {
        setMsg(res.error);
        return;
      }
      playSound("chaChing");
      toast(`Cha-ching! ${v} points spent — ${offer.toName} banked ${v} tokens.`);
      onClose();
      await refresh();
      return;
    }
    // counter review (spender settling)
    const res = await acceptOffer(offer.id);
    if (!res.ok) {
      setMsg(res.error);
      return;
    }
    playSound("chaChing");
    toast(`Cha-ching! ${v} points spent — ${offer.toName} banked ${v} tokens.`);
    onClose();
    await refresh();
  }

  async function onDecline() {
    const res = await declineOffer(offer.id);
    if (!res.ok) {
      setMsg(res.error);
      return;
    }
    toast("Declined — no points moved.");
    onClose();
    await refresh();
  }

  return (
    <div className="overlay open" role="dialog" aria-modal="true" aria-labelledby="offer-line">
      <div className="inner">
        <p className="phone-tag">
          {mode === "review"
            ? `${offer.toName}’s phone — incoming offer`
            : `${offer.fromName}’s phone — counter-offer`}
        </p>
        <p className="offer-line" id="offer-line">
          {mode === "review" ? (
            <>
              <strong>{offer.fromName}</strong> has offered <strong>{offer.amount}</strong>{" "}
              for <strong>{offer.reason || "a favor"}</strong>
            </>
          ) : (
            <>
              <strong>{offer.toName}</strong> countered at <strong>{offer.counterAmount}</strong>{" "}
              for <strong>{offer.reason || "a favor"}</strong>
            </>
          )}
        </p>
        <div className="offer-num-zone">
          <div className={`offer-num mono${editable ? " editable" : ""}`}>
            {odDigits.map((d, i) => (
              <div
                key={i}
                className={`od${editable && i === odSel ? " active" : ""}`}
                onClick={editable ? () => setOdSel(i) : undefined}
              >
                {d}
              </div>
            ))}
          </div>
          {editable ? (
            <div className="stepper">
              <button type="button" aria-label="Raise the selected digit by 1" onClick={() => step(1)}>
                ▲
              </button>
              <button type="button" aria-label="Lower the selected digit by 1" onClick={() => step(-1)}>
                ▼
              </button>
            </div>
          ) : null}
        </div>
        <p className="offer-cap">
          {mode === "review" ? (
            changed ? (
              <>
                Changed from <span className="mono">{offer.amount}</span> — this sends back
                as a <span className="changed">counter-offer</span>. Tap a digit, then use
                the arrows.
              </>
            ) : (
              "Tap a digit, then use the arrows to change it."
            )
          ) : counterBlocked ? (
            `Heads up: ${offer.fromName} only has ${myPoints} points — this counter can't be accepted.`
          ) : (
            "Accept to settle at the countered amount."
          )}
        </p>
        {msg ? (
          <p className="form-msg err" role="alert">
            {msg}
          </p>
        ) : null}
        <div className="btnrow">
          <button
            type="button"
            className="btn green"
            disabled={counterBlocked}
            onClick={onAccept}
          >
            {mode === "counter" ? "Accept counter" : changed ? "Counter" : "Accept"}
          </button>
          <button type="button" className="btn red" onClick={onDecline}>
            Decline
          </button>
        </div>
      </div>
    </div>
  );
}
