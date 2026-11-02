"use client";

import { useEffect, useRef, useState } from "react";

// Slide-to-confirm, ported from the working app's own mechanism: the
// thumb's position lives in a ref and is written straight to the DOM
// (thumb left, fill width in px), and the completion check reads that
// same position — never a rendered state value, which can lag the
// finger's last move and wrongly spring a full slide back. Only a
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
  const INSET = 5;
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
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
    const track = trackRef.current;
    const thumb = thumbRef.current;
    const fill = fillRef.current;
    if (!track || !thumb || !fill) return;
    posRef.current = x;
    setSpring(animate);
    thumb.style.left = `${INSET + x}px`;
    // The fill is the drag trail only: in the working app its width is
    // 0 at rest and it paints solely while the thumb is away from rest.
    // At rest it must stay invisible — the family theme's pale
    // green-soft would otherwise show as a block around the thumb
    // (the bounty slider's dark gold-soft hides the same width, which
    // is why only the Spend slider looked wrong).
    fill.style.width = x > 0 ? `${x + thumb.offsetWidth + INSET}px` : "0px";
    const mt = maxTravel();
    track.setAttribute("aria-valuenow", String(mt ? Math.round((x / mt) * 100) : 0));
  }

  useEffect(() => {
    firedRef.current = false;
    setPos(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  function onPointerDown(e: React.PointerEvent) {
    if (disabled || firedRef.current) return;
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
      onComplete();
    } else {
      setPos(0, true);
    }
  }

  return (
    <div
      ref={trackRef}
      className={`slide-confirm${gold ? " gold" : ""}${disabled ? " disabled" : ""}${spring ? " spring" : ""}`}
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={0}
      aria-disabled={disabled}
      style={{
        ...(inRow ? { flex: 1, marginTop: 0 } : {}),
        ...(disabled ? { pointerEvents: "none" as const } : {}),
      }}
    >
      <div ref={fillRef} className="slide-fill" style={{ width: 0 }} />
      <span className="slide-label">{label}</span>
      <div
        ref={thumbRef}
        className="slide-thumb"
        aria-hidden="true"
        style={{ left: INSET }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => endDrag(false)}
        onPointerCancel={() => endDrag(true)}
      >
        »
      </div>
    </div>
  );
}
