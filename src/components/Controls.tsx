import { useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Hardware-style controls (synth-panel look): a rotary knob with a coloured value arc and a
 * centre-detent fader. Both are dragged with the pointer, fine-tuned with the scroll wheel
 * and reset with a double-click. They never take keyboard focus: the arrow keys belong to
 * the central keymap (track switching), as with the destination tiles.
 */

/** Scroll distance (px) for one wheel step. */
const WHEEL_NOTCH = 40;

/** Turns accumulated wheel deltas into whole steps (a trackpad sends many small ones). */
function useWheelSteps(onSteps: (steps: number) => void) {
  const acc = useRef(0);
  return (e: React.WheelEvent) => {
    acc.current += e.deltaY;
    const steps = Math.trunc(acc.current / WHEEL_NOTCH);
    if (steps === 0) return;
    acc.current -= steps * WHEEL_NOTCH;
    onSteps(-steps);
  };
}

// ── Knob ────────────────────────────────────────────────────────────────────────────────

/** The knob sweeps 270°, from 7:30 to 4:30 on a clock face. */
const SWEEP = 270;
const START = -135;

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arc(cx: number, cy: number, r: number, from: number, to: number): string {
  if (to - from < 0.01) return "";
  const a = polar(cx, cy, r, from);
  const b = polar(cx, cy, r, to);
  const large = to - from > 180 ? 1 : 0;
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${large} 1 ${b.x} ${b.y}`;
}

interface KnobProps {
  label: string;
  /** 0…1 */
  value: number;
  onChange: (value: number) => void;
  /** Value a double-click returns to. */
  resetTo: number;
  /** Screen-reader text of the value (the caller shows it where it fits). */
  display: string;
  /** CSS colour of the value arc, e.g. `var(--tech-cyan)`. */
  color?: string;
  /** Wheel step (fraction of the range). */
  step?: number;
  size?: number;
  title?: string;
  className?: string;
}

export function Knob({
  label,
  value,
  onChange,
  resetTo,
  display,
  color = "var(--orange)",
  step = 0.02,
  size = 26,
  title,
  className,
}: KnobProps) {
  const drag = useRef<{ y: number; value: number } | null>(null);
  const onWheel = useWheelSteps((steps) => onChange(value + steps * step));

  const c = size / 2;
  const ring = c - 2;
  const angle = START + SWEEP * Math.min(Math.max(value, 0), 1);
  const tip = polar(c, c, ring - 5, angle);
  const base = polar(c, c, ring - 10, angle);

  return (
    <div className={cn("flex items-center", className)} title={title}>
      <div
        role="slider"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        aria-valuetext={display}
        tabIndex={-1}
        className="cursor-ns-resize touch-none"
        style={{ width: size, height: size }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { y: e.clientY, value };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          // 160 px of travel for the whole range; Shift for fine control.
          const span = e.shiftKey ? 640 : 160;
          onChange(drag.current.value + (drag.current.y - e.clientY) / span);
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onDoubleClick={() => onChange(resetTo)}
        onWheel={onWheel}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
          <path
            d={arc(c, c, ring, START, START + SWEEP)}
            fill="none"
            stroke="var(--knob)"
            strokeWidth={2}
            strokeLinecap="round"
          />
          <path
            d={arc(c, c, ring, START, angle)}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
          />
          <circle
            cx={c}
            cy={c}
            r={ring - 3.5}
            fill="var(--knob-cap)"
            stroke="var(--knob-edge)"
            strokeWidth={1}
          />
          <line
            x1={base.x}
            y1={base.y}
            x2={tip.x}
            y2={tip.y}
            stroke="var(--foreground)"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  );
}

// ── Fader ───────────────────────────────────────────────────────────────────────────────

interface FaderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  /** The detent (pitch-fader centre); the fill grows from here. */
  center?: number;
  /** Values this close to the centre snap onto it while dragging. */
  snap?: number;
  /** Wheel step. */
  step: number;
  onChange: (value: number) => void;
  onReset: () => void;
  color?: string;
  width?: number;
  title?: string;
  disabled?: boolean;
}

/** A horizontal fader with a centre detent: left is slower, right is faster. */
export function Fader({
  label,
  value,
  min,
  max,
  center = 0,
  snap = 0,
  step,
  onChange,
  onReset,
  color = "var(--tech-green)",
  width = 128,
  title,
  disabled = false,
}: FaderProps) {
  const track = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const onWheel = useWheelSteps((steps) => !disabled && onChange(value + steps * step));

  const frac = (v: number) => (Math.min(Math.max(v, min), max) - min) / (max - min);
  const pos = frac(value);
  const mid = frac(center);

  const fromPointer = (clientX: number) => {
    const el = track.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const f = Math.min(Math.max((clientX - r.left) / r.width, 0), 1);
    const v = min + f * (max - min);
    onChange(Math.abs(v - center) <= snap ? center : v);
  };

  // Tick marks every quarter, the centre one longer.
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div
      role="slider"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-disabled={disabled}
      tabIndex={-1}
      title={title}
      className={cn(
        "relative h-6 shrink-0 cursor-ew-resize touch-none",
        disabled && "pointer-events-none opacity-50",
      )}
      style={{ width }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        dragging.current = true;
        fromPointer(e.clientX);
      }}
      onPointerMove={(e) => dragging.current && fromPointer(e.clientX)}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
      onDoubleClick={onReset}
      onWheel={onWheel}
    >
      {/* Ticks */}
      <div className="absolute inset-x-1.5 top-0 h-full">
        {ticks.map((t) => (
          <span
            key={t}
            className="absolute w-px -translate-x-1/2 bg-muted-foreground/40"
            style={{
              left: `${t * 100}%`,
              top: t === mid ? 2 : 4,
              height: t === mid ? 5 : 3,
            }}
          />
        ))}
      </div>
      {/* Groove + fill from the centre */}
      <div ref={track} className="absolute inset-x-1.5 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-knob">
        <div
          className="absolute inset-y-0 rounded-full"
          style={{
            left: `${Math.min(pos, mid) * 100}%`,
            width: `${Math.abs(pos - mid) * 100}%`,
            background: color,
          }}
        />
        {/* Cap */}
        <div
          className="absolute top-1/2 h-3.5 w-2 -translate-x-1/2 -translate-y-1/2 rounded-[2px] border border-knob-edge bg-knob-cap shadow-sm"
          style={{ left: `${pos * 100}%` }}
        >
          <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-foreground/80" />
        </div>
      </div>
    </div>
  );
}
