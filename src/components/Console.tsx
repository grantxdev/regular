/**
 * Console — ten seconds to reassurance. Hero net worth, the three liquidity
 * feelings, this week's Regular, the allocation ring, and a calm goal strip.
 */

import type { Screen } from "../types";
import { useStore } from "../store";
import { fmt, fmtDate, fmtMonth, plural, startOfWeek, addDays } from "../lib/util";
import {
  AllocationRing,
  NetWorthChart,
  TickerNumber,
} from "./shared";

export function Console({ go }: { go: (s: Screen) => void }) {
  const { data, derived: d, feasibility } = useStore();
  const sym = data.settings.currencySymbol;

  const weekEnd = addDays(startOfWeek(new Date()), 7);
  const daysLeft = Math.max(
    1,
    Math.ceil((weekEnd.getTime() - Date.now()) / 86_400_000)
  );

  const spentFrac =
    data.settings.regularWeekly > 0
      ? 1 - d.regularRemaining / data.settings.regularWeekly
      : 0;
  const timeFrac = 1 - daysLeft / 7;
  const pace =
    d.regularRemaining <= 0
      ? "done for the week"
      : spentFrac <= timeFrac + 0.1
        ? "cruising"
        : spentFrac <= timeFrac + 0.3
          ? "steady"
          : "tight";

  const dueSoon = data.goals.filter(
    (g) =>
      g.status === "active" &&
      g.kind === "provision" &&
      new Date(g.targetDate).getTime() - Date.now() < 7 * 86_400_000
  );

  return (
    <div className="screen">
      {/* hero */}
      <div className="row" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
        <div>
          <div className="label mb8">Net worth</div>
          <TickerNumber value={d.netWorth} symbol={sym} />
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="label mb8">Liquid</div>
          <div className="big-num dim">{fmt(d.liquidWorth, sym)}</div>
        </div>
      </div>

      <div className="mt16 mb24">
        <NetWorthChart points={d.history} symbol={sym} />
      </div>

      {d.inRecovery && (
        <div className="notice warn mb16">
          Recovery mode. The reserve is refilling from future income; goals keep
          a heartbeat; your Regular is untouched.
        </div>
      )}

      {/* the three feelings */}
      <div className="grid3">
        <div className="card">
          <div className="label mb8">Available today</div>
          <div className="big-num green">{fmt(d.availableToday, sym)}</div>
          <div className="status-line mt8">
            Regular remaining{d.surplusHeld > 0 ? " + unassigned surplus" : ""}. Spend freely.
          </div>
        </div>
        <div className="card">
          <div className="label mb8">Accessible if needed</div>
          <div className="big-num">{fmt(d.accessibleIfNeeded, sym)}</div>
          <div className="status-line mt8">The "life happens" door. One tap away.</div>
        </div>
        <div className="card">
          <div className="label mb8">Protected</div>
          <div className="big-num">{fmt(d.protectedTotal, sym)}</div>
          <div className="status-line mt8">
            Deep reserve, provisions, and everything working long-term.
          </div>
        </div>
      </div>

      {/* week + reserve status */}
      <div className="grid2 mt16">
        <div className="card">
          <div className="row">
            <span className="label">This week's Regular</span>
            <span className="status-line">{plural(daysLeft, "day")} left</span>
          </div>
          <div className="big-num mt8">
            {fmt(d.regularRemaining, sym)}
            <span className="dim" style={{ fontSize: "0.85rem", fontWeight: 400 }}>
              {" "}/ {fmt(data.settings.regularWeekly, sym)}
            </span>
          </div>
          <div className="meter mt8">
            <div
              style={{
                width: `${Math.max(0, Math.min(100, (d.regularRemaining / Math.max(data.settings.regularWeekly, 1)) * 100))}%`,
              }}
            />
          </div>
          <div className="status-line mt8">
            {fmt(d.regularRemaining, sym)} left, {plural(daysLeft, "day")} — {pace}.
          </div>
        </div>

        <div className="card">
          <div className="label mb8">Reserve</div>
          <div className="big-num">
            {d.runwayMonths.toFixed(1)}
            <span className="dim" style={{ fontSize: "0.85rem", fontWeight: 400 }}> months runway</span>
          </div>
          <div className="meter mt8">
            <div
              style={{
                width: `${Math.min(100, (d.reserve / Math.max(d.reserveTarget, 1)) * 100)}%`,
              }}
            />
          </div>
          <div className="status-line mt8">
            {fmt(d.reserve, sym)} of {fmt(d.reserveTarget, sym)} target.{" "}
            {d.reserve >= d.reserveTarget
              ? "Full. Nominal."
              : d.inRecovery
                ? "Refilling."
                : "Filling. Nominal."}
          </div>
        </div>
      </div>

      {/* allocation ring */}
      <div className="card mt16">
        <div className="label mb16">Allocation</div>
        <AllocationRing
          symbol={sym}
          slices={[
            { label: "Reserve", value: d.reserve, color: "var(--accent)" },
            { label: "Goals (tied)", value: d.tiedTotal, color: "#5b8fd9" },
            { label: "Provisions", value: d.provisionsTotal, color: "#9aa1ab" },
            {
              label: "Regular + surplus",
              value: d.regularWallet + d.surplusHeld,
              color: "#5c636d",
            },
            { label: "Outside assets", value: d.assetsTotal, color: "#8465c9" },
          ]}
        />
      </div>

      {/* goal strip */}
      <div className="card mt16">
        <div className="row mb16">
          <span className="label">Goals</span>
          <button className="linklike" onClick={() => go("goals")}>
            details
          </button>
        </div>
        {feasibility.length === 0 && (
          <div className="status-line">No accumulating goals yet. Add one under Goals.</div>
        )}
        <div className="stack" style={{ gap: 14 }}>
          {feasibility.map((f) => (
            <div key={f.goal.id}>
              <div className="row">
                <span style={{ fontSize: 14 }}>{f.goal.name}</span>
                <span className="status-line">
                  {f.state === "funded" && <span className="green">funded</span>}
                  {f.state === "on_track" && (
                    <span className="green">
                      on track
                      {f.projectedDate ? `, ${fmtMonth(f.projectedDate)}` : ""}
                    </span>
                  )}
                  {f.state === "stretch" && <span className="amber">stretch</span>}
                  {f.state === "wishful" && <span className="amber">wishful — see Goals</span>}
                </span>
              </div>
              <div className={`meter mt8 ${f.state === "wishful" || f.state === "stretch" ? "warn" : ""}`}>
                <div style={{ width: `${f.progressPct}%` }} />
              </div>
              <div className="status-line mt8 faint">
                {fmt(f.balance, sym)} of {fmt(f.goal.target, sym)} ·{" "}
                {Math.round(f.progressPct)}% · target {fmtDate(f.goal.targetDate)}
              </div>
            </div>
          ))}
        </div>
        {dueSoon.length > 0 && (
          <>
            <hr className="hairline" />
            <div className="status-line">
              Due soon:{" "}
              {dueSoon.map((g) => `${g.name} (${fmtDate(g.targetDate)})`).join(", ")} — see Goals.
            </div>
          </>
        )}
      </div>

      <div className="mt24" style={{ display: "flex", gap: 12 }}>
        <button className="btn btn-primary btn-big" onClick={() => go("money-in")}>
          Money in
        </button>
        <button className="btn btn-big" onClick={() => go("vault")}>
          Vault
        </button>
      </div>
    </div>
  );
}
