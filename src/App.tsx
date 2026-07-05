/** App shell — login gate (when cloud sync is configured), left rail + screen. */

import { useEffect, useState } from "react";
import type { Screen } from "./types";
import { cloudEnabled, useStore } from "./store";
import { Login } from "./components/Login";
import { Onboarding, hasOnboarded } from "./components/Onboarding";
import { Console } from "./components/Console";
import { MoneyIn } from "./components/MoneyIn";
import { Goals } from "./components/Goals";
import { Vault } from "./components/Vault";
import { Assets } from "./components/Assets";
import { Ledger } from "./components/Ledger";
import { Rules } from "./components/Rules";

const NAV: { id: Screen; label: string; hint: string }[] = [
  { id: "console", label: "Console", hint: "Overview" },
  { id: "money-in", label: "Money in", hint: "Record income" },
  { id: "goals", label: "Goals", hint: "Objectives" },
  { id: "vault", label: "Vault", hint: "Reserves" },
  { id: "assets", label: "Assets", hint: "Holdings" },
  { id: "ledger", label: "Ledger", hint: "Statement" },
  { id: "rules", label: "Rules", hint: "Instructions" },
];

export default function App() {
  const [screen, setScreen] = useState<Screen>("console");
  const [offline, setOffline] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const { derived, isSeeded, cloudStatus } = useStore();

  const gated = cloudEnabled && cloudStatus === "signedOut" && !offline;

  // First arrival (signed in, or chose offline) sees the tour once. Rules can
  // replay it by dispatching the "regular:show-tour" event.
  useEffect(() => {
    if (!gated && !hasOnboarded()) setShowTour(true);
    const replay = () => setShowTour(true);
    window.addEventListener("regular:show-tour", replay);
    return () => window.removeEventListener("regular:show-tour", replay);
  }, [gated]);

  if (gated) {
    return <Login onOffline={() => setOffline(true)} />;
  }

  const syncLabel =
    cloudStatus === "disabled"
      ? null
      : cloudStatus === "synced"
        ? "Synced."
        : cloudStatus === "syncing"
          ? "Syncing."
          : cloudStatus === "error"
            ? "Sync failed. Records held locally."
            : "Held locally.";

  return (
    <div className="shell">
      {showTour && <Onboarding onDone={() => setShowTour(false)} />}
      <aside className="rail">
        <div className="rail-brand">
          <div className="wordmark">REGULAR</div>
          <div className="tagline">Your affairs, in order.</div>
        </div>
        <nav className="rail-nav">
          {NAV.map((n) => (
            <button
              key={n.id}
              className={`nav-item ${screen === n.id ? "active" : ""}`}
              onClick={() => setScreen(n.id)}
            >
              {n.label}
              <span className="nav-hint">{n.hint}</span>
            </button>
          ))}
        </nav>
        <div className="rail-foot">
          {derived.inRecovery && <span className="amber">Rebuilding underway.</span>}
          {syncLabel && (
            <div style={{ marginTop: 6 }} className={cloudStatus === "error" ? "amber" : "faint"}>
              {syncLabel}
            </div>
          )}
          {isSeeded && (
            <div style={{ marginTop: 6 }} className="faint">
              Sample records. Clear in Rules.
            </div>
          )}
        </div>
      </aside>
      <main className="main">
        {screen === "console" && <Console go={setScreen} />}
        {screen === "money-in" && <MoneyIn />}
        {screen === "goals" && <Goals />}
        {screen === "vault" && <Vault />}
        {screen === "assets" && <Assets />}
        {screen === "ledger" && <Ledger />}
        {screen === "rules" && <Rules />}
      </main>
    </div>
  );
}
