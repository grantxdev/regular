/** App shell — login gate (when cloud sync is configured), left rail + screen. */

import { useState } from "react";
import type { Screen } from "./types";
import { cloudEnabled, useStore } from "./store";
import { Login } from "./components/Login";
import { Console } from "./components/Console";
import { MoneyIn } from "./components/MoneyIn";
import { Goals } from "./components/Goals";
import { Vault } from "./components/Vault";
import { Assets } from "./components/Assets";
import { Ledger } from "./components/Ledger";
import { Rules } from "./components/Rules";

const NAV: { id: Screen; label: string; hint: string }[] = [
  { id: "console", label: "Console", hint: "ten seconds to reassurance" },
  { id: "money-in", label: "Money in", hint: "the only required act" },
  { id: "goals", label: "Goals", hint: "two species" },
  { id: "vault", label: "Vault", hint: "four layers, four doors" },
  { id: "assets", label: "Assets", hint: "outside worth" },
  { id: "ledger", label: "Ledger", hint: "the record" },
  { id: "rules", label: "Rules", hint: "your laws" },
];

export default function App() {
  const [screen, setScreen] = useState<Screen>("console");
  const [offline, setOffline] = useState(false);
  const { derived, isSeeded, cloudStatus } = useStore();

  if (cloudEnabled && cloudStatus === "signedOut" && !offline) {
    return <Login onOffline={() => setOffline(true)} />;
  }

  const syncLabel =
    cloudStatus === "disabled"
      ? null
      : cloudStatus === "synced"
        ? "synced"
        : cloudStatus === "syncing"
          ? "syncing…"
          : cloudStatus === "error"
            ? "sync error — data safe locally"
            : "local only";

  return (
    <div className="shell">
      <aside className="rail">
        <div className="rail-brand">
          <div className="wordmark">REGULAR</div>
          <div className="tagline">never not saving</div>
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
          {derived.inRecovery ? (
            <span className="amber">recovery · refilling</span>
          ) : (
            <span>all systems nominal</span>
          )}
          {syncLabel && (
            <div style={{ marginTop: 6 }} className={cloudStatus === "error" ? "amber" : "faint"}>
              {syncLabel}
            </div>
          )}
          {isSeeded && (
            <div style={{ marginTop: 6 }} className="faint">
              example data · wipe in Rules
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
