/**
 * Money In — the only required interaction. Amount + source + date, under ten
 * seconds, then a clean receipt of the split. Also hosts the optional spend
 * game button so a quick "I spent $12" lives one tap from the money flow.
 */

import { useMemo, useState } from "react";
import { useStore } from "../store";
import type { IncomeEvent } from "../types";
import { computeSplit } from "../engine/split";
import { fmtExact, toISODate, parseISO } from "../lib/util";
import { SplitReceipt } from "./shared";

export function MoneyIn() {
  const { data, derived, apply, actions } = useStore();
  const sym = data.settings.currencySymbol;

  const [amount, setAmount] = useState("");
  const [source, setSource] = useState(data.incomeSources[0] ?? "");
  const [date, setDate] = useState(toISODate(new Date()));
  const [receipt, setReceipt] = useState<IncomeEvent | null>(null);

  const [spend, setSpend] = useState("");
  const [spendFlash, setSpendFlash] = useState<string | null>(null);

  const parsed = parseFloat(amount);
  const valid = !isNaN(parsed) && parsed > 0 && source.trim().length > 0;

  /* Live preview of the split as the amount is typed — see the rules work. */
  const preview = useMemo(() => {
    if (isNaN(parsed) || parsed <= 0) return null;
    return computeSplit(parsed, data.settings, data.goals, derived, new Date());
  }, [parsed, data.settings, data.goals, derived]);

  const submit = () => {
    if (!valid) return;
    const when = parseISO(date);
    // Keep today's real time on today's entries so ordering stays natural.
    if (toISODate(new Date()) === date) {
      const now = new Date();
      when.setHours(now.getHours(), now.getMinutes(), now.getSeconds());
    } else {
      when.setHours(12, 0, 0, 0);
    }
    const event = apply((draft) =>
      actions.logIncome(draft, parsed, source, when)
    ) as IncomeEvent;
    setReceipt(event);
    setAmount("");
  };

  const submitSpend = () => {
    const v = parseFloat(spend);
    if (isNaN(v) || v <= 0) return;
    apply((draft) => actions.logSpend(draft, v));
    setSpend("");
    setSpendFlash("Recorded.");
    setTimeout(() => setSpendFlash(null), 2500);
  };

  return (
    <div className="screen">
      <h1 className="page-title">Money in</h1>
      <p className="page-sub">Record it. The allocation follows.</p>

      <div className="grid2">
        <div className="card">
          <div className="field">
            <span className="label">Amount</span>
            <input
              className="input huge"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={amount}
              autoFocus
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>
          <div className="field">
            <span className="label">Source</span>
            <input
              className="input"
              list="income-sources"
              placeholder="e.g. Design retainer"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
            <datalist id="income-sources">
              {data.incomeSources.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            {data.incomeSources.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                {data.incomeSources.slice(0, 6).map((s) => (
                  <button
                    key={s}
                    className="chip"
                    style={{ cursor: "pointer", background: "none" }}
                    onClick={() => setSource(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="field">
            <span className="label">Date</span>
            <input
              className="input"
              type="date"
              value={date}
              max={toISODate(new Date())}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <button className="btn btn-primary btn-big" disabled={!valid} onClick={submit}>
            Record
          </button>
        </div>

        <div>
          {receipt ? (
            <>
              <div className="label mb8">Received · {receipt.source}</div>
              <SplitReceipt amount={receipt.amount} split={receipt.split} symbol={sym} />
              <button className="btn btn-quiet mt8" onClick={() => setReceipt(null)}>
                Dismiss
              </button>
            </>
          ) : preview ? (
            <>
              <div className="label mb8">Provisional allocation</div>
              <SplitReceipt amount={parsed} split={preview} symbol={sym} />
            </>
          ) : (
            <div className="card" style={{ color: "var(--text-dim)", fontSize: 13.5 }}>
              Enter an amount. The allocation appears here.
            </div>
          )}
        </div>
      </div>

      {/* optional discretionary log */}
      <div className="card mt24">
        <div className="row">
          <span className="label">Discretionary spending (optional)</span>
          {spendFlash && <span className="status-line green">{spendFlash}</span>}
        </div>
        <div className="form-row mt8" style={{ maxWidth: 380 }}>
          <input
            className="input"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            placeholder="Amount spent"
            value={spend}
            onChange={(e) => setSpend(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitSpend()}
          />
          <button className="btn" style={{ flex: "0 0 auto" }} onClick={submitSpend}>
            Record
          </button>
        </div>
        <div className="status-line mt8">
          Optional. The weekly figure resets each week.
        </div>
      </div>
    </div>
  );
}
