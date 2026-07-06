/**
 * Accounts — "where is my money." Renders the Where-it-is breakdown (net worth
 * grouped by account), account management, and the pool-assignment controls
 * that map each managed-cash pool (reserve/allowance/objectives/provisions) to
 * an account. Assets are assigned from their own cards in Assets.tsx.
 */

import { useState } from "react";
import { useStore } from "../store";
import type { Account, AccountType } from "../types";
import { managedPools, whereItIs } from "../engine/accounts";
import { fmt } from "../lib/util";
import { Modal } from "./shared";

const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: "checking", label: "Checking" },
  { value: "savings", label: "Savings" },
  { value: "brokerage", label: "Brokerage / investment" },
  { value: "crypto", label: "Crypto" },
  { value: "cash", label: "Cash" },
  { value: "property", label: "Property" },
  { value: "other", label: "Other" },
];

const typeLabel = (t: AccountType) => ACCOUNT_TYPES.find((x) => x.value === t)?.label ?? t;

export function AccountsPanel() {
  const { data, derived: d, apply, actions } = useStore();
  const sym = data.settings.currencySymbol;
  const now = new Date();
  const [editing, setEditing] = useState<Account | null>(null);
  const [adding, setAdding] = useState(false);

  const groups = whereItIs(data, d, now);
  const pools = managedPools(d).filter((p) => p.value > 0.005);

  return (
    <>
      {/* -------- Where it is -------- */}
      <div className="card">
        <div className="row mb16">
          <div>
            <span className="label">Where it is</span>
            <div className="status-line faint">Your net worth, by where it's held.</div>
          </div>
          <button className="btn" onClick={() => setAdding(true)}>
            Add account
          </button>
        </div>

        {groups.length === 0 && data.accounts.length === 0 && (
          <div className="status-line">
            Add an account to see where your money lives.
          </div>
        )}

        <div className="stack" style={{ gap: 16 }}>
          {groups.map((g) => (
            <div key={g.account?.id ?? "unassigned"}>
              <div className="row">
                <span style={{ fontSize: 14 }}>
                  {g.account ? g.account.name : <span className="amber">Unassigned</span>}
                  {g.account && (
                    <span className="faint" style={{ fontSize: 12 }}>
                      {" "}· {typeLabel(g.account.type)}
                      {g.account.note ? ` · ${g.account.note}` : ""}
                    </span>
                  )}
                </span>
                <span className="num">{fmt(g.total, sym)}</span>
              </div>
              <div className="stack mt8" style={{ gap: 4 }}>
                {g.items.map((it, i) => (
                  <div className="row" key={i}>
                    <span className="status-line faint">{it.label}</span>
                    <span className="status-line faint num">{fmt(it.value, sym)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Claims and liabilities aren't held in an account. */}
        {(d.receivablesWeighted > 0 || d.debtsTotal > 0) && <hr className="hairline" />}
        {d.receivablesWeighted > 0 && (
          <div className="row">
            <span className="status-line">Owed to you (receivables)</span>
            <span className="num">{fmt(d.receivablesWeighted, sym)}</span>
          </div>
        )}
        {d.debtsTotal > 0 && (
          <div className="row mt8">
            <span className="status-line">Owed by you (debts)</span>
            <span className="num red">−{fmt(d.debtsTotal, sym)}</span>
          </div>
        )}

        <hr className="hairline" />
        <div className="row">
          <span className="label">Net worth</span>
          <span className="big-num" style={{ fontSize: "1.2rem" }}>{fmt(d.netWorth, sym)}</span>
        </div>
      </div>

      {/* -------- Assign the managed pools -------- */}
      {data.accounts.length > 0 && pools.length > 0 && (
        <div className="card mt16">
          <div className="label mb16">Which account holds each pool?</div>
          <div className="stack" style={{ gap: 12 }}>
            {pools.map((p) => (
              <div className="row" key={p.key} style={{ gap: 12 }}>
                <span className="status-line" style={{ flex: 1 }}>
                  {p.label}
                  <span className="faint num"> · {fmt(p.value, sym)}</span>
                </span>
                <select
                  className="select"
                  style={{ maxWidth: 240 }}
                  value={data.accountMap[p.key] ?? ""}
                  onChange={(e) =>
                    apply((draft) => actions.setPoolAccount(draft, p.key, e.target.value))
                  }
                >
                  <option value="">Unassigned</option>
                  {data.accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* -------- Manage accounts -------- */}
      {data.accounts.length > 0 && (
        <div className="card mt16">
          <div className="label mb16">Accounts</div>
          <div className="stack" style={{ gap: 10 }}>
            {data.accounts.map((a) => (
              <div className="row" key={a.id}>
                <span className="status-line">
                  {a.name}
                  <span className="faint"> · {typeLabel(a.type)}{a.note ? ` · ${a.note}` : ""}</span>
                </span>
                <button className="btn btn-quiet" style={{ padding: "4px 12px" }} onClick={() => setEditing(a)}>
                  Edit
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {adding && <AccountForm onClose={() => setAdding(false)} />}
      {editing && <AccountForm existing={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

/* ------------------------------------------------------------------ */

function AccountForm({ existing, onClose }: { existing?: Account; onClose: () => void }) {
  const { apply, actions } = useStore();
  const [name, setName] = useState(existing?.name ?? "");
  const [type, setType] = useState<AccountType>(existing?.type ?? "checking");
  const [note, setNote] = useState(existing?.note ?? "");
  const valid = name.trim().length > 0;

  return (
    <Modal onClose={onClose}>
      <h2 className="mb16">{existing ? "Edit account" : "Add account"}</h2>
      <div className="field">
        <span className="label">Name</span>
        <input
          className="input"
          placeholder="e.g. Ally Savings"
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="form-row">
        <div className="field">
          <span className="label">Type</span>
          <select className="select" value={type} onChange={(e) => setType(e.target.value as AccountType)}>
            {ACCOUNT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <span className="label">Note (optional)</span>
          <input className="input" placeholder="e.g. …1234" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      <div className="mt8" style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
        <span style={{ display: "flex", gap: 8 }}>
          <button
            className="btn btn-primary"
            disabled={!valid}
            onClick={() => {
              if (existing) {
                apply((draft) =>
                  actions.updateAccount(draft, { ...existing, name: name.trim(), type, note: note.trim() })
                );
              } else {
                apply((draft) => actions.addAccount(draft, { name: name.trim(), type, note }));
              }
              onClose();
            }}
          >
            Save
          </button>
          <button className="btn btn-quiet" onClick={onClose}>Cancel</button>
        </span>
        {existing && (
          <button
            className="btn btn-danger"
            onClick={() => {
              if (confirm(`Remove "${existing.name}"? Anything held there becomes unassigned.`)) {
                apply((draft) => actions.removeAccount(draft, existing.id));
                onClose();
              }
            }}
          >
            Remove
          </button>
        )}
      </div>
    </Modal>
  );
}
