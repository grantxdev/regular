/**
 * Receivables — money owed to me, rendered as a section within Assets. A
 * receivable is a claim, never cash: it never appears in the liquidity
 * numbers, only in net worth (at a confidence-weighted haircut).
 *
 * Actions: record a claim, lend money (cash → receivable, with full vault
 * friction when funded from the reserve), mark repaid (money returns through
 * the Split), and a dignified write-off.
 */

import { useState } from "react";
import { useStore } from "../store";
import type { Confidence, LendLayer, Receivable } from "../types";
import { confidenceWeight } from "../engine/replay";
import { fmt, fmtExact, fmtDate, plural, parseISO, toISODate } from "../lib/util";
import { Modal } from "./shared";

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  certain: "certain",
  likely: "likely",
  hopeful: "hopeful",
};

export function Receivables() {
  const { data, derived: d } = useStore();
  const sym = data.settings.currencySymbol;
  const [lending, setLending] = useState(false);
  const [adding, setAdding] = useState(false);
  const [repaying, setRepaying] = useState<Receivable | null>(null);
  const [writingOff, setWritingOff] = useState<Receivable | null>(null);
  const [editing, setEditing] = useState<Receivable | null>(null);

  const active = data.receivables.filter((r) => r.status === "active");
  const now = new Date();

  return (
    <div>
      <div className="row mt24 mb16">
        <div>
          <h2>Receivables</h2>
          <div className="status-line faint">Amounts owed to you. Counted as claims, not cash.</div>
        </div>
        <span style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => setAdding(true)}>
            Record a claim
          </button>
          <button className="btn" onClick={() => setLending(true)}>
            Lend money
          </button>
        </span>
      </div>

      {active.length === 0 && (
        <div className="card status-line">Nothing requires your attention.</div>
      )}

      {d.receivablesFullValue > 0 && (
        <div className="card">
          <div className="row">
            <span className="label">Claims outstanding</span>
            <span className="num dim">{fmt(d.receivablesFullValue, sym)}</span>
          </div>
          <div className="row mt8">
            <span className="status-line">Counted in net worth, confidence-weighted</span>
            <span className="num green">{fmt(d.receivablesWeighted, sym)}</span>
          </div>
          <div className="status-line faint mt8">
            Excluded from available, accessible, and runway figures.
          </div>
        </div>
      )}

      {active.map((r) => {
        const outstanding = d.receivableOutstanding[r.id] ?? 0;
        const weight = confidenceWeight(r.confidence, data.settings);
        const overdue =
          r.expectedDate && parseISO(r.expectedDate).getTime() < now.getTime();
        return (
          <div className="card" key={r.id}>
            <div className="row">
              <h2>
                {r.person}
                <span className="faint" style={{ fontSize: 12, fontWeight: 400 }}>
                  {" "}owes you
                </span>
              </h2>
              <span className={`chip ${r.confidence === "certain" ? "ok" : "warn"}`}>
                {CONFIDENCE_LABEL[r.confidence]} · {Math.round(weight * 100)}%
              </span>
            </div>
            <div className="row mt8">
              <span className="big-num dim">{fmt(outstanding, sym)}</span>
              <span className="status-line">
                {r.expectedDate ? (
                  overdue ? (
                    <span className="amber">due {fmtDate(r.expectedDate)}</span>
                  ) : (
                    <>due {fmtDate(r.expectedDate)}</>
                  )
                ) : (
                  <span className="faint">no date</span>
                )}
              </span>
            </div>
            <div className="status-line faint mt8">
              Counts {fmt(outstanding * weight, sym)} toward net worth.
              {r.note ? ` — ${r.note}` : ""}
            </div>
            <div className="mt16" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn" onClick={() => setRepaying(r)}>
                Repaid
              </button>
              <button className="btn btn-quiet" onClick={() => setEditing(r)}>
                Edit
              </button>
              <button className="btn btn-quiet" onClick={() => setWritingOff(r)}>
                Write off
              </button>
            </div>
          </div>
        );
      })}

      {lending && <LendDialog onClose={() => setLending(false)} />}
      {adding && <ClaimDialog onClose={() => setAdding(false)} />}
      {editing && <ClaimDialog existing={editing} onClose={() => setEditing(null)} />}
      {repaying && <RepayDialog receivable={repaying} onClose={() => setRepaying(null)} />}
      {writingOff && <WriteOffDialog receivable={writingOff} onClose={() => setWritingOff(null)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Record a plain claim (no cash movement) — also used for Edit        */
/* ------------------------------------------------------------------ */

function ClaimDialog({
  existing,
  onClose,
}: {
  existing?: Receivable;
  onClose: () => void;
}) {
  const { apply, actions } = useStore();
  const [person, setPerson] = useState(existing?.person ?? "");
  const [amount, setAmount] = useState(existing ? String(existing.amount) : "");
  const [date, setDate] = useState(existing?.expectedDate ?? "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [confidence, setConfidence] = useState<Confidence>(existing?.confidence ?? "likely");

  const v = parseFloat(amount);
  const valid = person.trim().length > 0 && !isNaN(v) && v > 0;

  const save = () => {
    if (!valid) return;
    if (existing) {
      apply((draft) => {
        const rec = draft.receivables.find((r) => r.id === existing.id);
        if (rec) {
          rec.person = person.trim();
          rec.amount = v;
          rec.expectedDate = date || null;
          rec.note = note.trim();
          rec.confidence = confidence;
        }
      });
    } else {
      apply((draft) =>
        actions.addReceivable(draft, {
          person,
          amount: v,
          expectedDate: date || null,
          note,
          confidence,
        })
      );
    }
    onClose();
  };

  return (
    <Modal onClose={onClose}>
      <h2 className="mb16">{existing ? "Edit receivable" : "Record a claim"}</h2>
      {!existing && (
        <div className="notice mb16">
          An existing debt. No funds move; it enters net worth at its confidence
          weight.
        </div>
      )}
      <ClaimFields
        person={person} setPerson={setPerson}
        amount={amount} setAmount={setAmount}
        date={date} setDate={setDate}
        note={note} setNote={setNote}
        confidence={confidence} setConfidence={setConfidence}
        amountLabel="Amount owed"
      />
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-primary" disabled={!valid} onClick={save}>
          Save
        </button>
        <button className="btn btn-quiet" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Lend money — cash into a receivable, with vault friction            */
/* ------------------------------------------------------------------ */

const LAYER_LABELS: { value: LendLayer; label: string }[] = [
  { value: "surplus", label: "Unassigned surplus" },
  { value: "regular", label: "Regular wallet" },
  { value: "accessible", label: "Accessible reserve" },
  { value: "deep", label: "Deep reserve (24h cooldown)" },
  { value: "goal", label: "A goal balance" },
];

function LendDialog({ onClose }: { onClose: () => void }) {
  const { data, derived: d, apply, actions } = useStore();
  const sym = data.settings.currencySymbol;
  const s = data.settings;

  const [person, setPerson] = useState("");
  const [amount, setAmount] = useState("");
  const [layer, setLayer] = useState<LendLayer>("surplus");
  const [goalId, setGoalId] = useState(
    data.goals.find((g) => g.status === "active")?.id ?? ""
  );
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [confidence, setConfidence] = useState<Confidence>("certain");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingDone, setPendingDone] = useState(false);

  const available = actions.lendableFrom(data, layer, goalId || undefined, new Date());
  const v = parseFloat(amount);
  const amountOk = !isNaN(v) && v > 0 && v <= available + 0.005;
  const fromReserve = layer === "accessible" || layer === "deep";
  // Reserve loans need a reason; deep loans always do.
  const reasonOk = fromReserve ? reason.trim().length >= 3 : reason.trim().length >= 1;
  const valid = person.trim().length > 0 && amountOk && reasonOk && (layer !== "goal" || goalId);

  const newRunway = fromReserve && amountOk ? (d.reserve - v) / Math.max(s.livingExpensesMonthly, 1) : null;

  const submit = () => {
    if (!valid) return;
    const res = apply((draft) =>
      actions.lendMoney(draft, {
        person, amount: v, layer,
        goalId: layer === "goal" ? goalId : undefined,
        expectedDate: date || null, note, confidence, reason,
      })
    ) as { error?: string; pending?: boolean };
    if (res.error) setError(res.error);
    else if (res.pending) setPendingDone(true);
    else onClose();
  };

  if (pendingDone) {
    return (
      <Modal onClose={onClose}>
        <h2 className="mb16">Held for confirmation</h2>
        <div className="notice warn mb16">
          Lending from principal settles tomorrow. Confirm it from the Vault;
          reversible until then. Net worth holds when it settles — the funds
          become a claim of equal value.
        </div>
        <button className="btn btn-primary" onClick={onClose}>
          Understood
        </button>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="mb16">Lend money</h2>
      <div className="status-line mb16">
        The amount leaves the chosen layer and becomes a claim. Net worth holds;
        liquidity falls.
      </div>

      <div className="field">
        <span className="label">Fund it from</span>
        <select className="select" value={layer} onChange={(e) => setLayer(e.target.value as LendLayer)}>
          {LAYER_LABELS.map((l) => (
            <option key={l.value} value={l.value}>{l.label}</option>
          ))}
        </select>
        {layer === "goal" && (
          <select className="select mt8" value={goalId} onChange={(e) => setGoalId(e.target.value)}>
            {data.goals.filter((g) => g.status === "active").map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        )}
        <span className="field-hint">Available here: {fmt(available, sym)}</span>
      </div>

      <ClaimFields
        person={person} setPerson={setPerson}
        amount={amount} setAmount={setAmount}
        date={date} setDate={setDate}
        note={note} setNote={setNote}
        confidence={confidence} setConfidence={setConfidence}
        amountLabel="Amount to lend"
      />

      {fromReserve && (
        <div className="field">
          <span className="label">Reason (for the record)</span>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      )}
      {!fromReserve && (
        <div className="field">
          <span className="label">Reason (optional)</span>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      )}

      {/* runway consequence, shown before commitment */}
      {fromReserve && amountOk && newRunway != null && (
        <div className="notice warn mb16">
          This draws on the reserve. Runway falls from {d.runwayMonths.toFixed(1)} to {Math.max(0, newRunway).toFixed(1)} months.
          {layer === "deep" && <> Confirm tomorrow. The floor still applies.</>}
        </div>
      )}
      {error && <div className="notice block mb16">{error}</div>}

      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-primary" disabled={!valid} onClick={submit}>
          {layer === "deep" ? "Confirm tomorrow" : "Lend"}
        </button>
        <button className="btn btn-quiet" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Repay (full or partial)                                             */
/* ------------------------------------------------------------------ */

function RepayDialog({ receivable, onClose }: { receivable: Receivable; onClose: () => void }) {
  const { data, derived: d, apply, actions } = useStore();
  const sym = data.settings.currencySymbol;
  const outstanding = d.receivableOutstanding[receivable.id] ?? receivable.amount;
  const [amount, setAmount] = useState(String(Math.round(outstanding)));
  const v = parseFloat(amount);
  const valid = !isNaN(v) && v > 0;

  return (
    <Modal onClose={onClose}>
      <h2 className="mb16">{receivable.person} repaid</h2>
      <div className="notice mb16">
        Received through the standard allocation, as with any income.
      </div>
      <div className="field">
        <span className="label">Amount repaid (outstanding {fmtExact(outstanding, sym)})</span>
        <input
          className="input"
          type="number"
          min="0"
          step="0.01"
          value={amount}
          autoFocus
          onChange={(e) => setAmount(e.target.value)}
        />
        <span className="field-hint">Partial amounts reduce the claim accordingly.</span>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="btn btn-primary"
          disabled={!valid}
          onClick={() => {
            const err = apply((draft) =>
              actions.repayReceivable(draft, receivable.id, v)
            ) as string | null;
            if (err) alert(err);
            else onClose();
          }}
        >
          Record repayment
        </button>
        <button className="btn btn-quiet" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Write-off                                                           */
/* ------------------------------------------------------------------ */

function WriteOffDialog({ receivable, onClose }: { receivable: Receivable; onClose: () => void }) {
  const { data, derived: d, apply, actions } = useStore();
  const sym = data.settings.currencySymbol;
  const outstanding = d.receivableOutstanding[receivable.id] ?? receivable.amount;
  const [reason, setReason] = useState("");
  const valid = reason.trim().length >= 3;

  return (
    <Modal onClose={onClose}>
      <h2 className="mb16">Write off {receivable.person}'s {fmt(outstanding, sym)}</h2>
      <div className="notice mb16">
        This removes the claim from net worth. If repaid later, record it as
        income.
      </div>
      <div className="field">
        <span className="label">One line for your record</span>
        <input
          className="input"
          placeholder="e.g. letting this one go"
          value={reason}
          autoFocus
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="btn btn-primary"
          disabled={!valid}
          onClick={() => {
            const err = apply((draft) =>
              actions.writeOffReceivable(draft, receivable.id, reason.trim())
            ) as string | null;
            if (err) alert(err);
            else onClose();
          }}
        >
          Write off
        </button>
        <button className="btn btn-quiet" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Shared field block                                                  */
/* ------------------------------------------------------------------ */

function ClaimFields(props: {
  person: string; setPerson: (v: string) => void;
  amount: string; setAmount: (v: string) => void;
  date: string; setDate: (v: string) => void;
  note: string; setNote: (v: string) => void;
  confidence: Confidence; setConfidence: (v: Confidence) => void;
  amountLabel: string;
}) {
  return (
    <>
      <div className="form-row">
        <div className="field">
          <span className="label">Person</span>
          <input className="input" value={props.person} onChange={(e) => props.setPerson(e.target.value)} />
        </div>
        <div className="field">
          <span className="label">{props.amountLabel}</span>
          <input
            className="input"
            type="number"
            min="0"
            step="0.01"
            value={props.amount}
            onChange={(e) => props.setAmount(e.target.value)}
          />
        </div>
      </div>
      <div className="form-row">
        <div className="field">
          <span className="label">Confidence</span>
          <select
            className="select"
            value={props.confidence}
            onChange={(e) => props.setConfidence(e.target.value as Confidence)}
          >
            <option value="certain">Certain</option>
            <option value="likely">Likely</option>
            <option value="hopeful">Hopeful</option>
          </select>
        </div>
        <div className="field">
          <span className="label">Expected date (optional)</span>
          <input className="input" type="date" value={props.date} onChange={(e) => props.setDate(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <span className="label">Note (optional)</span>
        <input className="input" value={props.note} onChange={(e) => props.setNote(e.target.value)} />
      </div>
    </>
  );
}
