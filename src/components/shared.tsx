/** Small shared UI pieces: count-up numbers, receipt, modal, charts. */

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { SplitResult } from "../types";
import { fmt, fmtExact } from "../lib/util";

/* ------------------------------------------------------------------ */
/* Count-up — numbers tick, nothing bounces                            */
/* ------------------------------------------------------------------ */

export function useCountUp(target: number, durationMs = 600): number {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(from + (target - from) * eased);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, durationMs]);

  return value;
}

export function TickerNumber({
  value,
  symbol,
  className = "hero-num",
}: {
  value: number;
  symbol: string;
  className?: string;
}) {
  const shown = useCountUp(value);
  return <div className={className}>{fmt(shown, symbol)}</div>;
}

/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */

export function Modal({
  onClose,
  children,
}: {
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Split receipt — the clean record of where an inflow went            */
/* ------------------------------------------------------------------ */

export function SplitReceipt({
  amount,
  split,
  symbol,
}: {
  amount: number;
  split: SplitResult;
  symbol: string;
}) {
  const surplusLabel =
    split.surplusTarget === "top_goal" && split.surplusGoalName
      ? `Surplus → ${split.surplusGoalName}`
      : split.surplusTarget === "reserve"
        ? "Surplus → Reserve"
        : "Surplus → held unassigned";

  return (
    <div className="receipt">
      <div className="row">
        <span className="label">Received</span>
        <span className="big-num">{fmtExact(amount, symbol)}</span>
      </div>
      <div className="label mt8 mb8" style={{ color: "var(--text-faint)" }}>
        Allocated
      </div>
      <div className="receipt-row">
        <span className="dim">Giving</span>
        <span className="num">{fmtExact(split.giving, symbol)}</span>
      </div>
      <div className="receipt-row">
        <span className="dim">
          Reserve
          {split.recovery && <span className="faint"> · rebuilding</span>}
        </span>
        <span className="num">{fmtExact(split.reserve, symbol)}</span>
      </div>
      {split.goals.map((g) => (
        <div className="receipt-row" key={g.goalId}>
          <span className="dim">{g.goalName}</span>
          <span className="num">{fmtExact(g.amount, symbol)}</span>
        </div>
      ))}
      <div className="receipt-row">
        <span className="dim">Allowance</span>
        <span className="num">{fmtExact(split.regular, symbol)}</span>
      </div>
      {split.surplus > 0 && (
        <div className="receipt-row">
          <span className="dim">{surplusLabel}</span>
          <span className="num">{fmtExact(split.surplus, symbol)}</span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Net-worth line chart — hand-drawn SVG, quiet pride                  */
/* ------------------------------------------------------------------ */

export function NetWorthChart({
  points,
  symbol,
}: {
  points: { date: string; netWorth: number }[];
  symbol: string;
}) {
  if (points.length < 2) {
    return <div className="status-line">Awaiting history.</div>;
  }
  const W = 720;
  const H = 150;
  const PAD = 6;
  const values = points.map((p) => p.netWorth);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);
  const x = (i: number) => PAD + (i / (points.length - 1)) * (W - PAD * 2);
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2);
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.netWorth).toFixed(1)}`)
    .join(" ");
  const area = `${path} L${x(points.length - 1).toFixed(1)},${H - PAD} L${x(0).toFixed(1)},${H - PAD} Z`;

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        role="img"
        aria-label="Net worth over time"
      >
        <path d={area} fill="rgba(77,227,162,0.07)" />
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="1.6" />
        <circle
          cx={x(points.length - 1)}
          cy={y(points[points.length - 1].netWorth)}
          r="3"
          fill="var(--accent)"
        />
      </svg>
      <div className="row mt8">
        <span className="status-line faint">
          {new Date(points[0].date).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
        </span>
        <span className="status-line faint">
          low {fmt(min, symbol)} · high {fmt(max, symbol)}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Allocation ring                                                     */
/* ------------------------------------------------------------------ */

export interface RingSlice {
  label: string;
  value: number;
  color: string;
}

export function AllocationRing({
  slices,
  symbol,
}: {
  slices: RingSlice[];
  symbol: string;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const R = 52;
  const CIRC = 2 * Math.PI * R;
  let offset = 0;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
      <svg viewBox="0 0 140 140" style={{ width: 128, height: 128, flexShrink: 0 }}>
        <circle cx="70" cy="70" r={R} fill="none" stroke="var(--line)" strokeWidth="14" />
        {total > 0 &&
          slices
            .filter((s) => s.value > 0)
            .map((s) => {
              const frac = s.value / total;
              const dash = frac * CIRC;
              const el = (
                <circle
                  key={s.label}
                  cx="70"
                  cy="70"
                  r={R}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="14"
                  strokeDasharray={`${dash} ${CIRC - dash}`}
                  strokeDashoffset={-offset}
                  transform="rotate(-90 70 70)"
                />
              );
              offset += dash;
              return el;
            })}
      </svg>
      <div className="stack" style={{ gap: 8 }}>
        {slices.map((s) => (
          <div key={s.label} style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span
              style={{
                width: 8,
                height: 8,
                background: s.color,
                display: "inline-block",
                borderRadius: 1,
                alignSelf: "center",
              }}
            />
            <span className="dim" style={{ fontSize: 13, minWidth: 110 }}>
              {s.label}
            </span>
            <span className="num" style={{ fontSize: 13 }}>
              {fmt(s.value, symbol)}
            </span>
            <span className="faint num" style={{ fontSize: 12 }}>
              {total > 0 ? `${Math.round((s.value / total) * 100)}%` : "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Allocation bar — one horizontal stack; hover a segment to read it    */
/* ------------------------------------------------------------------ */

export function AllocationBar({
  slices,
  symbol,
}: {
  slices: RingSlice[];
  symbol: string;
}) {
  const shown = slices.filter((s) => s.value > 0);
  const total = shown.reduce((s, x) => s + x.value, 0);
  const [hover, setHover] = useState<RingSlice | null>(null);
  const pct = (v: number) => (total > 0 ? (v / total) * 100 : 0);

  if (total <= 0) {
    return <div className="status-line">Nothing allocated yet.</div>;
  }

  return (
    <div>
      <div className="alloc-bar">
        {shown.map((s) => (
          <div
            key={s.label}
            className="alloc-seg"
            style={{ width: `${pct(s.value)}%`, background: s.color }}
            title={`${s.label} — ${fmt(s.value, symbol)} (${Math.round(pct(s.value))}%)`}
            onMouseEnter={() => setHover(s)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </div>

      {/* the hovered segment, read out plainly below the bar */}
      <div className="status-line mt16" style={{ minHeight: 20 }}>
        {hover ? (
          <>
            <span
              className="alloc-swatch"
              style={{ background: hover.color, display: "inline-block", marginRight: 8, verticalAlign: "middle" }}
            />
            {hover.label} — <span className="num">{fmt(hover.value, symbol)}</span>{" "}
            <span className="faint">({Math.round(pct(hover.value))}%)</span>
          </>
        ) : (
          <span className="faint">Hover a segment to read it.</span>
        )}
      </div>

      <div className="alloc-legend">
        {shown.map((s) => (
          <span
            key={s.label}
            className="alloc-legend-item"
            onMouseEnter={() => setHover(s)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="alloc-swatch" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
