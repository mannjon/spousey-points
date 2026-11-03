"use client";

import { useEffect, useRef, useState } from "react";
import { playSound } from "@/lib/sounds";

// Slide-to-lock. Same drag mechanism as SlideToConfirm (position in a
// ref, written straight to the DOM; only a complete slide fires), but
// the thumb is a padlock on a light gray transparent track: the padlock
// fades from 25% visible at rest to fully visible at the end of the
// slide, and completing the slide plays the door-click lock sound.
export default function LockSlider({
  resetKey,
  onComplete,
}: {
  resetKey: number;
  onComplete: () => void;
}) {
  const INSET = 5;
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const lockRef = useRef<SVGSVGElement>(null);
  const posRef = useRef(0);
  const dragRef = useRef<{ startX: number; startPos: number } | null>(null);
  const firedRef = useRef(false);
  const [spring, setSpring] = useState(true);

  function maxTravel() {
    const track = trackRef.current;
    const thumb = thumbRef.current;
    if (!track || !thumb) return 0;
    return Math.max(0, track.clientWidth - thumb.offsetWidth - INSET * 2);
  }

  function setPos(x: number, animate: boolean) {
    posRef.current = x;
    setSpring(animate);
    const thumb = thumbRef.current;
    if (thumb) thumb.style.left = `${INSET + x}px`;
    const mt = maxTravel();
    if (lockRef.current) {
      const frac = mt ? x / mt : 0;
      lockRef.current.style.opacity = String(0.25 + 0.75 * frac);
    }
    trackRef.current?.setAttribute(
      "aria-valuenow",
      String(mt ? Math.round((x / mt) * 100) : 0)
    );
  }

  useEffect(() => {
    firedRef.current = false;
    setPos(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  function onPointerDown(e: React.PointerEvent) {
    if (firedRef.current) return;
    e.preventDefault();
    setSpring(false);
    dragRef.current = { startX: e.clientX, startPos: posRef.current };
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Capture is a bonus.
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    setPos(Math.min(maxTravel(), Math.max(0, d.startPos + (e.clientX - d.startX))), false);
  }

  function endDrag(cancelled: boolean) {
    if (!dragRef.current) return;
    dragRef.current = null;
    const mt = maxTravel();
    if (!cancelled && mt > 0 && posRef.current >= mt - 2) {
      setPos(mt, true);
      firedRef.current = true;
      playSound("lockClick");
      onComplete();
    } else {
      setPos(0, true);
    }
  }

  return (
    <div
      ref={trackRef}
      className={`lock-slide${spring ? " spring" : ""}`}
      role="slider"
      aria-label="Slide to lock"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={0}
    >
      <span className="slide-label">Slide to lock</span>
      <div
        ref={thumbRef}
        className="lock-thumb"
        aria-hidden="true"
        style={{ left: INSET }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => endDrag(false)}
        onPointerCancel={() => endDrag(true)}
      >
        <svg
          ref={lockRef}
          viewBox="0 0 24 24"
          width="26"
          height="26"
          style={{ opacity: 0.25 }}
          aria-hidden="true"
        >
          <path
            d="M7 10.5V7a5 5 0 0 1 10 0v3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
          />
          <rect x="4.5" y="10.5" width="15" height="9.5" rx="2" fill="currentColor" />
          <circle cx="12" cy="15" r="1.9" fill="var(--surface)" />
        </svg>
      </div>
    </div>
  );
}
