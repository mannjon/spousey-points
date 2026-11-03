"use client";

import { useEffect, useState } from "react";
import type { AppData, BountyDTO } from "@/lib/types";
import { bountyStatusInfo, countdownText, verifierId } from "@/lib/bounty";
import { formatDateTime, toChicagoInputValue } from "@/lib/time";
import { playSound } from "@/lib/sounds";
import {
  approveBounty,
  claimBounty,
  declineBounty,
  markBountyDone,
  releaseBounty,
  verifyBounty,
} from "@/app/app-actions";
import SheriffBadge from "./SheriffBadge";

// The bounty detail sheet: TWO EQUAL HALVES. Top half — one large
// sheriff badge centered in the exact center. Bottom half — filled top
// to bottom: title at the halfway line, printed status, posted-by/due,
// details when present, the actions for the bounty's state, and the
// countdown bar flush at the bottom.
export default function BountyModal({
  bounty,
  data,
  refresh,
  toast,
  onClose,
}: {
  bounty: BountyDTO;
  data: AppData;
  refresh: () => Promise<void>;
  toast: (msg: string) => void;
  onClose: () => void;
}) {
  const me = data.me;
  const [now, setNow] = useState(() => new Date());
  const [agreeVal, setAgreeVal] = useState(String(bounty.value));
  const [agreeDue, setAgreeDue] = useState(
    bounty.dueDate ? toChicagoInputValue(new Date(bounty.dueDate)) : ""
  );

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setAgreeVal(String(bounty.value));
    setAgreeDue(bounty.dueDate ? toChicagoInputValue(new Date(bounty.dueDate)) : "");
  }, [bounty.id, bounty.value, bounty.dueDate]);

  const st = bountyStatusInfo(bounty.status, bounty.dueDate, now);
  const cd = countdownText(bounty.status, bounty.dueDate, now);
  const expired = cd.expired && bounty.status !== "COMPLETED";
  const isPoster = bounty.postedById === me.id;
  const isHunter = bounty.claimedById === me.id;
  const isVerifier = verifierId(bounty) === me.id;
  const hunterName = bounty.claimedByName ?? bounty.kidClaimChildName;

  async function act(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    const res = await fn();
    if (!res.ok) {
      toast(res.error ?? "That didn't work.");
      return;
    }
    after?.();
    await refresh();
  }

  let actions: React.ReactNode = null;
  if (bounty.status === "PENDING_APPROVAL" && !isPoster) {
    actions = (
      <div className="approve-box">
        <p>Approve this bounty — adjust the value / date if you need to, then agree it:</p>
        <div className="approve-grid">
          <div>
            <label>Agreed reward (tokens)</label>
            <input
              type="number"
              className="mono"
              min={1}
              value={agreeVal}
              onChange={(e) => setAgreeVal(e.target.value)}
            />
          </div>
          <div>
            <label>Agreed complete-by</label>
            <input
              type="datetime-local"
              value={agreeDue}
              onChange={(e) => setAgreeDue(e.target.value)}
            />
          </div>
        </div>
        <div className="bounty-actions">
          <button
            type="button"
            className="btn green"
            onClick={() =>
              act(
                () =>
                  approveBounty({
                    bountyId: bounty.id,
                    value: Math.floor(Number(agreeVal) || 0),
                    dueDate: agreeDue,
                  }),
                () => {
                  playSound("chaChing");
                  toast(`Bounty approved — it's live for grabs at ${agreeVal} tokens.`);
                }
              )
            }
          >
            ✓ Approve bounty
          </button>
          <button
            type="button"
            className="btn red"
            onClick={() =>
              act(() => declineBounty(bounty.id), () => toast("Bounty declined."))
            }
          >
            Decline
          </button>
        </div>
      </div>
    );
  } else if (bounty.status === "OPEN" && !expired && !bounty.kidClaimChildId) {
    actions = (
      <div className="bounty-actions">
        <button
          type="button"
          className="btn green"
          style={{ flex: 1 }}
          onClick={() =>
            act(() => claimBounty(bounty.id), () =>
              toast(`Grabbed! “${bounty.title}” is yours.`)
            )
          }
        >
          Grab this bounty
        </button>
      </div>
    );
  } else if (bounty.status === "CLAIMED" && isHunter) {
    actions = (
      <div className="bounty-actions">
        <button
          type="button"
          className="btn claim"
          disabled={expired}
          onClick={() =>
            act(() => markBountyDone(bounty.id), () =>
              toast(`Claim sent — waiting to be Accepted.`)
            )
          }
        >
          Claim — {bounty.value} tokens
        </button>
        <button
          type="button"
          className="btn ghost"
          onClick={() => act(() => releaseBounty(bounty.id))}
        >
          Release
        </button>
      </div>
    );
  } else if (bounty.status === "AWAITING_VERIFY" && isVerifier) {
    actions = (
      <div className="bounty-actions">
        <button
          type="button"
          className="btn green"
          style={{ flex: 1 }}
          onClick={() =>
            act(
              () => verifyBounty(bounty.id, true),
              () => {
                playSound("coinPurse");
                toast(
                  `Coin purse dumped — ${bounty.value} tokens paid to ${hunterName} for the bounty.`
                );
              }
            )
          }
        >
          Accept — pay {bounty.value} tokens
        </button>
        <button
          type="button"
          className="btn ghost"
          onClick={() => act(() => verifyBounty(bounty.id, false))}
        >
          Send back
        </button>
      </div>
    );
  } else if (bounty.status === "COMPLETED") {
    actions = (
      <p
        style={{
          fontSize: ".9rem",
          fontWeight: 700,
          color: "var(--green-deep)",
          marginTop: 18,
        }}
      >
        ✓ Paid — {hunterName} banked {bounty.value} tokens
        {bounty.completedAt ? ` · Verified ${formatDateTime(bounty.completedAt)}` : ""}
      </p>
    );
  }

  return (
    <div className="bounty-modal open" role="dialog" aria-modal="true" aria-label="Bounty details">
      <div className="sheet-paper">
        <button
          type="button"
          className="bounty-modal-close"
          aria-label="Close bounty details"
          onClick={onClose}
        >
          ×
        </button>
        <div id="bounty-modal-content">
          <div className="sheet-half sheet-half-top">
            <SheriffBadge value={bounty.value} wrapClass="sheet-badge" />
          </div>
          <div className="sheet-half sheet-half-bottom">
            <div className="sheet-bottom-block">
              <div className="bounty-title">{bounty.title}</div>
              <div className="sb-mid">
                <div>
                  <span className={`bstatus ${st.key}`}>{st.label}</span>
                </div>
                <p className="bounty-meta">
                  Posted by <strong>{bounty.postedByName}</strong> ·{" "}
                  {formatDateTime(bounty.createdAt)} &nbsp;·&nbsp; Due{" "}
                  <strong>{bounty.dueDate ? formatDateTime(bounty.dueDate) : ""}</strong>
                  {bounty.approvedByName ? (
                    <>
                      {" "}
                      &nbsp;·&nbsp; Approved by <strong>{bounty.approvedByName}</strong>
                    </>
                  ) : null}
                </p>
                {hunterName && bounty.claimedById ? (
                  <div>
                    <span className="grabbed-by">
                      <span className="avatar-dot"></span> Grabbed by{" "}
                      <strong>{hunterName}</strong>
                    </span>
                  </div>
                ) : null}
                {bounty.kidClaimChildName ? (
                  <div>
                    <span className="grabbed-by">
                      <span className="avatar-dot"></span> For{" "}
                      <strong>{bounty.kidClaimChildName}</strong>
                    </span>
                  </div>
                ) : null}
                {bounty.details ? <p className="bounty-desc">{bounty.details}</p> : null}
                {actions}
              </div>
              <div className="sb-foot">
                <div
                  className={`countdown${cd.expired ? " expired" : ""}${cd.soon && !cd.expired ? " soon" : ""}`}
                >
                  <span className="lbl">
                    {bounty.status === "COMPLETED" ? "Settled" : cd.expired ? "Expired" : "Expires in"}
                  </span>
                  <span className="val">{cd.text}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
