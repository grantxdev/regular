/**
 * Cash actions launched from the Console / Money in:
 *   - TakeAllowanceModal: pick a week and draw that week's allowance from the
 *     accessible reserve. Recent weeks show whether they've been taken, so
 *     weekly draws are trackable at a glance.
 *   - AccessibleWithdrawModal: withdraw an arbitrary amount from the accessible
 *     reserve with a "what's it for" label, remembered for reuse.
 *   - AddMoneyModal: enter money you already had (opening balances) straight
 *     into a bucket or goal — no split, since it isn't new income.
 */

import { useMemo, useState } from "react";
import { useStore } from "../store";
import { addDays, fmt, fmtExact, fmtDate, startOfWeek, toISODate } from "../lib/util";
import { Modal } from "./shared";

const WEEKS_SHOWN = 8;

/* ------------------------------------------------------------------ */
/* Weekly allowance — select a week, then withdraw                     */
/* ------------------------------------------------------------------ */

export function TakeAllowanceModal({ onClose }: { onClose: () => void }) {
  const { data, derived: d, apply, actions } = useStore();
  const sym = data.settings.currencySymbol;
  const weekly = data.settings.regularWeekly;

  // Weeks taken so far: ISO Monday → total drawn that week.
  const takenByWeek = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of data.events) {
      if (e.type === "withdrawal" && e.allowance && e.weekOf) {
        m.set(e.weekOf, (m.get(e.weekOf) ?? 0) + e.amount);
      }
    }
    return m;
  }, [data.events]);

  // Current week back through the last several weeks.
  const weeks = useMemo(() => {
    const thisMonday = startOfWeek(new Date());
    return Array.from({ length: WEEKS_SHOWN }, (_, i) => {
      const start = addDays(thisMonday, -7 * i);
      return { iso: toISODate(start), start };
    });
  }, []);

  const take = (weekIso: string) => {
    const err = apply((draft) => actions.takeWeeklyAllowance(draft, weekIso)) as string | null;
    if (err) alert(err);
  };

  return (
    <Modal onClose={onClose}>
      <h2 className="mb8">Weekly allowance</h2>
      <div className="status-line mb16">
        {fmt(weekly, sym)} per week, drawn from the accessible reserve
        ({fmt(d.accessible, sym)} available).
      </div>

      <div className="stack" style={{ gap: 0 }}>
        {weeks.map(({ iso, start }, i) => {
          const takenAmt = takenByWeek.get(iso) ?? 0;
          const taken = takenAmt > 0;
          return (
            <div className="receipt-row" key={iso}>
              <span className="dim">
                {i === 0 ? "This week" : i === 1 ? "Last week" : `Week of ${fmtDate(start)}`}
                {i <= 1 && <span className="faint"> · {fmtDate(start)}</span>}
              </span>
              {taken ? (
                <span className="num green">
                  {fmtExact(takenAmt, sym)} taken
                </span>
              ) : (
                <button
                  className="btn"
                  style={{ padding: "4px 12px" }}
                  disabled={d.accessible <= 0}
                  onClick={() => take(iso)}
                >
                  Take {fmt(weekly, sym)}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt16" style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-quiet" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Accessible withdrawal — amount + what it's for                      */
/* ------------------------------------------------------------------ */

const NEW_CATEGORY = "__new__";

export function AccessibleWithdrawModal({ onClose }: { onClose: () => void }) {
  const { data, derived: d, apply, actions } = useStore();
  const sym = data.settings.currencySymbol;
  const cats = data.withdrawalCategories;
  const [amount, setAmount] = useState("");
  // Pick an existing category from the dropdown, or add a new one.
  const [picked, setPicked] = useState(cats.length > 0 ? cats[0] : NEW_CATEGORY);
  const [newCat, setNewCat] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const category = picked === NEW_CATEGORY ? newCat : picked;
  const v = parseFloat(amount);
  const valid = !isNaN(v) && v > 0 && v <= d.accessible + 0.005 && category.trim().length > 0;

  const submit = () => {
    if (!valid) return;
    const err = apply((draft) =>
      actions.withdrawAccessible(draft, v, category.trim(), note.trim())
    ) as string | null;
    if (err) setError(err);
    else onClose();
  };

  return (
    <Modal onClose={onClose}>
      <h2 className="mb8">Withdraw from accessible</h2>
      <div className="status-line mb16">
        {fmt(d.accessible, sym)} available. Replenished from future income.
      </div>

      <div className="field">
        <span className="label">Amount (max {fmtExact(d.accessible, sym)})</span>
        <input
          className="input"
          type="number"
          min="0"
          step="0.01"
          value={amount}
          autoFocus
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
      </div>

      <div className="field">
        <span className="label">Category</span>
        <select
          className="select"
          value={picked}
          onChange={(e) => setPicked(e.target.value)}
        >
          {cats.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
          <option value={NEW_CATEGORY}>＋ New category…</option>
        </select>
        {picked === NEW_CATEGORY && (
          <input
            className="input mt8"
            placeholder="New category name"
            value={newCat}
            autoFocus
            onChange={(e) => setNewCat(e.target.value)}
          />
        )}
        <span className="field-hint">Saved for next time.</span>
      </div>

      <div className="field">
        <span className="label">Note (optional)</span>
        <input
          className="input"
          placeholder="e.g. to sister"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
      </div>

      {error && <div className="notice block mb16">{error}</div>}

      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-primary" disabled={!valid} onClick={submit}>
          Withdraw
        </button>
        <button className="btn btn-quiet" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Add existing money — opening balances, straight into a bucket/goal   */
/* ------------------------------------------------------------------ */

export function AddMoneyModal({ onClose }: { onClose: () => void }) {
  const { data, derived: d, apply, actions } = useStore();
  const sym = data.settings.currencySymbol;

  // Destinations: the managed buckets, then each active goal.
  const goals = data.goals.filter((g) => g.status === "active");
  const [dest, setDest] = useState("reserve");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const v = parseFloat(amount);
  const valid = !isNaN(v) && v > 0;

  const currentBalance = (() => {
    if (dest === "reserve") return d.reserve;
    if (dest === "regular") return d.regularWallet;
    if (dest === "surplus") return d.surplusHeld;
    const id = dest.startsWith("goal:") ? dest.slice(5) : "";
    return d.goalBalances[id] ?? 0;
  })();

  const submit = () => {
    if (!valid) return;
    const reason = note.trim() || "Opening balance";
    apply((draft) => {
      if (dest.startsWith("goal:")) {
        actions.adjust(draft, "goal", v, reason, dest.slice(5));
      } else {
        actions.adjust(draft, dest as "reserve" | "regular" | "surplus", v, reason);
      }
    });
    onClose();
  };

  return (
    <Modal onClose={onClose}>
      <h2 className="mb8">Add existing money</h2>
      <div className="status-line mb16">
        Money you already had before Regular. It goes straight in — no split,
        no giving — since it isn't new income.
      </div>

      <div className="field">
        <span className="label">Where does it go?</span>
        <select className="select" value={dest} onChange={(e) => setDest(e.target.value)}>
          <option value="reserve">Reserve (savings buffer)</option>
          <option value="regular">Allowance (spending wallet)</option>
          <option value="surplus">Surplus (unassigned)</option>
          {goals.length > 0 && (
            <optgroup label="Goals">
              {goals.map((g) => (
                <option key={g.id} value={`goal:${g.id}`}>
                  {g.name}
                  {g.kind === "provision" ? " (provision)" : ""}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <span className="field-hint">Currently holds {fmt(currentBalance, sym)}.</span>
      </div>

      <div className="field">
        <span className="label">Amount</span>
        <input
          className="input"
          type="number"
          min="0"
          step="0.01"
          value={amount}
          autoFocus
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
      </div>

      <div className="field">
        <span className="label">Note (optional)</span>
        <input
          className="input"
          placeholder="Opening balance"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
      </div>

      <div className="notice mb16">
        Shows up in Where it is under whichever account holds this pool — set
        that on the Assets page.
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-primary" disabled={!valid} onClick={submit}>
          Add
        </button>
        <button className="btn btn-quiet" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}
