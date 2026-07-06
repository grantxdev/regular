/**
 * Console — ten seconds to reassurance. Hero net worth, the three liquidity
 * feelings, this week's Regular, the allocation ring, and a calm goal strip.
 */

import { useState } from "react";
import type { Screen } from "../types";
import { useStore } from "../store";
import { fmt, fmtDate, fmtMonth, plural, parseISO, DAY_MS } from "../lib/util";
import {
  AllocationBar,
  Modal,
  NetWorthChart,
  TickerNumber,
} from "./shared";
import { AccessibleWithdrawModal, TakeAllowanceModal } from "./CashActions";

/** Overdue receivable notices dismiss permanently — a claim is never a nag. */
const DISMISS_KEY = "regular-dismissed-overdue-v1";
function loadDismissed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(DISMISS_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

export function Console({ go }: { go: (s: Screen) => void }) {
  const { data, derived: d, feasibility, apply, actions } = useStore();
  const sym = data.settings.currencySymbol;
  const [dismissed, setDismissed] = useState<Set<string>>(loadDismissed);
  const [takeAllowance, setTakeAllowance] = useState(false);
  const [withdrawAccessible, setWithdrawAccessible] = useState(false);
  const [moneyOut, setMoneyOut] = useState(false);

  const dismiss = (id: string) => {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    localStorage.setItem(DISMISS_KEY, JSON.stringify([...next]));
  };

  // Calm one-liners for claims whose expected date has passed. Dismissible.
  const now = Date.now();
  const overdueReceivables = data.receivables.filter(
    (r) =>
      r.status === "active" &&
      r.expectedDate &&
      parseISO(r.expectedDate).getTime() < now &&
      !dismissed.has(r.id)
  );

  const dueSoon = data.goals.filter(
    (g) =>
      g.status === "active" &&
      g.kind === "provision" &&
      new Date(g.targetDate).getTime() - Date.now() < 7 * 86_400_000
  );

  const reserveSound = d.runwayMonths >= 3;
  const reserveWord = d.inRecovery ? "Rebuilding." : reserveSound ? "Sound." : "Building.";
  // The single calm line of reassurance — shown only when nothing is amiss.
  const allWell =
    !d.inRecovery &&
    reserveSound &&
    overdueReceivables.length === 0 &&
    !feasibility.some((f) => f.state === "wishful");

  return (
    <div className="screen">
      {/* hero */}
      <div className="row" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
        <div>
          <div className="label mb8">Net worth</div>
          <TickerNumber value={d.netWorth} symbol={sym} />
          {d.netWorthIfAllRepaid - d.netWorth >= 1 && (
            <div className="status-line mt8 faint">
              {fmt(d.netWorthIfAllRepaid, sym)} if all debts repaid
            </div>
          )}
          <div className="status-line mt8">
            <span className="green">{fmt(data.settings.regularWeekly, sym)}</span>
            <span className="faint"> weekly allowance</span>
            <span className="faint"> · </span>
            {fmt(d.accessibleIfNeeded, sym)}
            <span className="faint"> accessible if needed</span>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="label mb8">Liquid</div>
          <div className="big-num dim">{fmt(d.liquidWorth, sym)}</div>
        </div>
      </div>

      {/* primary actions */}
      <div className="mt16" style={{ display: "flex", gap: 12 }}>
        <button className="btn btn-primary" onClick={() => go("money-in")}>
          Money in
        </button>
        <button
          className="btn"
          disabled={d.accessible <= 0}
          onClick={() => setMoneyOut(true)}
        >
          Money out
        </button>
      </div>

      <div className="mt16 mb16">
        <NetWorthChart points={d.history} symbol={sym} />
      </div>

      {allWell && (
        <div className="status-line mb24">Everything is where it should be.</div>
      )}

      {d.inRecovery && (
        <div className="notice warn mb16">
          Reserves engaged. Rebuilding has begun. Allocations to objectives are
          reduced; your allowance is unaffected.
        </div>
      )}

      {overdueReceivables.map((r) => {
        const days = Math.round((now - parseISO(r.expectedDate!).getTime()) / DAY_MS);
        const when =
          days <= 0 ? "today" : days < 14 ? `${plural(days, "day")} ago` : `on ${fmtDate(r.expectedDate!)}`;
        return (
          <div className="notice mb16" key={r.id}>
            <div className="row">
              <span>
                {r.person}'s {fmt(d.receivableOutstanding[r.id] ?? r.amount, sym)} was due {when}.
              </span>
              <button className="linklike" onClick={() => dismiss(r.id)}>
                dismiss
              </button>
            </div>
          </div>
        );
      })}

      {/* reserve gauge — red when low, green when full */}
      <div className="card mt16">
        <div className="row">
          <span className="label">Reserve</span>
          <span className="status-line">
            {reserveWord}
            <span className="faint"> {fmt(d.reserve, sym)} of {fmt(d.reserveTarget, sym)}</span>
          </span>
        </div>
        <div className="big-num mt8">
          {d.runwayMonths.toFixed(1)}
          <span className="dim" style={{ fontSize: "0.85rem", fontWeight: 400 }}> months</span>
        </div>
        <div className="gauge mt16">
          <div
            className="gauge-cover"
            style={{
              width: `${100 - Math.min(100, (d.reserve / Math.max(d.reserveTarget, 1)) * 100)}%`,
            }}
          />
        </div>
      </div>

      {/* allocation — one horizontal bar, hover to read */}
      <div className="card mt16">
        <div className="label mb16">Allocation</div>
        <AllocationBar
          symbol={sym}
          slices={[
            { label: "Reserve", value: d.reserve, color: "var(--accent)" },
            { label: "Objectives", value: d.tiedTotal, color: "#5b8fd9" },
            { label: "Provisions", value: d.provisionsTotal, color: "#9aa1ab" },
            {
              label: "Allowance + surplus",
              value: d.regularWallet + d.surplusHeld,
              color: "#5c636d",
            },
            { label: "Holdings", value: d.assetsTotal, color: "#8465c9" },
            { label: "Amounts owed", value: d.receivablesWeighted, color: "#c98a5b" },
          ]}
        />
      </div>

      {/* objectives strip */}
      <div className="card mt16">
        <div className="row mb16">
          <span className="label">Objectives</span>
          <button className="linklike" onClick={() => go("goals")}>
            details
          </button>
        </div>
        {feasibility.length === 0 && (
          <div className="status-line">Nothing requires your attention.</div>
        )}
        <div className="stack" style={{ gap: 14 }}>
          {feasibility.map((f) => (
            <div key={f.goal.id}>
              <div className="row">
                <span style={{ fontSize: 14 }}>{f.goal.name}</span>
                <span className="status-line">
                  {f.state === "funded" && <span className="green">Funded.</span>}
                  {f.state === "on_track" && (
                    <span className="green">
                      On schedule{f.projectedDate ? `. ${fmtMonth(f.projectedDate)}` : ""}
                    </span>
                  )}
                  {f.state === "stretch" && <span className="amber">With discipline</span>}
                  {f.state === "wishful" && <span className="amber">Underfunded</span>}
                </span>
              </div>
              <div className={`meter mt8 ${f.state === "wishful" || f.state === "stretch" ? "warn" : ""}`}>
                <div style={{ width: `${f.progressPct}%` }} />
              </div>
              <div className="status-line mt8 faint">
                {fmt(f.balance, sym)} of {fmt(f.goal.target, sym)} ·{" "}
                {Math.round(f.progressPct)}% · {fmtDate(f.goal.targetDate)}
              </div>
            </div>
          ))}
        </div>
        {dueSoon.length > 0 && (
          <>
            <hr className="hairline" />
            <div className="status-line">
              Due shortly:{" "}
              {dueSoon.map((g) => `${g.name} (${fmtDate(g.targetDate)})`).join(", ")}.
            </div>
          </>
        )}
      </div>

      {moneyOut && (
        <Modal onClose={() => setMoneyOut(false)}>
          <h2 className="mb8">Money out</h2>
          <div className="status-line mb16">
            {fmt(d.accessibleIfNeeded, sym)} accessible.
          </div>
          <div className="stack" style={{ gap: 10 }}>
            <button
              className="btn btn-big"
              onClick={() => {
                setMoneyOut(false);
                setTakeAllowance(true);
              }}
            >
              Take weekly allowance
            </button>
            <button
              className="btn btn-big"
              disabled={d.accessible <= 0}
              onClick={() => {
                setMoneyOut(false);
                setWithdrawAccessible(true);
              }}
            >
              Withdraw from accessible
            </button>
          </div>
          <button className="btn btn-quiet mt16" onClick={() => setMoneyOut(false)}>
            Cancel
          </button>
        </Modal>
      )}
      {takeAllowance && <TakeAllowanceModal onClose={() => setTakeAllowance(false)} />}
      {withdrawAccessible && (
        <AccessibleWithdrawModal onClose={() => setWithdrawAccessible(false)} />
      )}
    </div>
  );
}
