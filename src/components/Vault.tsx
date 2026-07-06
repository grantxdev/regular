/**
 * Vault — the four liquidity layers and their doors.
 *   Regular: no door. Provisions: visible, never presented as spendable.
 *   Accessible: one tap + a short reason. Deep: typed reason, consequence
 *   shown first, 24-hour cooldown, and the Floor — a hard block.
 */

import { useState } from "react";
import { useStore } from "../store";
import { floorOf } from "../engine/replay";
import { fmt, fmtExact, fmtDate, parseISO, r2 } from "../lib/util";
import { Modal } from "./shared";
import { AccessibleWithdrawModal, TakeAllowanceModal } from "./CashActions";

export function Vault() {
  const { data, derived: d, apply, actions } = useStore();
  const sym = data.settings.currencySymbol;
  const s = data.settings;

  const [door, setDoor] = useState<"deep" | "surplus" | null>(null);
  const [accessibleOut, setAccessibleOut] = useState(false);
  const [takeAllowance, setTakeAllowance] = useState(false);

  const floor = floorOf(s);
  const pendingTotal = data.pendingWithdrawals.reduce((t, p) => t + p.amount, 0);
  const deepWithdrawable = Math.max(0, r2(d.deep - floor - pendingTotal));

  return (
    <div className="screen">
      <h1 className="page-title">Vault</h1>
      <p className="page-sub">Funds held in four layers.</p>

      {d.inRecovery && (
        <div className="notice warn mb16">
          Reserves engaged. Rebuilding has begun. Allocations to objectives are
          reduced; your allowance is unaffected. Normal allocations resume when
          the reserve is restored.
        </div>
      )}

      {/* pending deep withdrawals */}
      {data.pendingWithdrawals.map((p) => {
        const ready = Date.now() >= parseISO(p.confirmAfter).getTime();
        return (
          <div className="notice mb16" key={p.id}>
            <div className="row">
              <span>
                {p.lend ? (
                  <>Pending loan to {p.lend.person}: </>
                ) : (
                  <>Pending deep withdrawal: </>
                )}
                <span className="num">{fmtExact(p.amount, sym)}</span>
                {" — "}
                <span className="dim">"{p.reason}"</span>
                <br />
                <span className="faint" style={{ fontSize: 12 }}>
                  {ready
                    ? "Cooldown complete. Confirm or cancel."
                    : `Confirmable after ${new Date(p.confirmAfter).toLocaleString()}. Reversible until then.`}
                  {p.lend && " On confirm, the cash becomes a receivable — net worth unchanged."}
                </span>
              </span>
              <span style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button
                  className="btn"
                  disabled={!ready}
                  onClick={() => {
                    const err = apply((draft) =>
                      actions.confirmDeepWithdrawal(draft, p.id)
                    ) as string | null;
                    if (err) alert(err);
                  }}
                >
                  Confirm
                </button>
                <button
                  className="btn btn-quiet"
                  onClick={() => apply((draft) => actions.cancelDeepWithdrawal(draft, p.id))}
                >
                  Cancel
                </button>
              </span>
            </div>
          </div>
        );
      })}

      <div className="grid2">
        {/* Layer 1 — Regular */}
        <div className="card">
          <div className="row">
            <span className="label">1 · Allowance</span>
            <span className="chip ok">at discretion</span>
          </div>
          <div className="big-num mt8">{fmt(d.regularRemaining, sym)}</div>
          <div className="status-line mt8">
            This week's allowance.
            {d.regularWallet > d.regularRemaining && (
              <> {fmt(d.regularWallet - d.regularRemaining, sym)} funded for next week.</>
            )}
          </div>
        </div>

        {/* Layer 2 — Provisions */}
        <div className="card">
          <div className="row">
            <span className="label">2 · Provisions</span>
            <span className="chip">assigned</span>
          </div>
          <div className="big-num mt8 dim">{fmt(d.provisionsTotal, sym)}</div>
          <div className="status-line mt8">
            Held against obligations. Settled from Goals when due.
          </div>
        </div>

        {/* Layer 3 — Accessible reserve */}
        <div className="card">
          <div className="row">
            <span className="label">3 · Accessible reserve</span>
            <span className="chip">on call</span>
          </div>
          <div className="big-num mt8">{fmt(d.accessible, sym)}</div>
          <div className="status-line mt8">
            Up to {s.accessibleMonths} month{s.accessibleMonths === 1 ? "" : "s"} of
            expenses. Your weekly allowance and everyday withdrawals draw from
            here; income replenishes it.
          </div>
          <div className="mt16" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn" onClick={() => setTakeAllowance(true)}>
              Take allowance
            </button>
            <button className="btn" disabled={d.accessible <= 0} onClick={() => setAccessibleOut(true)}>
              Withdraw
            </button>
          </div>
        </div>

        {/* Layer 4 — Deep reserve */}
        <div className="card">
          <div className="row">
            <span className="label">4 · Deep reserve</span>
            <span className="chip">principal</span>
          </div>
          <div className="big-num mt8">{fmt(d.deep, sym)}</div>
          <div className="status-line mt8">
            A written reason, then a day's delay before it settles. Drawing on
            principal engages the reserves.
          </div>
          <div className="status-line mt8">
            The floor holds the final {fmt(floor, sym)} ({s.floorMonths} months
            or {fmt(s.floorAmount, sym)}, whichever is greater). It does not
            move. Available now: <span className="num">{fmt(deepWithdrawable, sym)}</span>.
          </div>
          <button className="btn mt16" disabled={deepWithdrawable <= 0} onClick={() => setDoor("deep")}>
            Request withdrawal
          </button>
        </div>
      </div>

      {d.surplusHeld > 0 && (
        <div className="card mt16">
          <div className="row">
            <span className="label">Unassigned surplus</span>
            <span className="num">{fmt(d.surplusHeld, sym)}</span>
          </div>
          <div className="status-line mt8">
            Withdraw at your discretion.
          </div>
          <button className="btn mt16" onClick={() => setDoor("surplus")}>
            Withdraw
          </button>
        </div>
      )}

      <div className="card mt16">
        <div className="label mb8">Reserve status</div>
        <div className="status-line">
          Reserve: {d.runwayMonths.toFixed(1)} months.{" "}
          {d.inRecovery ? "Rebuilding." : d.runwayMonths >= 3 ? "Sound." : "Building."}
        </div>
        <div className="meter mt8">
          <div style={{ width: `${Math.min(100, (d.reserve / Math.max(d.reserveTarget, 1)) * 100)}%` }} />
        </div>
        <div className="status-line mt8 faint">
          {fmt(d.reserve, sym)} of {fmt(d.reserveTarget, sym)} target (
          {s.reserveTargetMonths} months + {fmt(s.reserveTargetExtra, sym)}).
        </div>
      </div>

      {door && <WithdrawDialog layer={door} onClose={() => setDoor(null)} />}
      {accessibleOut && <AccessibleWithdrawModal onClose={() => setAccessibleOut(false)} />}
      {takeAllowance && <TakeAllowanceModal onClose={() => setTakeAllowance(false)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function WithdrawDialog({
  layer,
  onClose,
}: {
  layer: "deep" | "surplus";
  onClose: () => void;
}) {
  const { data, derived: d, apply, actions } = useStore();
  const sym = data.settings.currencySymbol;
  const s = data.settings;
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const floor = floorOf(s);
  const pendingTotal = data.pendingWithdrawals.reduce((t, p) => t + p.amount, 0);
  const max =
    layer === "surplus"
      ? d.surplusHeld
      : Math.max(0, r2(d.deep - floor - pendingTotal));

  const v = parseFloat(amount);
  const amountOk = !isNaN(v) && v > 0 && v <= max + 0.005;
  // Deep door demands a real typed reason; surplus just wants a short note.
  const reasonOk = layer === "deep" ? reason.trim().length >= 4 : reason.trim().length >= 1;

  const newRunway = amountOk ? (d.reserve - v) / Math.max(s.livingExpensesMonthly, 1) : null;

  const titles = {
    deep: "Deep reserve — principal",
    surplus: "Unassigned surplus",
  };

  const submit = () => {
    if (!amountOk || !reasonOk) return;
    let err: string | null = null;
    if (layer === "surplus") {
      err = apply((draft) => actions.withdrawSurplus(draft, v, reason.trim())) as string | null;
    } else {
      err = apply((draft) => actions.requestDeepWithdrawal(draft, v, reason.trim())) as string | null;
    }
    if (err) setError(err);
    else onClose();
  };

  return (
    <Modal onClose={onClose}>
      <h2 className="mb16">{titles[layer]}</h2>
      <div className="field">
        <span className="label">Amount (max {fmtExact(max, sym)})</span>
        <input
          className="input"
          type="number"
          min="0"
          step="0.01"
          value={amount}
          autoFocus
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <div className="field">
        <span className="label">{layer === "deep" ? "Reason (for the record)" : "Reason"}</span>
        <input
          className="input"
          placeholder={layer === "deep" ? "The purpose of this draw" : "e.g. car repair"}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>

      {/* consequence, shown before commitment */}
      {layer === "deep" && amountOk && newRunway != null && (
        <div className="notice warn mb16">
          This draws on principal. Runway falls from {d.runwayMonths.toFixed(1)} to{" "}
          {Math.max(0, newRunway).toFixed(1)} months. Confirm tomorrow.
          Reversible until then. Reserves engage on confirmation; your allowance
          is unaffected.
        </div>
      )}
      {error && <div className="notice block mb16">{error}</div>}

      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-primary" disabled={!amountOk || !reasonOk} onClick={submit}>
          {layer === "deep" ? "Confirm tomorrow" : "Withdraw"}
        </button>
        <button className="btn btn-quiet" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}
