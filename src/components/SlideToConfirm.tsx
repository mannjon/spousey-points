"use client";

import { useEffect, useRef, useState } from "react";

// Slide-to-confirm, the app's own treatment: the thumb sits fully inside
// the track (5px inset) at rest, mid-slide, and at the far end. Only a
// complete slide fires; a partial slide springs back and does nothing.
export default function SlideToConfirm({
  label,
  gold = false,
  disabled = false,
  inRow = false,
  resetKey,
  onComplete,
}: {
  label: string;
  gold?: boolean;
  disabled?: boolean;
  inRow?: boolean;
  resetKey: number;
  onComplete: () => void;
}) {
  const THUMB = 56;
  const INSET = 5;
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; startX: number; startPos: number } | null>(null);
  const firedRef = useRef(false);
  const [x, setX] = useState(0);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    setX(0);
    firedRef.current = false;
  }, [resetKey]);

  function maxX() {
    const w = trackRef.current?.clientWidth ?? 0;
    return Math.max(0, w - THUMB - INSET * 2);
  }

  function onPointerDown(e: React.PointerEvent) {
    if (disabled || firedRef.current) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { pointerId: e.pointerId, startX: e.clientX, startPos: x };
    setDragging(true);
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const next = Math.min(maxX(), Math.max(0, d.startPos + (e.clientX - d.startX)));
    setX(next);
  }

  function onPointerUp(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    drag.current = null;
    setDragging(false);
    const max = maxX();
    if (max > 0 && x >= max * 0.98) {
      setX(max);
      firedRef.current = true;
      onComplete();
    } else {
      setX(0);
    }
  }

  const max = maxX();
  const pct = max > 0 ? Math.min(100, ((x + THUMB) / (max + THUMB + INSET * 2)) * 100) : 0;

  return (
    <div
      ref={trackRef}
      className={`slide-confirm${gold ? " gold" : ""}${disabled ? " disabled" : ""}${dragging ? "" : " spring"}`}
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={max > 0 ? Math.round((x / max) * 100) : 0}
      aria-disabled={disabled}
      style={{
        ...(inRow ? { flex: 1, marginTop: 0 } : {}),
        ...(disabled ? { pointerEvents: "none" as const } : {}),
      }}
    >
      <div className="slide-fill" style={{ width: `${pct}%` }} />
      <span className="slide-label">{label}</span>
      <div
        className="slide-thumb"
        aria-hidden="true"
        style={{ left: INSET + x }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        »
      </div>
    </div>
  );
}
