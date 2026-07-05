/**
 * Goals — both species. Accumulating goals get the feasibility meter and the
 * required-income inversion; provisions get due dates, one-tap "paid", and
 * auto-renewal for recurring ones.
 */

import { useState } from "react";
import { useStore } from "../store";
import type { Goal, GoalKind, Recurrence } from "../types";
import { daysUntilDue } from "../engine/feasibility";
import { fmt, fmtDate, fmtMonth, plural, toISODate, addMonths } from "../lib/util";
import { Modal } from "./shared";

export function Goals() {
  const { data, derived: d, feasibility, apply, actions } = useStore();
  const sym = data.settings.currencySymbol;
  const [adding, setAdding] = useState<GoalKind | null>(null);
  const [editing, setEditing] = useState<Goal | null>(null);

  const provisions = data.goals
    .filter((g) => g.status === "active" && g.kind === "provision")
    .sort((a, b) => a.targetDate.localeCompare(b.targetDate));

  return (
    <div className="screen">
      <h1 className="page-title">Goals</h1>
      <p className="page-sub">
        Objectives accumulate as committed worth. Provisions hold funds already
        assigned against known obligations.
      </p>

      {/* -------- accumulating -------- */}
      <div className="row mb16">
        <h2>Objectives</h2>
        <button className="btn" onClick={() => setAdding("accumulating")}>
          Add objective
        </button>
      </div>

      {feasibility.length === 0 && (
        <div className="card status-line">Nothing requires your attention.</div>
      )}

      {feasibility.map((f) => (
        <div className="card" key={f.goal.id}>
          <div className="row">
            <h2>{f.goal.name}</h2>
            <span>
              {f.state === "funded" && <span className="chip ok">Funded</span>}
              {f.state === "on_track" && <span className="chip ok">On schedule</span>}
              {f.state === "stretch" && <span className="chip warn">With discipline</span>}
              {f.state === "wishful" && <span className="chip warn">Underfunded</span>}
            </span>
          </div>

          <div className={`meter mt16 ${f.state === "on_track" || f.state === "funded" ? "" : "warn"}`}>
            <div style={{ width: `${f.progressPct}%` }} />
          </div>

          <div className="row mt8">
            <span className="status-line">
              {fmt(f.balance, sym)} of {fmt(f.goal.target, sym)} ·{" "}
              {Math.round(f.progressPct)}%
            </span>
            <span className="status-line">{fmtDate(f.goal.targetDate)}</span>
          </div>

          <hr className="hairline" />

          {f.state === "funded" && (
            <div className="status-line green">Funded.</div>
          )}

          {f.state === "on_track" && (
            <div className="status-line">
              Funded on schedule. Requires {fmt(f.requiredMonthly, sym)} monthly;
              {" "}{fmt(f.expectedWithSurplus, sym)} provided.
              {f.projectedDate && <> Completion {fmtMonth(f.projectedDate)}.</>}
            </div>
          )}

          {f.state === "stretch" && (
            <div className="status-line amber">
              Achievable with discipline. Base allocation {fmt(f.expectedMonthly, sym)}
              {" "}of {fmt(f.requiredMonthly, sym)} monthly; surplus covers the
              balance at current income.
              {f.projectedDate && <> Completion {fmtMonth(f.projectedDate)}.</>}
            </div>
          )}

          {f.state === "wishful" && (
            <div className="status-line amber">
              Underfunded.{" "}
              {f.neededMonthlyIncome != null && d.avgMonthlyIncome > 0 && (
                <>
                  Funding {f.goal.name} by {fmtMonth(f.goal.targetDate)} requires{" "}
                  {fmt(f.neededMonthlyIncome, sym)} monthly — {" "}
                  {fmt(f.neededMonthlyIncome - d.avgMonthlyIncome, sym)} above
                  your three-month average.{" "}
                </>
              )}
              {f.achievableDate && (
                <>Alternatively, {fmtMonth(f.achievableDate)}.</>
              )}
            </div>
          )}

          <div className="mt16" style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-quiet" onClick={() => setEditing(f.goal)}>
              Edit
            </button>
          </div>
        </div>
      ))}

      {/* -------- provisions -------- */}
      <div className="row mb16 mt24">
        <h2>Provisions</h2>
        <button className="btn" onClick={() => setAdding("provision")}>
          Add provision
        </button>
      </div>

      {provisions.length === 0 && (
        <div className="card status-line">Nothing requires your attention.</div>
      )}

      {provisions.map((g) => {
        const bal = d.goalBalances[g.id] ?? 0;
        const days = daysUntilDue(g);
        const funded = bal >= g.target - 0.005;
        return (
          <div className="card" key={g.id}>
            <div className="row">
              <h2>
                {g.name}
                {g.recurrence && (
                  <span className="faint" style={{ fontSize: 12, fontWeight: 400 }}>
                    {" "}· renews {g.recurrence}
                  </span>
                )}
              </h2>
              <span className="status-line">
                {days < 0
                  ? `Due ${fmtDate(g.targetDate)}. Overdue.`
                  : days === 0
                    ? "Due today."
                    : `Due ${fmtDate(g.targetDate)} · ${plural(days, "day")}`}
              </span>
            </div>
            <div className={`meter mt8 ${funded ? "" : "dim"}`}>
              <div style={{ width: `${Math.min(100, (bal / Math.max(g.target, 1)) * 100)}%` }} />
            </div>
            <div className="row mt8">
              <span className="status-line">
                {fmt(bal, sym)} of {fmt(g.target, sym)} held
                {funded ? ". Ready." : ""}
              </span>
              <span style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-quiet" onClick={() => setEditing(g)}>
                  Edit
                </button>
                <button
                  className="btn"
                  disabled={bal <= 0}
                  onClick={() => {
                    const err = apply((draft) =>
                      actions.payProvision(draft, g.id)
                    ) as string | null;
                    if (err) alert(err);
                  }}
                >
                  Settle
                </button>
              </span>
            </div>
          </div>
        );
      })}

      {adding && (
        <GoalForm
          kind={adding}
          onClose={() => setAdding(null)}
          onSave={(input) => {
            apply((draft) => actions.addGoal(draft, input));
            setAdding(null);
          }}
        />
      )}
      {editing && (
        <GoalForm
          kind={editing.kind}
          existing={editing}
          onClose={() => setEditing(null)}
          onSave={(input) => {
            apply((draft) => {
              const g = draft.goals.find((x) => x.id === editing.id);
              if (g) {
                g.name = input.name;
                g.target = input.target;
                g.targetDate = input.targetDate;
                g.recurrence = input.recurrence ?? null;
                if (input.priority) g.priority = input.priority;
                if (input.archive) g.status = "done";
              }
            });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

interface GoalInput {
  kind: GoalKind;
  name: string;
  target: number;
  targetDate: string;
  recurrence?: Recurrence | null;
  priority?: number;
  archive?: boolean;
}

function GoalForm({
  kind,
  existing,
  onClose,
  onSave,
}: {
  kind: GoalKind;
  existing?: Goal;
  onClose: () => void;
  onSave: (g: GoalInput) => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [target, setTarget] = useState(existing ? String(existing.target) : "");
  const [date, setDate] = useState(
    existing?.targetDate ?? toISODate(addMonths(new Date(), kind === "provision" ? 1 : 12))
  );
  const [recurrence, setRecurrence] = useState<Recurrence | "">(
    existing?.recurrence ?? ""
  );
  const [priority, setPriority] = useState(existing ? String(existing.priority) : "");

  const t = parseFloat(target);
  const valid = name.trim().length > 0 && !isNaN(t) && t > 0 && date;

  return (
    <Modal onClose={onClose}>
      <h2 className="mb16">
        {existing ? "Edit" : "New"} {kind === "provision" ? "provision" : "goal"}
      </h2>
      <div className="field">
        <span className="label">Name</span>
        <input className="input" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="form-row">
        <div className="field">
          <span className="label">{kind === "provision" ? "Amount due" : "Target amount"}</span>
          <input
            className="input"
            type="number"
            min="0"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </div>
        <div className="field">
          <span className="label">{kind === "provision" ? "Due date" : "Target date"}</span>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      {kind === "provision" && (
        <div className="field">
          <span className="label">Recurrence</span>
          <select
            className="select"
            value={recurrence}
            onChange={(e) => setRecurrence(e.target.value as Recurrence | "")}
          >
            <option value="">One-time</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>
      )}
      {existing && kind === "accumulating" && (
        <div className="field">
          <span className="label">Priority (1 = top; top goal receives surplus)</span>
          <input
            className="input"
            type="number"
            min="1"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          />
        </div>
      )}
      <div className="mt16" style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
        <span style={{ display: "flex", gap: 8 }}>
          <button
            className="btn btn-primary"
            disabled={!valid}
            onClick={() =>
              onSave({
                kind,
                name: name.trim(),
                target: t,
                targetDate: date,
                recurrence: recurrence === "" ? null : recurrence,
                priority: priority ? parseInt(priority, 10) : undefined,
              })
            }
          >
            Save
          </button>
          <button className="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
        </span>
        {existing && (
          <button
            className="btn btn-danger"
            onClick={() => {
              if (confirm(`Archive "${existing.name}"? Its balance stays in your history.`)) {
                onSave({
                  kind,
                  name: name.trim(),
                  target: t || existing.target,
                  targetDate: date,
                  recurrence: recurrence === "" ? null : recurrence,
                  archive: true,
                });
              }
            }}
          >
            Archive
          </button>
        )}
      </div>
    </Modal>
  );
}
