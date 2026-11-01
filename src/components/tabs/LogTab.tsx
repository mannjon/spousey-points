"use client";

import { useEffect, useRef, useState } from "react";
import type { AppData, LogEntryDTO } from "@/lib/types";
import { formatDateTime } from "@/lib/time";
import { markLogSeen, updateLogNote } from "@/app/app-actions";

function dotClass(kind: string): string {
  switch (kind) {
    case "OFFER_ACCEPTED":
    case "OFFER_TO_INVITEE":
      return "green";
    case "REDEEM":
    case "BUY_POINTS":
      return "gold";
    case "OFFER_DECLINED":
      return "red";
    case "LOVE_TAP":
      return "rose";
    case "WEEKLY_GRANT":
    case "WEEKLY_DROP":
    case "POINTS_EXPIRED":
      return "gray";
    default:
      return "gold"; // bounty + child kinds
  }
}

function amtLabel(e: LogEntryDTO): string {
  const n = e.amount ?? 0;
  switch (e.kind) {
    case "OFFER_ACCEPTED":
    case "OFFER_TO_INVITEE":
      return `${n} pts → tok`;
    case "WEEKLY_GRANT":
      return `+${n} pts`;
    case "REDEEM":
      return `−${n} tok`;
    case "BUY_POINTS":
      return `${n} tok → pts`;
    case "OFFER_DECLINED":
      return `${n} pts · ✕`;
    case "LOVE_TAP":
      return `${n} pt → tok`;
    case "WEEKLY_DROP":
    case "POINTS_EXPIRED":
      return "";
    default:
      return `${n} tok · bounty`;
  }
}

export default function LogTab({
  data,
  refresh,
  toast,
}: {
  data: AppData;
  refresh: () => Promise<void>;
  toast: (msg: string) => void;
}) {
  const s = data.stats;
  const rows: [string, string][] = [
    ["Pts used per current week", String(s.ptsUsedWeek)],
    ["Avg points used per week", String(s.avgPtsUsedWeek)],
    ["Tokens used current week", String(s.tokensUsedWeek)],
    ["Avg tokens earned per week", String(s.avgTokensEarnedWeek)],
    ["All time tokens earned", String(s.allTimeTokensEarned)],
    ["Total requests made", String(s.totalRequestsMade)],
    ["Total requests completed", String(s.totalRequestsCompleted)],
    [
      "Avg percentage of free time spent on requests or bounties",
      `${s.avgFreeTimePct.toFixed(1)}%`,
    ],
  ];

  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const seenSentRef = useRef<Set<string>>(new Set());

  // Indirect-change dots clear once the entry has been viewed — scrolled
  // into view counts.
  useEffect(() => {
    const root = listRef.current;
    if (!root) return;
    const unseen = data.logEntries.filter(
      (e) => e.indirect && !e.seenByMe && !seenSentRef.current.has(e.id)
    );
    if (!unseen.length) return;
    const observer = new IntersectionObserver(
      (records) => {
        const ids: string[] = [];
        for (const r of records) {
          if (r.isIntersecting) {
            const id = (r.target as HTMLElement).dataset.entryId;
            if (id && !seenSentRef.current.has(id)) {
              seenSentRef.current.add(id);
              ids.push(id);
            }
          }
        }
        if (ids.length) {
          void markLogSeen(ids).then(() => refresh());
        }
      },
      { threshold: 0.4 }
    );
    for (const e of unseen) {
      const el = root.querySelector(`[data-entry-id="${e.id}"]`);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.logEntries]);

  return (
    <section className="screen active" aria-label="Transaction log">
      <h2 style={{ fontSize: "1.3rem", fontWeight: 800 }}>Transaction log</h2>
      <div className="stats-grid">
        {rows.map(([k, v]) => (
          <div className="stat-cell" key={k}>
            <div className="k">{k}</div>
            <div className="v mono">{v}</div>
          </div>
        ))}
      </div>
      <div className="log-list" ref={listRef}>
        {data.logEntries.length === 0 ? (
          <div className="empty">
            Nothing here yet. The first favor will start the record.
          </div>
        ) : (
          data.logEntries.map((e) => (
            <article className="entry" key={e.id} data-entry-id={e.id}>
              <div className="top">
                <span className={`dot ${dotClass(e.kind)}`}></span>
                <span className="what">{e.text}</span>
                <span className="amt">
                  <span className="mono">{amtLabel(e)}</span>
                </span>
              </div>
              <div className="meta">
                {formatDateTime(e.createdAt)}
                {e.counteredFrom ? ` Countered from ${e.counteredFrom}.` : ""}
                {e.kind === "REDEEM" && e.redeemAcked !== null ? (
                  e.redeemAcked ? (
                    <>
                      {" "}
                      <span className="status-chip done">Logged</span>
                    </>
                  ) : (
                    <>
                      {" "}
                      <span className="status-chip">Waiting to be logged</span>
                    </>
                  )
                ) : null}
              </div>
              {e.note ? <div className="note-view">{e.note}</div> : null}
              <button
                type="button"
                className="addnote"
                onClick={() => {
                  setOpenNoteId(openNoteId === e.id ? null : e.id);
                  setNoteText(e.note ?? "");
                }}
              >
                {e.note ? "Edit details" : "Add details"}
              </button>
              <div className={`note-edit${openNoteId === e.id ? " open" : ""}`}>
                <label
                  className="lbl"
                  htmlFor={`note-ta-${e.id}`}
                  style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--muted)" }}
                >
                  Details (optional)
                </label>
                <textarea
                  id={`note-ta-${e.id}`}
                  placeholder="What was it really for?"
                  value={openNoteId === e.id ? noteText : (e.note ?? "")}
                  onChange={(ev) => setNoteText(ev.target.value)}
                />
                <button
                  type="button"
                  className="btn"
                  onClick={async () => {
                    const res = await updateLogNote(e.id, noteText);
                    if (res.ok) {
                      setOpenNoteId(null);
                      toast("Details saved to the log entry.");
                      await refresh();
                    } else toast(res.error);
                  }}
                >
                  Save details
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
