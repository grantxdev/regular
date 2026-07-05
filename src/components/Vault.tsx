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

export function Vault() {
  const { data, derived: d, apply, actions } = useStore();
  const sym = data.settings.currencySymbol;
  const s = data.settings;

  const [door, setDoor] = useState<"accessible" | "deep" | "surplus" | null>(null);

  const floor = floorOf(s);
  const pendingTotal = data.pendingWithdrawals.reduce((t, p) => t + p.amount, 0);
  const deepWithdrawable = Math.max(0, r2(d.deep - floor - pendingTotal));

  return (
    <div className="screen">
      <h1 className="page-title">Vault</h1>
      <p className="page-sub">Four layers, four doors. The deeper the money, the heavier the door.</p>

      {d.inRecovery && (
        <div className="notice warn mb16">
          Recovery mode active. ~{Math.round(s.recoveryReserveShare * 100)}% of
          the goal flow is refilling the reserve; goals keep a{" "}
          {Math.round((1 - s.recoveryReserveShare) * 100)}% heartbeat; your
          Regular is untouched. Exit is automatic when the reserve is full.
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
            <span className="label">1 · Regular</span>
            <span className="chip ok">spend freely</span>
          </div>
          <div className="big-num mt8">{fmt(d.regularRemaining, sym)}</div>
          <div className="status-line mt8">
            This week's allowance. No questions, no tracking required.
            {d.regularWallet > d.regularRemaining && (
              <> ({fmt(d.regularWallet - d.regularRemaining, sym)} already funded for next week.)</>
            )}
          </div>
        </div>

        {/* Layer 2 — Provisions */}
        <div className="card">
          <div className="row">
            <span className="label">2 · Provisions</span>
            <span className="chip">spoken for</span>
          </div>
          <div className="big-num mt8 dim">{fmt(d.provisionsTotal, sym)}</div>
          <div className="status-line mt8">
            Liquid but committed — rent, insurance, dues. It leaves through
            Goals when each bill comes due, not through a door here.
          </div>
        </div>

        {/* Layer 3 — Accessible reserve */}
        <div className="card">
          <div className="row">
            <span className="label">3 · Accessible reserve</span>
            <span className="chip">life happens</span>
          </div>
          <div className="big-num mt8">{fmt(d.accessible, sym)}</div>
          <div className="status-line mt8">
            {s.accessibleMonths} month{s.accessibleMonths === 1 ? "" : "s"} of
            living expenses behind a light door. Withdrawals refill
            automatically from future income.
          </div>
          <button className="btn mt16" disabled={d.accessible <= 0} onClick={() => setDoor("accessible")}>
            Withdraw
          </button>
        </div>

        {/* Layer 4 — Deep reserve */}
        <div className="card">
          <div className="row">
            <span className="label">4 · Deep reserve</span>
            <span className="chip">heavy door</span>
          </div>
          <div className="big-num mt8">{fmt(d.deep, sym)}</div>
          <div className="status-line mt8">
            Requires a typed reason, shows the consequence first, then a
            24-hour cooldown before it's real. Withdrawing enters recovery mode.
          </div>
          <div className="status-line mt8">
            <span className="red">The Floor:</span> the last {fmt(floor, sym)}{" "}
            (max of {s.floorMonths} months or {fmt(s.floorAmount, sym)}) can
            never leave through this door. Withdrawable now:{" "}
            <span className="num">{fmt(deepWithdrawable, sym)}</span>.
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
            Held by your surplus rule. Withdraw freely or leave it be.
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
          {d.reserve >= d.reserveTarget ? "Full. Nominal." : d.inRecovery ? "Refilling." : "Filling. Nominal."}
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
    </div>
  );
}

/* ------------------------------------------------------------------ */

function WithdrawDialog({
  layer,
  onClose,
}: {
  layer: "accessible" | "deep" | "surplus";
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
    layer === "accessible"
      ? d.accessible
      : layer === "surplus"
        ? d.surplusHeld
        : Math.max(0, r2(d.deep - floor - pendingTotal));

  const v = parseFloat(amount);
  const amountOk = !isNaN(v) && v > 0 && v <= max + 0.005;
  // Deep door demands a real typed reason; accessible just wants a short note.
  const reasonOk = layer === "deep" ? reason.trim().length >= 4 : reason.trim().length >= 1;

  const newRunway = amountOk ? (d.reserve - v) / Math.max(s.livingExpensesMonthly, 1) : null;

  const titles = {
    accessible: "Accessible reserve — life happens",
    deep: "Deep reserve — heavy door",
    surplus: "Unassigned surplus",
  };

  const submit = () => {
    if (!amountOk || !reasonOk) return;
    let err: string | null = null;
    if (layer === "accessible") {
      err = apply((draft) => actions.withdrawAccessible(draft, v, reason.trim())) as string | null;
    } else if (layer === "surplus") {
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
        <span className="label">{layer === "deep" ? "Reason (typed, for the record)" : "Short reason"}</span>
        <input
          className="input"
          placeholder={layer === "deep" ? "Why does this need the deep reserve?" : "e.g. car repair"}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>

      {/* consequence, shown before commitment */}
      {layer === "deep" && amountOk && newRunway != null && (
        <div className="notice warn mb16">
          This drops your runway from {d.runwayMonths.toFixed(1)} months to{" "}
          {Math.max(0, newRunway).toFixed(1)}. It becomes confirmable in 24
          hours and is reversible until you confirm. Recovery mode will begin
          on confirmation: goals slow to a heartbeat while the reserve refills.
          Your Regular is untouched.
        </div>
      )}
      {layer === "accessible" && amountOk && (
        <div className="notice mb16">
          Refilling begins automatically from future income. Quietly noted.
        </div>
      )}
      {error && <div className="notice block mb16">{error}</div>}

      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-primary" disabled={!amountOk || !reasonOk} onClick={submit}>
          {layer === "deep" ? "Start 24-hour cooldown" : "Withdraw"}
        </button>
        <button className="btn btn-quiet" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}
