/**
 * Rules — "these are your laws." Editing is deliberate: the page opens
 * read-only and unlocks with one explicit step. Also home to manual
 * adjustments, data export/import, and the example-data wipe.
 */

import { useRef, useState } from "react";
import { cloudEnabled, useStore } from "../store";
import type { Settings } from "../types";
import { reserveTargetOf, floorOf } from "../engine/replay";
import { fmt } from "../lib/util";
import { Modal } from "./shared";

export function Rules() {
  const {
    data, derived: d, updateSettings, exportData, importData,
    wipeAll, loadExample, isSeeded, apply, actions,
    cloudStatus, accountEmail, signOut,
  } = useStore();
  const s = data.settings;
  const sym = s.currencySymbol;

  const [unlocked, setUnlocked] = useState(false);
  const [draft, setDraft] = useState<Settings>(s);
  const [adjusting, setAdjusting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const unlock = () => {
    setDraft({ ...s });
    setUnlocked(true);
  };

  const save = () => {
    updateSettings(draft);
    setUnlocked(false);
  };

  const num = (key: keyof Settings, opts?: { step?: string; min?: number; max?: number }) => (
    <input
      className="input"
      type="number"
      disabled={!unlocked}
      step={opts?.step ?? "1"}
      min={opts?.min ?? 0}
      max={opts?.max}
      value={String((unlocked ? draft : s)[key])}
      onChange={(e) =>
        setDraft((prev) => ({ ...prev, [key]: parseFloat(e.target.value) || 0 }))
      }
    />
  );

  const view = unlocked ? draft : s;

  return (
    <div className="screen">
      <h1 className="page-title">Rules</h1>
      <p className="page-sub">
        These are your laws — set calmly, on your best day, so your worst day
        doesn't get a vote.
      </p>

      <div className="card">
        <div className="row mb16">
          <span className="label">The Split</span>
          {!unlocked ? (
            <button className="btn" onClick={unlock}>
              Amend the laws
            </button>
          ) : (
            <span style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-primary" onClick={save}>
                Enact changes
              </button>
              <button className="btn btn-quiet" onClick={() => setUnlocked(false)}>
                Cancel
              </button>
            </span>
          )}
        </div>

        <div className="grid2">
          <div className="field">
            <span className="label">Giving — % off the top, always first</span>
            {num("tithePercent", { step: "0.5", max: 100 })}
          </div>
          <div className="field">
            <span className="label">Reserve — % of each inflow until full</span>
            {num("reservePercent", { step: "0.5", max: 100 })}
          </div>
          <div className="field">
            <span className="label">Regular — weekly allowance ({sym})</span>
            {num("regularWeekly", { step: "5" })}
            <span className="field-hint">Sacred. It only changes here, deliberately.</span>
          </div>
          <div className="field">
            <span className="label">Living expenses — monthly ({sym})</span>
            {num("livingExpensesMonthly", { step: "50" })}
            <span className="field-hint">Drives runway, reserve target, and door sizes.</span>
          </div>
          <div className="field">
            <span className="label">Surplus behavior</span>
            <select
              className="select"
              disabled={!unlocked}
              value={view.surplusBehavior}
              onChange={(e) =>
                setDraft((p) => ({ ...p, surplusBehavior: e.target.value as Settings["surplusBehavior"] }))
              }
            >
              <option value="top_goal">Sweep to top-priority goal</option>
              <option value="reserve">Pad the reserve</option>
              <option value="hold">Hold unassigned</option>
            </select>
          </div>
          <div className="field">
            <span className="label">Unspent Regular at week's end</span>
            <select
              className="select"
              disabled={!unlocked}
              value={view.regularRollover ? "roll" : "sweep"}
              onChange={(e) => setDraft((p) => ({ ...p, regularRollover: e.target.value === "roll" }))}
            >
              <option value="sweep">Sweep to top goal</option>
              <option value="roll">Roll over into next week</option>
            </select>
          </div>
        </div>

        <hr className="hairline" />
        <div className="label mb16">Reserve & the Floor</div>
        <div className="grid2">
          <div className="field">
            <span className="label">Target — months of expenses</span>
            {num("reserveTargetMonths", { step: "0.5" })}
          </div>
          <div className="field">
            <span className="label">Target — fixed extra ({sym})</span>
            {num("reserveTargetExtra", { step: "500" })}
          </div>
          <div className="field">
            <span className="label">Accessible layer — months</span>
            {num("accessibleMonths", { step: "0.5" })}
          </div>
          <div className="field">
            <span className="label">When the reserve is full</span>
            <select
              className="select"
              disabled={!unlocked}
              value={view.reserveFullBehavior}
              onChange={(e) =>
                setDraft((p) => ({ ...p, reserveFullBehavior: e.target.value as Settings["reserveFullBehavior"] }))
              }
            >
              <option value="trickle">Keep a small trickle</option>
              <option value="pause">Pause contributions</option>
            </select>
          </div>
          {view.reserveFullBehavior === "trickle" && (
            <div className="field">
              <span className="label">Trickle — % of inflow</span>
              {num("reserveTricklePercent", { step: "0.5", max: 100 })}
            </div>
          )}
          <div className="field">
            <span className="label">Floor — final months</span>
            {num("floorMonths", { step: "0.5" })}
          </div>
          <div className="field">
            <span className="label">Floor — final amount ({sym})</span>
            {num("floorAmount", { step: "500" })}
          </div>
        </div>
        <div className="status-line mt8">
          Current target: {fmt(reserveTargetOf(view), sym)} · Floor:{" "}
          {fmt(floorOf(view), sym)} (whichever is greater) — a hard block, never
          a warning.
        </div>

        <hr className="hairline" />
        <div className="label mb16">Recovery mode & misc</div>
        <div className="grid2">
          <div className="field">
            <span className="label">Recovery — share of goal flow to reserve (0–1)</span>
            {num("recoveryReserveShare", { step: "0.05", max: 1 })}
            <span className="field-hint">
              Goals keep the rest as a heartbeat — never not saving.
            </span>
          </div>
          <div className="field">
            <span className="label">Vehicle depreciation — per year (0–1)</span>
            {num("vehicleDepreciationRate", { step: "0.01", max: 1 })}
          </div>
          <div className="field">
            <span className="label">Currency symbol</span>
            <input
              className="input"
              disabled={!unlocked}
              maxLength={3}
              value={view.currencySymbol}
              onChange={(e) => setDraft((p) => ({ ...p, currencySymbol: e.target.value || "$" }))}
            />
          </div>
        </div>
      </div>

      {/* manual corrections */}
      <div className="card mt16">
        <div className="row">
          <span className="label">Manual adjustment</span>
          <button className="btn" onClick={() => setAdjusting(true)}>
            Adjust a balance
          </button>
        </div>
        <div className="status-line mt8">
          Life is messy. Add or remove money from any bucket, always with a
          one-line reason logged to history.
        </div>
      </div>

      {/* account */}
      {cloudEnabled && (
        <div className="card mt16">
          <div className="row">
            <span className="label">Account</span>
            <span className="status-line">
              {cloudStatus === "synced" && <span className="green">synced</span>}
              {cloudStatus === "syncing" && "syncing…"}
              {cloudStatus === "error" && <span className="amber">sync error — data safe locally</span>}
              {cloudStatus === "signedOut" && "local only"}
            </span>
          </div>
          {accountEmail ? (
            <>
              <div className="status-line mt8">
                Signed in as <span className="mono">{accountEmail}</span>. Your
                ledger syncs to your private database on every change.
              </div>
              <button className="btn mt16" onClick={() => void signOut()}>
                Sign out
              </button>
            </>
          ) : (
            <div className="status-line mt8">
              Not signed in — everything stays in this browser. Reload the app
              to reach the sign-in screen.
            </div>
          )}
        </div>
      )}

      {/* data */}
      <div className="card mt16">
        <div className="label mb16">Your data</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" onClick={exportData}>
            Export JSON
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Import JSON
          </button>
          {isSeeded ? (
            <button
              className="btn btn-danger"
              onClick={() => {
                if (confirm("Wipe the example data and start clean?")) wipeAll();
              }}
            >
              Wipe example data
            </button>
          ) : (
            <>
              <button
                className="btn btn-danger"
                onClick={() => {
                  if (confirm("Erase EVERYTHING? Export first if in doubt.")) wipeAll();
                }}
              >
                Wipe all data
              </button>
              {data.events.length === 0 && (
                <button className="btn" onClick={loadExample}>
                  Load example data
                </button>
              )}
            </>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          style={{ display: "none" }}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const err = importData(await file.text());
            setImportError(err);
            e.target.value = "";
          }}
        />
        {importError && <div className="notice block mt16">{importError}</div>}
        <div className="status-line mt8">
          Everything lives in this browser's storage. Export regularly; the
          file restores you completely.
        </div>
      </div>

      {adjusting && <AdjustDialog onClose={() => setAdjusting(false)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function AdjustDialog({ onClose }: { onClose: () => void }) {
  const { data, derived: d, apply, actions } = useStore();
  const sym = data.settings.currencySymbol;
  const [target, setTarget] = useState<"reserve" | "surplus" | "regular" | "goal">("reserve");
  const [goalId, setGoalId] = useState(data.goals.find((g) => g.status === "active")?.id ?? "");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const v = parseFloat(amount);
  const valid = !isNaN(v) && v !== 0 && reason.trim().length > 0 && (target !== "goal" || goalId);

  const balances: Record<string, number> = {
    reserve: d.reserve,
    surplus: d.surplusHeld,
    regular: d.regularWallet,
    goal: goalId ? (d.goalBalances[goalId] ?? 0) : 0,
  };

  return (
    <Modal onClose={onClose}>
      <h2 className="mb16">Manual adjustment</h2>
      <div className="form-row">
        <div className="field">
          <span className="label">Bucket</span>
          <select
            className="select"
            value={target}
            onChange={(e) => setTarget(e.target.value as typeof target)}
          >
            <option value="reserve">Reserve</option>
            <option value="surplus">Unassigned surplus</option>
            <option value="regular">Regular wallet</option>
            <option value="goal">A goal</option>
          </select>
        </div>
        {target === "goal" && (
          <div className="field">
            <span className="label">Goal</span>
            <select className="select" value={goalId} onChange={(e) => setGoalId(e.target.value)}>
              {data.goals
                .filter((g) => g.status === "active")
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
            </select>
          </div>
        )}
      </div>
      <div className="field">
        <span className="label">
          Amount — positive adds, negative removes (current: {fmt(balances[target], sym)})
        </span>
        <input
          className="input"
          type="number"
          step="0.01"
          value={amount}
          autoFocus
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <div className="field">
        <span className="label">Reason (required, logged forever)</span>
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="btn btn-primary"
          disabled={!valid}
          onClick={() => {
            apply((draft) =>
              actions.adjust(draft, target, v, reason.trim(), target === "goal" ? goalId : undefined)
            );
            onClose();
          }}
        >
          Apply
        </button>
        <button className="btn btn-quiet" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}
