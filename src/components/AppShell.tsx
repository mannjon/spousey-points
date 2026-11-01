"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AppData, BountyDTO, OfferDTO } from "@/lib/types";
import { verifierId } from "@/lib/bounty";
import { computePoints } from "@/lib/estimate";
import { playSound } from "@/lib/sounds";
import { changeVersion, inviteDismiss, inviteSend, logout, updateDowntime } from "@/app/actions";
import { markBountySeen, refreshData, updateChildSettings } from "@/app/app-actions";
import BalancesTab from "./tabs/BalancesTab";
import SpendTab from "./tabs/SpendTab";
import BountiesTab from "./tabs/BountiesTab";
import FamilyTab from "./tabs/FamilyTab";
import LogTab from "./tabs/LogTab";
import BountyModal from "./BountyModal";
import OfferSheet from "./OfferSheet";

type TabKey = "home" | "spend" | "bounties" | "family" | "log";

const VERSION_KEY: Record<string, string> = {
  SPOUSEY: "spousey",
  SILVER: "silver",
  FAMILY: "family",
};
const VERSION_NAME: Record<string, string> = {
  spousey: "Spousey Points",
  silver: "Silver Points",
  family: "Family Points",
};

export default function AppShell({
  initialData,
  version,
  invitePromptDone,
}: {
  initialData: AppData;
  version: string;
  invitePromptDone: boolean;
}) {
  const [data, setData] = useState<AppData>(initialData);
  const [tab, setTab] = useState<TabKey>("home");
  const [openBountyId, setOpenBountyId] = useState<string | null>(null);
  const [offerSheet, setOfferSheet] = useState<{ offer: OfferDTO; mode: "review" | "counter" } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(!invitePromptDone);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const vKey = VERSION_KEY[version] ?? "spousey";
  const isFamily = vKey === "family";

  useEffect(() => {
    document.body.setAttribute("data-version", vKey);
    document.title = VERSION_NAME[vKey];
  }, [vKey]);

  useEffect(() => {
    if (!invitePromptDone) {
      const t = setTimeout(
        () => toast("First login — invite your household to get started."),
        500
      );
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2800);
  }, []);

  const refresh = useCallback(async () => {
    const d = await refreshData();
    if (d) setData(d);
  }, []);

  // Apply a known balance result to the screen the instant an action
  // succeeds, instead of waiting on the server round-trip to reflect it.
  const patchMe = useCallback((points: number, tokens: number) => {
    setData((d) => ({ ...d, me: { ...d.me, points, tokens } }));
  }, []);

  const openBounty = useCallback(
    (b: BountyDTO) => {
      playSound("pageFlip");
      setTab("bounties");
      setOpenBountyId(b.id);
      if (!b.seenByMe) {
        void markBountySeen(b.id).then(() => refresh());
      }
    },
    [refresh]
  );

  const anyOverlay = openBountyId !== null || offerSheet !== null || settingsOpen || inviteOpen;
  useEffect(() => {
    document.body.style.overflow = anyOverlay ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [anyOverlay]);

  const openBountyData = openBountyId
    ? (data.bounties.find((b) => b.id === openBountyId) ?? null)
    : null;

  const bountyActionCount = data.bounties.filter(
    (b) =>
      (b.status === "PENDING_APPROVAL" && b.postedById !== data.me.id) ||
      (b.status === "AWAITING_VERIFY" && verifierId(b) === data.me.id)
  ).length;
  const unseenLogCount = data.logEntries.filter((e) => e.indirect && !e.seenByMe).length;

  const dt = data.me.weeklyDowntimeHours;
  const perHour = computePoints(60, false, dt);
  const per30 = computePoints(30, false, dt);
  const per15 = computePoints(15, false, dt);

  function tabButton(key: TabKey, label: string) {
    return (
      <button
        type="button"
        aria-selected={tab === key}
        onClick={() => {
          setTab(key);
          window.scrollTo(0, 0);
        }}
        style={{ position: "relative" }}
      >
        {label}
        {key === "bounties" && bountyActionCount > 0 ? (
          <span
            style={{
              background: "var(--rose)",
              color: "#fff",
              borderRadius: 999,
              padding: "1px 7px",
              fontSize: ".72rem",
              verticalAlign: 2,
              marginLeft: 4,
            }}
          >
            {bountyActionCount}
          </span>
        ) : null}
        {key === "log" && unseenLogCount > 0 ? (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              top: 4,
              right: 6,
              width: 9,
              height: 9,
              borderRadius: "50%",
              background: "var(--red)",
            }}
          />
        ) : null}
      </button>
    );
  }

  return (
    <>
      <main className="wrap">
        <section className={tab === "home" ? "screen active" : "screen"} id="screen-home" aria-label="Balances">
          <BalancesTab
            data={data}
            refresh={refresh}
            patchMe={patchMe}
            toast={toast}
            openBounty={openBounty}
            onReviewOffer={(o) =>
              setOfferSheet({ offer: o, mode: o.status === "COUNTERED" ? "counter" : "review" })
            }
            onOpenSettings={() => setSettingsOpen(true)}
          />
        </section>
        <section className={tab === "spend" ? "screen active" : "screen"} id="screen-spend" aria-label="Spend points">
          <SpendTab data={data} refresh={refresh} toast={toast} />
        </section>
        <section className={tab === "bounties" ? "screen active" : "screen"} id="screen-bounties" aria-label="Bounties">
          <BountiesTab data={data} refresh={refresh} toast={toast} openBounty={openBounty} />
        </section>
        <section className={tab === "family" ? "screen active" : "screen"} id="screen-family" aria-label="Family">
          <FamilyTab data={data} refresh={refresh} toast={toast} />
        </section>
        <section className={tab === "log" ? "screen active" : "screen"} id="screen-log" aria-label="Transaction log">
          <LogTab data={data} refresh={refresh} toast={toast} />
        </section>
      </main>

      {openBountyData ? (
        <BountyModal
          bounty={openBountyData}
          data={data}
          refresh={refresh}
          toast={toast}
          onClose={() => setOpenBountyId(null)}
        />
      ) : null}

      {offerSheet ? (
        <OfferSheet
          offer={offerSheet.offer}
          mode={offerSheet.mode}
          myPoints={data.me.points}
          onClose={() => setOfferSheet(null)}
          refresh={refresh}
          toast={toast}
        />
      ) : null}

      {settingsOpen ? (
        <div
          className="sheet open"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSettingsOpen(false);
          }}
        >
          <div className="box">
            <h2
              id="settings-title"
              style={{ fontFamily: "inherit", fontSize: "1.4rem", color: "var(--ink)" }}
            >
              Settings
            </h2>
            <div className="field">
              <label htmlFor="settings-version">Your version</label>
              <select
                id="settings-version"
                value={vKey}
                onChange={async (e) => {
                  const fd = new FormData();
                  fd.set("version", e.target.value.toUpperCase());
                  await changeVersion(fd);
                  toast(`Version changed to ${VERSION_NAME[e.target.value]}.`);
                  await refresh();
                }}
              >
                <option value="spousey">Spousey Points</option>
                <option value="family">Family Points</option>
                <option value="silver">Silver Points</option>
              </select>
            </div>
            <div style={{ marginTop: 18 }}>
              <h2>Your downtime</h2>
              <div className="field">
                <label htmlFor="downtime-input">My downtime per week (hours)</label>
                <div className="amtrow">
                  <input
                    type="number"
                    id="downtime-input"
                    className="mono"
                    min={1}
                    max={80}
                    step={0.5}
                    inputMode="decimal"
                    defaultValue={dt}
                    key={dt}
                    onBlur={async (e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v) && v > 0 && v !== dt) {
                        const fd = new FormData();
                        fd.set("weeklyDowntimeHours", String(Math.floor(v)));
                        await updateDowntime(fd);
                        await refresh();
                      } else if (!Number.isFinite(v) || v <= 0) {
                        e.target.value = String(dt);
                        toast(
                          `Downtime needs to be more than 0 hours — kept at ${dt} hrs/week.`
                        );
                      }
                    }}
                  />
                </div>
              </div>
              <div className="downtime-math">
                <div className="stat">
                  <div className="k">Your downtime</div>
                  <div className="v mono">{dt} hrs/wk</div>
                </div>
                <div className="stat">
                  <div className="k">1 hour costs</div>
                  <div className="v mono">{perHour ?? "—"} pts</div>
                </div>
                <div className="stat">
                  <div className="k">30 min costs</div>
                  <div className="v mono">{per30 ?? "—"} pts</div>
                </div>
                <div className="stat">
                  <div className="k">15 min costs</div>
                  <div className="v mono">{per15 ?? "—"} pts</div>
                </div>
              </div>
            </div>
            <div style={{ marginTop: 18 }}>
              {data.children.map((c) => (
                <form
                  key={c.id}
                  style={{ marginTop: 18 }}
                  action={async (fd) => {
                    await updateChildSettings(fd);
                    await refresh();
                  }}
                >
                  <h2 style={{ fontFamily: "inherit", fontSize: "1.15rem", color: "var(--ink)" }}>
                    {c.name}
                  </h2>
                  <input type="hidden" name="childId" value={c.id} />
                  <div className="field">
                    <label>Weekly allowance ($)</label>
                    <input
                      type="number"
                      className="mono"
                      min={0}
                      step={0.5}
                      name="weeklyAllowanceDollars"
                      defaultValue={c.weeklyAllowanceDollars}
                    />
                  </div>
                  <div className="field">
                    <label>Weekly token amount</label>
                    <input
                      type="number"
                      className="mono"
                      min={1}
                      step={1}
                      name="weeklyTokenAmount"
                      defaultValue={c.weeklyTokenAmount}
                    />
                  </div>
                  <div className="btnrow">
                    <button type="submit" className="btn">
                      Save
                    </button>
                  </div>
                </form>
              ))}
            </div>
            <div style={{ marginTop: 18 }}>
              <h2 style={{ fontFamily: "inherit", fontSize: "1.15rem", color: "var(--ink)" }}>
                Reference
              </h2>
              <ul className="ref-list">
                <li>Points land every Saturday</li>
                <li>Unused points expire on the last day of the month</li>
                <li>Tokens never expire</li>
                <li>Points you receive land as tokens</li>
              </ul>
            </div>
            <div className="btnrow">
              <form action={logout}>
                <button type="submit" className="btn ghost">
                  Log out
                </button>
              </form>
              <button type="button" className="btn block" onClick={() => setSettingsOpen(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {inviteOpen ? (
        <div
          className="sheet open"
          role="dialog"
          aria-modal="true"
          aria-labelledby="invite-title"
          onClick={async (e) => {
            if (e.target === e.currentTarget) {
              await inviteDismiss();
              setInviteOpen(false);
            }
          }}
        >
          <div className="box">
            <h2 id="invite-title">Send an invite</h2>
            <form
              action={async (fd) => {
                const who =
                  String(fd.get("inviteName") ?? "").trim() ||
                  String(fd.get("inviteContact") ?? "").trim();
                if (!who) {
                  toast("Add a name or an email / phone to send the invite to.");
                  return;
                }
                await inviteSend(fd);
                setInviteOpen(false);
                toast(`Invite sent to ${who} ♥`);
                await refresh();
              }}
            >
              <div className="field">
                <label htmlFor="invite-name">Their name</label>
                <input
                  type="text"
                  id="invite-name"
                  name="inviteName"
                  placeholder="Who are you inviting?"
                  autoComplete="off"
                />
              </div>
              <div className="field">
                <label htmlFor="invite-contact">Email or phone</label>
                <input
                  type="text"
                  id="invite-contact"
                  name="inviteContact"
                  placeholder="Where the invite goes"
                  autoComplete="off"
                />
              </div>
              <div className="field">
                <label htmlFor="invite-note">Note (optional)</label>
                <input
                  type="text"
                  id="invite-note"
                  name="inviteNote"
                  placeholder="Join me ♥"
                  autoComplete="off"
                />
              </div>
              <div className="btnrow">
                <button type="submit" className="btn rose">
                  Send invite
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={async () => {
                    await inviteDismiss();
                    setInviteOpen(false);
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <nav className="tabbar" aria-label="Sections">
        <div className="in">
          {tabButton("home", "Balances")}
          {tabButton("spend", "Spend")}
          {tabButton("bounties", "Bounties")}
          {isFamily ? tabButton("family", "Family") : null}
          {tabButton("log", "Log")}
        </div>
      </nav>

      <div className={`toast${toastMsg ? " show" : ""}`} role="status">
        {toastMsg}
      </div>
    </>
  );
}
