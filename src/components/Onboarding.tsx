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
    tag: "01 · Regular",
    title: "Your affairs, in order.",
    body: "You set the instructions once. Thereafter each amount received is allocated to them. Your part is to live within a fixed weekly allowance. The rest is handled.",
  },
  {
    tag: "02 · Income",
    title: "Record what arrives.",
    body: "Enter the amount and its source. It is allocated at once — giving, reserve, objectives, your allowance, any surplus. A receipt is filed for each.",
  },
  {
    tag: "03 · Reserves",
    title: "Held in four layers.",
    body: "Funds sit by how readily they should be reached. An allowance to spend. Provisions against known obligations. An accessible reserve on call. Principal, behind a day's delay. The floor does not move.",
  },
  {
    tag: "04 · Objectives",
    title: "The position, stated plainly.",
    body: "Name what you are funding and by when. Each is marked funded on schedule, achievable with discipline, or underfunded. Where it is underfunded, the required figure is given.",
  },
  {
    tag: "05 · Amounts owed",
    title: "Claims, not cash.",
    body: "Record debts owed to you, or lend from a chosen layer. They count toward net worth at a confidence weight, never as available funds. Lending from the reserve carries the same conditions as a withdrawal.",
  },
  {
    tag: "06 · Instructions",
    title: "Everything on the record.",
    body: "Every rate and target is set under Instructions, and adjusted only there. The full statement is available at any time, and exports in one file. Open the app; find your affairs in order.",
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
