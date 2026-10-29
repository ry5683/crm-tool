"use client";

// A box the customer signs in with a finger (or mouse). When they lift their finger, the drawing
// is handed back as a small PNG picture (as text). "Clear" wipes it so they can try again.

import { useEffect, useRef, useState } from "react";

export default function SignaturePad({
  onChange,
  disabled = false,
}: {
  onChange: (pngDataUrl: string | null) => void;
  disabled?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  // Size the drawing surface to the box on screen, sharp on phone screens but not huge.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const box = canvas.getBoundingClientRect();
    canvas.width = Math.round(box.width * ratio);
    canvas.height = Math.round(box.height * ratio);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(ratio, ratio);
    context.lineWidth = 2.5;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#18181b";
  }, []);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    const { x, y } = point(event);
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + 0.1, y + 0.1); // a tap still leaves a dot
    context.stroke();
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const { x, y } = point(event);
    context.lineTo(x, y);
    context.stroke();
  }

  function end(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    drawing.current = false;
    setHasInk(true);
    onChange(event.currentTarget.toDataURL("image/png"));
  }

  function clear() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.restore();
    setHasInk(false);
    onChange(null);
  }

  return (
    <div>
      <canvas
        aria-label="Signature box. Sign with your finger or mouse."
        className="h-40 w-full touch-none rounded-lg border-2 border-dashed border-zinc-300 bg-white"
        onPointerCancel={end}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        ref={canvasRef}
        role="img"
      />
      <div className="mt-1 flex items-center justify-between text-xs text-zinc-500">
        <span>{hasInk ? "Signed" : "Sign above with your finger"}</span>
        <button
          className="font-medium text-zinc-700 underline underline-offset-2 disabled:opacity-60"
          disabled={disabled || !hasInk}
          onClick={clear}
          type="button"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
