/**
 * Ledger — the audit trail and the "what have I achieved" story. Read-only,
 * searchable, exportable. Includes derived week-end sweeps (marked auto) so
 * the record matches the balances exactly.
 */

import { useMemo, useState } from "react";
import { useStore } from "../store";
import type { IncomeEvent, LedgerEvent } from "../types";
import { fmtExact, fmtDate, parseISO } from "../lib/util";
import { Modal, SplitReceipt } from "./shared";

interface Row {
  key: string;
  date: Date;
  kind: string;
  detail: string;
  amount: number | null; // signed for display; null = informational
  event?: LedgerEvent;
}

export function Ledger() {
  const { data, derived: d, exportData } = useStore();
  const sym = data.settings.currencySymbol;
  const [query, setQuery] = useState("");
  const [receipt, setReceipt] = useState<IncomeEvent | null>(null);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const e of data.events) {
      const date = parseISO(e.date);
      switch (e.type) {
        case "income":
          out.push({
            key: e.id, date, kind: "income",
            detail: `${e.source} — split across ${e.split.goals.length} goal${e.split.goals.length === 1 ? "" : "s"}, giving ${fmtExact(e.split.giving, sym)}`,
            amount: e.amount, event: e,
          });
          break;
        case "spend":
          out.push({ key: e.id, date, kind: "spend", detail: "Regular spend", amount: -e.amount });
          break;
        case "withdrawal":
          out.push({
            key: e.id, date, kind: `withdrawal · ${e.layer}`,
            detail: `"${e.reason}"${e.goalName ? ` — ${e.goalName}` : ""}`,
            amount: -e.amount,
          });
          break;
        case "provision_paid":
          out.push({ key: e.id, date, kind: "provision paid", detail: e.goalName, amount: -e.amount });
          break;
        case "adjustment":
          out.push({
            key: e.id, date, kind: "adjustment",
            detail: `${e.target}${e.goalName ? ` · ${e.goalName}` : ""} — "${e.reason}"`,
            amount: e.amount,
          });
          break;
        case "recovery":
          out.push({
            key: e.id, date, kind: "recovery",
            detail: e.direction === "enter"
              ? "Recovery mode began — reserve refill prioritized, Regular untouched"
              : "Your storehouse is full again. Goal contributions restored.",
            amount: null,
          });
          break;
        case "asset":
          out.push({
            key: e.id, date, kind: `asset ${e.action}`,
            detail: `${e.name} at ${fmtExact(e.value, sym)}${e.reason ? ` — "${e.reason}"` : ""}`,
            amount: null,
          });
          break;
      }
    }
    for (const s of d.sweeps) {
      out.push({
        key: `sweep-${s.date}`,
        date: new Date(s.date),
        kind: "sweep · auto",
        detail: `Unspent Regular → ${s.toGoalName}`,
        amount: s.amount,
      });
    }
    out.sort((a, b) => b.date.getTime() - a.date.getTime());
    return out;
  }, [data.events, d.sweeps, sym]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.kind.toLowerCase().includes(q) || r.detail.toLowerCase().includes(q)
    );
  }, [rows, query]);

  return (
    <div className="screen">
      <h1 className="page-title">Ledger</h1>
      <p className="page-sub">
        Every event, on the record. {rows.length} entries ·{" "}
        {fmtExact(d.givenTotal, sym)} given to date.
      </p>

      <div className="row mb16" style={{ alignItems: "center" }}>
        <input
          className="input"
          style={{ maxWidth: 340 }}
          placeholder="Search the record…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="btn" onClick={exportData}>
          Export JSON
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="ledger-table">
          <thead>
            <tr>
              <th style={{ width: 110 }}>Date</th>
              <th style={{ width: 150 }}>Event</th>
              <th>Detail</th>
              <th style={{ width: 110, textAlign: "right" }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr
                key={r.key}
                style={r.event?.type === "income" ? { cursor: "pointer" } : undefined}
                onClick={() => {
                  if (r.event?.type === "income") setReceipt(r.event);
                }}
              >
                <td className="mono faint" style={{ whiteSpace: "nowrap", fontSize: 12 }}>
                  {fmtDate(r.date)}
                </td>
                <td className="mono dim" style={{ fontSize: 12 }}>{r.kind}</td>
                <td className="dim">{r.detail}</td>
                <td className="num-cell">
                  {r.amount == null ? (
                    <span className="faint">—</span>
                  ) : r.amount >= 0 ? (
                    <span className="green">+{fmtExact(r.amount, sym)}</span>
                  ) : (
                    fmtExact(r.amount, sym)
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="faint" style={{ textAlign: "center", padding: 24 }}>
                  Nothing matches.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {receipt && (
        <Modal onClose={() => setReceipt(null)}>
          <div className="label mb8">
            {fmtDate(receipt.date)} · {receipt.source}
          </div>
          <SplitReceipt amount={receipt.amount} split={receipt.split} symbol={sym} />
          <button className="btn btn-quiet mt16" onClick={() => setReceipt(null)}>
            Close
          </button>
        </Modal>
      )}
    </div>
  );
}
