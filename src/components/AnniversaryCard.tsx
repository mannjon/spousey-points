"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

// The anniversary card Jonathan made for Eliz. AppShell only renders this
// for her; it appears over the app until she has flipped it and closed it.
// Hearts burst on her first flip only (remembered on her device).

const HEART_COLORS = ["#e5487c", "#f2729b", "#c92a5e", "#f59bb8", "#d6336c"];
const HEARTS = Array.from({ length: 36 }, (_, i) => {
  const ang = (i / 36) * Math.PI * 2 + (i % 5) * 0.13;
  const dist = 190 + ((i * 53) % 330);
  return {
    x: `${Math.round(Math.cos(ang) * dist)}px`,
    y: `${Math.round(Math.sin(ang) * dist * 0.8 - 60)}px`,
    r: `${((i * 37) % 170) - 85}deg`,
    d: `${(i % 7) * 45}ms`,
    s: 16 + ((i * 29) % 26),
    c: HEART_COLORS[i % HEART_COLORS.length],
  };
});

export default function AnniversaryCard({ meId, navy }: { meId: string; navy?: boolean }) {
  const burstKey = `anniv-burst-${meId}`;
  const doneKey = `anniv-done-${meId}`;
  const [show, setShow] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [burst, setBurst] = useState(false);
  const seenInside = useRef(false);
  const burstTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let done = false;
    try {
      done = !!localStorage.getItem(doneKey);
    } catch {
      done = false;
    }
    if (!done) setShow(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!show) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [show]);

  if (!show) return null;

  const flip = () => {
    if (!flipped) {
      seenInside.current = true;
      let burstDone = false;
      try {
        burstDone = !!localStorage.getItem(burstKey);
      } catch {
        burstDone = false;
      }
      if (!burstDone) {
        try {
          localStorage.setItem(burstKey, "1");
        } catch {
          // storage unavailable — burst still plays this once
        }
        setBurst(true);
        if (burstTimer.current) clearTimeout(burstTimer.current);
        burstTimer.current = setTimeout(() => setBurst(false), 2600);
      }
    }
    setFlipped(!flipped);
  };

  const close = () => {
    if (seenInside.current) {
      try {
        localStorage.setItem(doneKey, "1");
      } catch {
        // storage unavailable — card may reappear next visit
      }
    }
    setShow(false);
  };

  return (
    <div className={navy ? "cardveil cardveil-navy" : "cardveil"} role="dialog" aria-modal="true" aria-label="Anniversary card">
      <button type="button" className="cardveil-close" aria-label="Close card" onClick={close}>
        ×
      </button>
      <div className="flipcard-scene">
        <div
          className={flipped ? "flipcard flipped" : "flipcard"}
          onClick={flip}
          role="button"
          aria-label={flipped ? "Flip the card back" : "Flip the card over"}
        >
          <div className="flipcard-face flipcard-front">
            <img src="/card/front.webp" alt="Anniversary card front" />
          </div>
          <div className="flipcard-face flipcard-back">
            <img src="/card/inside.png" alt="Anniversary card inside" />
          </div>
        </div>
        {burst ? (
          <div className="hearts-burst" aria-hidden="true">
            {HEARTS.map((h, i) => (
              <span
                key={i}
                className="hearts-burst-heart"
                style={
                  {
                    "--hx": h.x,
                    "--hy": h.y,
                    "--hr": h.r,
                    "--hdl": h.d,
                    fontSize: h.s,
                    color: h.c,
                  } as CSSProperties
                }
              >
                ♥
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
