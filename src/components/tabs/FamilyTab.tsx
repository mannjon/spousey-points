"use client";

import type { AppData, BountyDTO } from "@/lib/types";
import { bountyStatusInfo } from "@/lib/bounty";
import { playSound } from "@/lib/sounds";
import {
  approveKidClaim,
  childAdjust,
  kidClaimBounty,
  kidGrabBounty,
  markBountyDone,
  verifyBounty,
} from "@/app/app-actions";

function kidStage(b: BountyDTO): string | null {
  if (!b.kidClaimChildId) return null;
  if (b.status === "COMPLETED") return "done";
  if (b.status === "AWAITING_VERIFY") return "awaiting_poster";
  if (b.status === "CLAIMED") return "grabbed";
  if (b.status === "OPEN") return b.kidApprovals.length >= 2 ? "approved" : "awaiting_parents";
  return null;
}

export default function FamilyTab({
  data,
  refresh,
  toast,
}: {
  data: AppData;
  refresh: () => Promise<void>;
  toast: (msg: string) => void;
}) {
  const me = data.me;
  const child = data.children[0] ?? null;
  const parents = [me, ...data.members];

  async function step(childId: string, delta: number) {
    await childAdjust(childId, delta);
    await refresh();
  }

  return (
    <section className="screen active" aria-label="Family">
      <h2 style={{ fontSize: "1.3rem", fontWeight: 800 }}>Family — kids&apos; tokens</h2>
      <div>
        {data.children.map((c) => (
          <article className="card child-card" style={{ marginBottom: 18 }} key={c.id}>
            <div className="who">
              <span className="name">{c.name}</span>
            </div>
            <div className="bals">
              <div className="bal tok">
                <div className="k">Tokens</div>
                <div className="v mono">{c.tokens}</div>
              </div>
              <div className="token-stepper">
                <button
                  type="button"
                  aria-label={`Give ${c.name} 1 token`}
                  onClick={() => step(c.id, 1)}
                >
                  ▲
                </button>
                <button
                  type="button"
                  aria-label={`Take 1 token from ${c.name}`}
                  onClick={() => step(c.id, -1)}
                >
                  ▼
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
      <div className="panel">
        <h2>Kid bounties</h2>
        <div>
          {!child ? (
            <div className="empty">No child profiles yet.</div>
          ) : data.bounties.length === 0 ? (
            <div className="empty">
              No bounties yet — post one on the Bounties tab, approve it there, then
              request it here for {child.name}.
            </div>
          ) : (
            data.bounties.map((b) => {
              const kr = b.kidClaimChildId === child.id ? kidStage(b) : null;
              const st = bountyStatusInfo(b.status, b.dueDate);
              return (
                <div className="entry" style={{ marginTop: 12 }} key={b.id}>
                  <div className="top">
                    <span className="what">
                      {b.title} — {b.value} tokens
                    </span>
                  </div>
                  <div className="meta">
                    Status: {st.label}
                    {kr ? ` · Kid request: ${kr}` : ""}
                  </div>
                  {!kr && b.status === "OPEN" ? (
                    <div className="child-actions">
                      <button
                        type="button"
                        className="btn"
                        onClick={async () => {
                          const res = await kidClaimBounty(b.id, child.id);
                          if (res.ok) {
                            toast("Kid bounty request sent — both parents must approve.");
                            await refresh();
                          } else toast(res.error);
                        }}
                      >
                        Request for {child.name}
                      </button>
                    </div>
                  ) : null}
                  {kr === "awaiting_parents" ? (
                    <>
                      <div className="approval-row">
                        {parents.map((p) => {
                          const okd = b.kidApprovals.includes(p.id);
                          return (
                            <span key={p.id} className={`approval-pill${okd ? " ok" : ""}`}>
                              {p.screenName} {okd ? "✓ approved" : "· waiting"}
                            </span>
                          );
                        })}
                      </div>
                      {!b.kidApprovals.includes(me.id) ? (
                        <div className="child-actions">
                          <button
                            type="button"
                            className="btn green"
                            onClick={async () => {
                              const res = await approveKidClaim(b.id);
                              if (res.ok) {
                                const done =
                                  b.kidApprovals.length + 1 >= 2;
                                toast(
                                  `${me.screenName} approved. ${done ? "Both parents in — grab unlocked." : "Waiting on the other parent."}`
                                );
                                await refresh();
                              } else toast(res.error);
                            }}
                          >
                            Approve as {me.screenName}
                          </button>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                  {kr === "approved" ? (
                    <div className="child-actions">
                      <button
                        type="button"
                        className="btn green"
                        onClick={async () => {
                          const res = await kidGrabBounty(b.id);
                          if (res.ok) {
                            toast(`${child.name} grabbed “${b.title}”.`);
                            await refresh();
                          } else toast(res.error);
                        }}
                      >
                        Grab for {child.name}
                      </button>
                    </div>
                  ) : null}
                  {kr === "grabbed" ? (
                    <div className="child-actions">
                      <button
                        type="button"
                        className="btn green"
                        onClick={async () => {
                          const res = await markBountyDone(b.id);
                          if (res.ok) {
                            toast("Work marked done — poster approval needed.");
                            await refresh();
                          } else toast(res.error);
                        }}
                      >
                        Mark work done
                      </button>
                    </div>
                  ) : null}
                  {kr === "awaiting_poster" ? (
                    <>
                      <p className="rate-line">
                        Waiting for the poster ({b.postedByName}) to approve the work.
                      </p>
                      <div className="child-actions">
                        <button
                          type="button"
                          className="btn green"
                          disabled={me.id !== b.postedById}
                          onClick={async () => {
                            const res = await verifyBounty(b.id, true);
                            if (res.ok) {
                              playSound("coinPurse");
                              toast(
                                `${child.name} earned ${b.value} tokens — now ${child.tokens + b.value}. No one was debited.`
                              );
                              await refresh();
                            } else toast(res.error);
                          }}
                        >
                          Poster approves work
                        </button>
                      </div>
                    </>
                  ) : null}
                  {kr === "done" ? (
                    <p className="rate-line">
                      <strong>
                        Done — {child.name} earned {b.value} tokens. No balance was
                        debited.
                      </strong>
                    </p>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
