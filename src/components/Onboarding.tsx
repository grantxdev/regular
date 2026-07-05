/**
 * Onboarding carousel — shown once after a new account signs in (and offered
 * again from Rules). A calm, six-panel tour of how Regular thinks. Same design
 * language as the console: no confetti, no badges, engineer-calm copy.
 */

import { useState } from "react";

const ONBOARDED_KEY = "regular-onboarded-v1";

export function hasOnboarded(): boolean {
  return localStorage.getItem(ONBOARDED_KEY) === "1";
}
export function markOnboarded(): void {
  localStorage.setItem(ONBOARDED_KEY, "1");
}

interface Slide {
  tag: string;
  title: string;
  body: string;
}

const SLIDES: Slide[] = [
  {
    tag: "01 · Welcome",
    title: "Regular — never not saving",
    body: "You set your rules once, calmly. From then on every dollar that enters is split automatically, and your only job is to live on a fixed weekly allowance — your Regular. Ignore the app for two weeks and nothing breaks.",
  },
  {
    tag: "02 · Money in",
    title: "Log it and forget it",
    body: "The one thing the app asks of you: log income — amount, source, done in seconds. Instantly it splits into giving first, then your reserve, your goals, your Regular, and any surplus. You watch the receipt; the rules do the work.",
  },
  {
    tag: "03 · The Vault",
    title: "Four layers, four doors",
    body: "Your money sits in layers by how reachable it should be: Regular to spend freely, provisions set aside for bills, an accessible reserve for life's surprises, and a deep reserve behind a heavy door — typed reason, a consequence shown first, and a 24-hour cooldown. The Floor can never be crossed.",
  },
  {
    tag: "04 · Goals",
    title: "An honest advisor",
    body: "Set what you're saving toward and by when. Regular tells you plainly whether you're on track, stretching, or wishful — and if the math doesn't close, it tells you exactly what income or date would make it real. Never alarm-red, always actionable.",
  },
  {
    tag: "05 · Receivables",
    title: "Money owed to you",
    body: "Lend money or record a debt someone owes you. It counts toward your net worth at a confidence-weighted haircut — but never as cash. It can never inflate what you think you can spend, and lending from the reserve carries the same friction as any withdrawal.",
  },
  {
    tag: "06 · Your laws",
    title: "You're in control",
    body: "Every percentage, target, and behavior lives under Rules — edit them deliberately, on your best day. Your whole ledger exports to a JSON file anytime, and everything you do is on the record in the Ledger. Open the app, feel your finances are intact.",
  },
];

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const last = i === SLIDES.length - 1;
  const slide = SLIDES[i];

  const finish = () => {
    markOnboarded();
    onDone();
  };

  return (
    <div className="modal-backdrop" style={{ zIndex: 200 }}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <div className="row mb16">
          <span className="label">{slide.tag}</span>
          <button className="linklike" onClick={finish}>
            {last ? "" : "Skip tour"}
          </button>
        </div>

        <h1 style={{ fontSize: "1.5rem", marginBottom: 12 }}>{slide.title}</h1>
        <p style={{ color: "var(--text-dim)", fontSize: 15, lineHeight: 1.6, minHeight: 132 }}>
          {slide.body}
        </p>

        {/* progress dots */}
        <div style={{ display: "flex", gap: 6, margin: "20px 0" }}>
          {SLIDES.map((_, n) => (
            <span
              key={n}
              onClick={() => setI(n)}
              style={{
                height: 3,
                flex: 1,
                borderRadius: 1,
                cursor: "pointer",
                background: n <= i ? "var(--accent)" : "var(--line)",
                transition: "background 200ms ease",
              }}
            />
          ))}
        </div>

        <div className="row">
          <button
            className="btn btn-quiet"
            disabled={i === 0}
            onClick={() => setI((n) => Math.max(0, n - 1))}
          >
            Back
          </button>
          <span className="status-line faint">
            {i + 1} / {SLIDES.length}
          </span>
          {last ? (
            <button className="btn btn-primary" onClick={finish}>
              Enter Regular
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => setI((n) => n + 1)}>
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
