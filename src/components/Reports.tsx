/**
 * Reports — the "how am I doing" view. Everything is derived from the ledger:
 * earned over time, money out over time, spending by category, and a few
 * plain performance figures. Calm, factual, no scores or streaks.
 */

import { useMemo } from "react";
import { useStore } from "../store";
import { fmt, fmtExact, parseISO } from "../lib/util";

interface MonthRow {
  key: string;
  label: string;
  earned: number;
  out: number;
}

const monthFmt = new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit" });

export function Reports() {
  const { data, derived: d } = useStore();
  const sym = data.settings.currencySymbol;

  const { months, byCategory, totalEarned, totalOut } = useMemo(() => {
    const earned = new Map<string, number>();
    const out = new Map<string, number>();
    const cats = new Map<string, number>();
    let totalEarned = 0;
    let totalOut = 0;

    const bump = (m: Map<string, number>, key: string, v: number) =>
      m.set(key, (m.get(key) ?? 0) + v);
    const mkey = (iso: string) => iso.slice(0, 7); // YYYY-MM

    for (const e of data.events) {
      const key = mkey(e.date);
      if (e.type === "income") {
        bump(earned, key, e.amount);
        totalEarned += e.amount;
      } else if (e.type === "spend") {
        bump(out, key, e.amount);
        totalOut += e.amount;
      } else if (e.type === "withdrawal" && (e.layer === "accessible" || e.allowance)) {
        // Living outflows: allowance draws and everyday accessible spending.
        bump(out, key, e.amount);
        totalOut += e.amount;
        const label = e.allowance ? "Weekly allowance" : e.category || "Uncategorized";
        bump(cats, label, e.amount);
      } else if (e.type === "provision_paid") {
        bump(out, key, e.amount);
        totalOut += e.amount;
        bump(cats, e.goalName, e.amount);
      }
    }

    // Ordered month rows across the observed range.
    const allKeys = new Set([...earned.keys(), ...out.keys()]);
    const months: MonthRow[] = [...allKeys]
      .sort()
      .slice(-12)
      .map((key) => {
        const [y, m] = key.split("-").map(Number);
        return {
          key,
          label: monthFmt.format(new Date(y, m - 1, 1)),
          earned: earned.get(key) ?? 0,
          out: out.get(key) ?? 0,
        };
      });

    const byCategory = [...cats.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);

    return { months, byCategory, totalEarned, totalOut };
  }, [data.events]);

  const maxBar = Math.max(1, ...months.map((m) => Math.max(m.earned, m.out)));
  const catMax = Math.max(1, ...byCategory.map((c) => c.value));
  const firstNet = d.history[0]?.netWorth ?? d.netWorth;
  const growth = d.netWorth - firstNet;

  return (
    <div className="screen">
      <h1 className="page-title">Reports</h1>
      <p className="page-sub">What you've earned, what's gone out, and how it's tracking.</p>

      {/* performance figures */}
      <div className="grid3">
        <div className="card">
          <div className="label mb8">Total earned</div>
          <div className="big-num green">{fmt(totalEarned, sym)}</div>
          <div className="status-line mt8 faint">across your whole record</div>
        </div>
        <div className="card">
          <div className="label mb8">Net worth growth</div>
          <div className="big-num">{growth >= 0 ? "+" : ""}{fmt(growth, sym)}</div>
          <div className="status-line mt8 faint">since {fmt(firstNet, sym)}</div>
        </div>
        <div className="card">
          <div className="label mb8">Given to date</div>
          <div className="big-num">{fmt(d.givenTotal, sym)}</div>
          <div className="status-line mt8 faint">
            {totalEarned > 0 ? `${Math.round((d.givenTotal / totalEarned) * 100)}% of earnings` : "—"}
          </div>
        </div>
      </div>

      <div className="grid3 mt16">
        <div className="card">
          <div className="label mb8">Avg monthly income</div>
          <div className="big-num">{fmt(d.avgMonthlyIncome, sym)}</div>
          <div className="status-line mt8 faint">trailing 3 months</div>
        </div>
        <div className="card">
          <div className="label mb8">Money out (total)</div>
          <div className="big-num">{fmt(totalOut, sym)}</div>
          <div className="status-line mt8 faint">allowance, spending, bills</div>
        </div>
        <div className="card">
          <div className="label mb8">Kept</div>
          <div className="big-num">
            {totalEarned > 0 ? `${Math.round(((totalEarned - totalOut) / totalEarned) * 100)}%` : "—"}
          </div>
          <div className="status-line mt8 faint">of what you earned</div>
        </div>
      </div>

      {/* earned vs out, by month */}
      <div className="card mt16">
        <div className="label mb16">Earned and out, by month</div>
        {months.length === 0 ? (
          <div className="status-line">Nothing recorded yet.</div>
        ) : (
          <div className="stack" style={{ gap: 14 }}>
            {months.map((m) => (
              <div key={m.key}>
                <div className="row">
                  <span className="status-line">{m.label}</span>
                  <span className="status-line faint">
                    <span className="green">+{fmt(m.earned, sym)}</span> · −{fmt(m.out, sym)}
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 6 }}>
                  <div className="meter"><div style={{ width: `${(m.earned / maxBar) * 100}%` }} /></div>
                  <div className="meter dim"><div style={{ width: `${(m.out / maxBar) * 100}%` }} /></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* spending by category */}
      <div className="card mt16">
        <div className="label mb16">Where it went</div>
        {byCategory.length === 0 ? (
          <div className="status-line">No spending recorded yet.</div>
        ) : (
          <div className="stack" style={{ gap: 12 }}>
            {byCategory.map((c) => (
              <div key={c.label}>
                <div className="row">
                  <span className="status-line">{c.label}</span>
                  <span className="num" style={{ fontSize: 13 }}>{fmtExact(c.value, sym)}</span>
                </div>
                <div className="meter mt8 dim">
                  <div style={{ width: `${(c.value / catMax) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
