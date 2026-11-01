"use client";

import { useEffect, useRef, useState } from "react";
import {
  computePoints,
  digitsOf,
  fmtEstTime,
  hardScale,
  hardUnscale,
  lookupTime,
  parseEstTime,
  valueOf,
} from "@/lib/estimate";

const PLACES = ["1000s", "100s", "10s", "1s"];

// The amount-entry component shared by Spend and the bounty form: a
// 4-column spinning digit dial + type-in ("Entry") swapping with the
// time estimator ("Estimate") inside one fixed-size area, and the
// Strenuous/gross ×1.5 toggle as its own full-width row underneath.
// Behavior follows the app: momentum spin, live estimate apply, the
// toggle shows base × 1.5 in the dial AND the type-in with the base
// preserved, and flipping it off restores the exact amount.
export default function AmountEntry({
  prefix,
  unit,
  downtimeHours,
  lookupText,
  balance,
  resetSignal,
  onValueChange,
}: {
  prefix: string;
  unit: "points" | "tokens";
  downtimeHours: number;
  lookupText: string;
  balance: number | null;
  resetSignal: number;
  onValueChange: (n: number) => void;
}) {
  const [digits, setDigits] = useState<number[]>([0, 0, 0, 0]);
  const [selCol, setSelCol] = useState(0);
  const [mode, setMode] = useState<"entry" | "estimate">("entry");
  const [hard, setHard] = useState(false);
  const [estRaw, setEstRaw] = useState("");
  const [typeinFocused, setTypeinFocused] = useState(false);
  const [typeinText, setTypeinText] = useState("");

  const digitsRef = useRef(digits);
  const hardRef = useRef(hard);
  const modeRef = useRef(mode);
  const baseRef = useRef<number | null>(null);
  const inertiaRef = useRef<number | null>(null);
  const lastLookupRef = useRef<string>("");

  const display = valueOf(digits);
  const estMins = parseEstTime(estRaw);
  const estValue = computePoints(estMins, hard, downtimeHours);

  function cancelInertia() {
    if (inertiaRef.current !== null) {
      cancelAnimationFrame(inertiaRef.current);
      inertiaRef.current = null;
    }
  }

  function pushDigits(d: number[], fromEstimate = false) {
    digitsRef.current = d;
    setDigits(d);
    onValueChange(valueOf(d));
    if (hardRef.current && modeRef.current === "entry" && !fromEstimate) {
      const v = valueOf(d);
      baseRef.current = v > 0 ? hardUnscale(v) : null;
    }
  }

  function applyEstimate(mins: number | null, hardFlag: boolean) {
    const pts = computePoints(mins, hardFlag, downtimeHours);
    if (pts === null) return;
    const base = hardFlag ? computePoints(mins, false, downtimeHours) : null;
    baseRef.current = hardFlag && base !== null ? Math.min(9999, base) : null;
    pushDigits(digitsOf(Math.min(9999, pts)), true);
  }

  // ---- reset (composer reset rule) ----
  useEffect(() => {
    if (resetSignal === 0) return;
    cancelInertia();
    digitsRef.current = [0, 0, 0, 0];
    setDigits([0, 0, 0, 0]);
    setSelCol(0);
    modeRef.current = "entry";
    setMode("entry");
    hardRef.current = false;
    setHard(false);
    baseRef.current = null;
    setEstRaw("");
    onValueChange(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  // ---- average-times lookup on the favor text ----
  useEffect(() => {
    if (lookupText === lastLookupRef.current) return;
    lastLookupRef.current = lookupText;
    const m = lookupTime(lookupText);
    if (!m) return;
    setEstRaw(fmtEstTime(m.minutes));
    if (m.hard && !hardRef.current) {
      hardRef.current = true;
      setHard(true);
      if (modeRef.current === "estimate") {
        applyEstimate(m.minutes, true);
      } else {
        const cur = valueOf(digitsRef.current);
        baseRef.current = cur > 0 ? cur : null;
        if (cur > 0) pushDigits(digitsOf(Math.min(9999, hardScale(cur))), true);
      }
    } else if (modeRef.current === "estimate") {
      applyEstimate(m.minutes, hardRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookupText]);

  // ---- dial stepping ----
  function stepCol(i: number, delta: number) {
    if (!delta) return;
    const d = [...digitsRef.current];
    d[i] = (((d[i] + delta) % 10) + 10) % 10;
    pushDigits(d);
  }

  function pixelsPerStep(absVel: number): number {
    if (absVel < 0.35) return 28;
    if (absVel < 0.7) return 18;
    if (absVel < 1.2) return 11;
    if (absVel < 2.2) return 6;
    return 3.5;
  }

  function startInertia(colIdx: number, velocity: number) {
    cancelInertia();
    if (Math.abs(velocity) < 0.45) return;
    let vel = velocity;
    let residual = 0;
    let last = performance.now();
    const frame = (nowStamp: number) => {
      const dt = Math.min(50, Math.max(1, nowStamp - last));
      last = nowStamp;
      vel *= Math.pow(0.5, dt / 170);
      if (Math.abs(vel) < 0.14) {
        inertiaRef.current = null;
        return;
      }
      residual += vel * dt;
      const pps = pixelsPerStep(Math.abs(vel));
      let steps = 0;
      while (residual >= pps) {
        steps++;
        residual -= pps;
      }
      while (residual <= -pps) {
        steps--;
        residual += pps;
      }
      if (steps !== 0) stepCol(colIdx, steps);
      inertiaRef.current = requestAnimationFrame(frame);
    };
    inertiaRef.current = requestAnimationFrame(frame);
  }

  function onColPointerDown(i: number, e: React.PointerEvent<HTMLDivElement>) {
    cancelInertia();
    setSelCol(i);
    const el = e.currentTarget;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* capture is a bonus */
    }
    let lastY = e.clientY;
    let lastT = performance.now();
    let acc = 0;
    let vel = 0;
    const move = (ev: PointerEvent) => {
      const now = performance.now();
      const dy = lastY - ev.clientY;
      const dt = Math.max(1, now - lastT);
      vel = 0.65 * vel + 0.35 * (dy / dt);
      lastY = ev.clientY;
      lastT = now;
      acc += dy;
      const pps = pixelsPerStep(Math.abs(vel));
      let steps = 0;
      while (acc >= pps) {
        steps++;
        acc -= pps;
      }
      while (acc <= -pps) {
        steps--;
        acc += pps;
      }
      if (steps !== 0) stepCol(i, steps);
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      startInertia(i, vel);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  }

  function onColWheel(i: number, e: React.WheelEvent<HTMLDivElement>) {
    e.preventDefault();
    setSelCol(i);
    const steps =
      Math.max(-5, Math.min(5, Math.round(-e.deltaY / 40))) ||
      (e.deltaY < 0 ? 1 : -1);
    stepCol(i, steps);
  }

  function onPickerKeyDown(e: React.KeyboardEvent) {
    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      const d = [...digitsRef.current];
      d[selCol] = Number(e.key);
      pushDigits(d);
      setSelCol(Math.min(3, selCol + 1));
    } else if (e.key === "Backspace") {
      e.preventDefault();
      const d = [...digitsRef.current];
      d[selCol] = 0;
      pushDigits(d);
      setSelCol(Math.max(0, selCol - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      stepCol(selCol, 1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      stepCol(selCol, -1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setSelCol(Math.max(0, selCol - 1));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setSelCol(Math.min(3, selCol + 1));
    }
  }

  // ---- type-in ----
  function onTypeinChange(raw: string) {
    setTypeinText(raw);
    const n = Math.floor(Number(raw.replace(/\D/g, "")) || 0);
    pushDigits(digitsOf(Math.max(0, Math.min(9999, n))));
  }

  // ---- estimate field ----
  function onEstChange(raw: string) {
    const dg = raw.replace(/\D/g, "").slice(-4);
    setEstRaw(dg ? fmtEstTime(parseEstTime(dg) ?? 0) : "");
    if (modeRef.current === "estimate") {
      applyEstimate(parseEstTime(dg), hardRef.current);
    }
  }

  // ---- mode switch ----
  function switchMode(m: "entry" | "estimate") {
    modeRef.current = m;
    setMode(m);
    if (m === "estimate") {
      const match = lookupTime(lookupText);
      if (match) {
        setEstRaw(fmtEstTime(match.minutes));
        if (match.hard && !hardRef.current) {
          hardRef.current = true;
          setHard(true);
          applyEstimate(match.minutes, true);
          return;
        }
        applyEstimate(match.minutes, hardRef.current);
      } else if (estMins) {
        applyEstimate(estMins, hardRef.current);
      }
    }
  }

  // ---- ×1.5 toggle ----
  function onHardToggle() {
    const next = !hardRef.current;
    hardRef.current = next;
    setHard(next);
    if (modeRef.current === "estimate" && estMins) {
      applyEstimate(estMins, next);
      return;
    }
    if (next) {
      const cur = valueOf(digitsRef.current);
      baseRef.current = cur > 0 ? cur : null;
      if (cur > 0) pushDigits(digitsOf(Math.min(9999, hardScale(cur))), true);
    } else {
      if (baseRef.current !== null) {
        pushDigits(digitsOf(Math.min(9999, baseRef.current)), true);
      }
      baseRef.current = null;
    }
  }

  const overBalance = balance !== null && display > balance;

  return (
    <div className="estimator" id={`${prefix}-estimator`}>
      <div className="est-switch" role="group" aria-label="Estimator mode">
        <button
          type="button"
          aria-pressed={mode === "entry"}
          onClick={() => switchMode("entry")}
        >
          Entry
        </button>
        <button
          type="button"
          aria-pressed={mode === "estimate"}
          onClick={() => switchMode("estimate")}
        >
          Estimate
        </button>
      </div>
      <div className="swap-body" id={`${prefix}-swap`}>
        <div className="swap-pane entry" hidden={mode !== "entry"}>
          <div className="picker-zone">
            <div
              className="picker"
              tabIndex={0}
              role="spinbutton"
              aria-label="Amount. Drag a column slowly to step one digit at a time, or flick it fast to spin through many numbers. You can also type digits."
              aria-valuemin={0}
              aria-valuemax={9999}
              aria-valuenow={display}
              onKeyDown={onPickerKeyDown}
            >
              {digits.map((d, i) => (
                <div
                  key={i}
                  className={`col${i === selCol ? " sel" : ""}`}
                  data-col={i}
                  onPointerDown={(e) => onColPointerDown(i, e)}
                  onWheel={(e) => onColWheel(i, e)}
                >
                  <div className="win">
                    <div className="d side">{(d + 9) % 10}</div>
                    <div className="d cur">{d}</div>
                    <div className="d side">{(d + 1) % 10}</div>
                  </div>
                  <div className="place">{PLACES[i]}</div>
                </div>
              ))}
            </div>
            {balance !== null ? (
              <p className={`balcheck mono${overBalance ? " err" : ""}`}>
                {overBalance
                  ? `Not enough — you have ${balance} points.`
                  : `You have ${balance} points · offering ${display}`}
              </p>
            ) : null}
          </div>
          <div className="field type-field">
            <label htmlFor={`${prefix}-typein`}>…or type the amount</label>
            <div className="amtrow">
              <input
                type="number"
                id={`${prefix}-typein`}
                className="mono"
                min={0}
                max={9999}
                step={1}
                inputMode="numeric"
                placeholder="0"
                value={
                  typeinFocused
                    ? typeinText
                    : display === 0
                      ? ""
                      : String(display)
                }
                onFocus={() => {
                  setTypeinFocused(true);
                  setTypeinText(display === 0 ? "" : String(display));
                }}
                onBlur={() => setTypeinFocused(false)}
                onChange={(e) => onTypeinChange(e.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="swap-pane est" hidden={mode !== "estimate"}>
          <div className="est-top">
            <span className="est-top-label label">Estimated time</span>
          </div>
          <div className="est-field">
            <input
              type="text"
              className="mono"
              inputMode="numeric"
              autoComplete="off"
              placeholder="00:00"
              aria-label="Estimated time, hours and minutes"
              value={estRaw}
              onChange={(e) => onEstChange(e.target.value)}
              onBlur={() => {
                const mins = parseEstTime(estRaw);
                setEstRaw(mins ? fmtEstTime(mins) : "");
              }}
            />
          </div>
          <div className="est-bottom">
            <div className="est-result" aria-live="polite">
              {estValue !== null ? (
                <div className="big mono">
                  = {estValue} <small>{unit}</small>
                </div>
              ) : (
                <div className="big">
                  — <small>{unit}</small>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="est-toggle-row">
        <button
          type="button"
          className="est-toggle"
          aria-pressed={hard}
          onClick={onHardToggle}
        >
          Strenuous / gross <span className="mult">×1.5</span>
        </button>
      </div>
    </div>
  );
}
