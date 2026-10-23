"use client";

// A dollar amount that "rolls" smoothly from the old number to the new one, like an odometer, instead of just snapping.
// It's used for running totals so you can feel the number change as you type.

// Borrowed tools: memory, a "do this after drawing" hook, and our money formatter.
import { useEffect, useRef, useState } from "react";
import { formatCents } from "@/lib/money";

// Give it an amount in cents and it handles the rest.
export default function AnimatedMoney({ cents }: { cents: number }) {
  // What's on screen right now (it drifts toward the real amount), and where the last animation ended.
  const [shown, setShown] = useState(cents);
  const shownRef = useRef(cents);

  useEffect(() => {
    // Huge numbers we can't animate safely just show as-is (see the return below).
    if (!Number.isSafeInteger(cents)) return;

    // Slide from wherever we are now to the new amount over about 0.5 seconds, slowing down near the end.
    const from = shownRef.current;
    const start = performance.now();
    const duration = 500;
    let frame = 0;

    function tick(now: number) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = Math.round(from + (cents - from) * eased);
      shownRef.current = value;
      setShown(value);
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    }
    frame = requestAnimationFrame(tick);

    // If a new amount arrives mid-animation, stop this one so they don't fight.
    return () => cancelAnimationFrame(frame);
  }, [cents]);

  // "tabular-nums" keeps every digit the same width so the number doesn't wobble as it rolls.
  return <span className="tabular-nums">{formatCents(Number.isSafeInteger(cents) ? shown : cents)}</span>;
}
