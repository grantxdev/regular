/**
 * Assets — things owned outside the app's cash flow. Estimated (typed) values
 * are visually distinct from verified (app-routed) balances; stale ones get a
 * gentle twice-a-year "still worth about…?" prompt; vehicles depreciate.
 */

import { useState } from "react";
import { useStore } from "../store";
import type { Asset, AssetCategory } from "../types";
import { assetValueAt } from "../engine/replay";
import { fmt, fmtDate, parseISO, DAY_MS } from "../lib/util";
import { Modal } from "./shared";

const CATEGORIES: { value: AssetCategory; label: string }[] = [
  { value: "vehicle", label: "Vehicle (auto-depreciates)" },
  { value: "savings", label: "Savings" },
  { value: "investment", label: "Investment" },
  { value: "crypto", label: "Crypto" },
  { value: "property", label: "Property" },
  { value: "other", label: "Other" },
];

const STALE_DAYS = 182; // twice a year

export function Assets() {
  const { data, derived: d, apply, actions } = useStore();
  const sym = data.settings.currencySymbol;
  const now = new Date();
  const [adding, setAdding] = useState(false);
  const [updating, setUpdating] = useState<Asset | null>(null);

  return (
    <div className="screen">
      <h1 className="page-title">Assets</h1>
      <p className="page-sub">
        Outside worth. <span className="green">Verified</span> means Regular
        routed the money itself; <span className="amber">estimated</span> means
        you typed it and it ages.
      </p>

      <div className="card">
        <div className="row">
          <span className="label">Verified — routed by Regular</span>
          <span className="chip ok">verified</span>
        </div>
        <div className="stack mt16" style={{ gap: 10 }}>
          <div className="row">
            <span className="dim">Cash layers (reserve, Regular, surplus)</span>
            <span className="num">{fmt(d.reserve + d.regularWallet + d.surplusHeld, sym)}</span>
          </div>
          <div className="row">
            <span className="dim">Goal balances (tied)</span>
            <span className="num">{fmt(d.tiedTotal, sym)}</span>
          </div>
          <div className="row">
            <span className="dim">Provisions (committed)</span>
            <span className="num">{fmt(d.provisionsTotal, sym)}</span>
          </div>
        </div>
      </div>

      <div className="row mt24 mb16">
        <h2>Outside assets</h2>
        <button className="btn" onClick={() => setAdding(true)}>
          Add asset
        </button>
      </div>

      {data.assets.length === 0 && (
        <div className="card status-line">
          Nothing logged. A car, old savings, crypto — anything you own that
          should count.
        </div>
      )}

      {data.assets.map((a) => {
        const current = assetValueAt(a, now, data.settings);
        const ageDays = Math.floor((now.getTime() - parseISO(a.lastUpdated).getTime()) / DAY_MS);
        const stale = ageDays >= STALE_DAYS;
        return (
          <div className="card" key={a.id}>
            <div className="row">
              <h2>
                {a.name}
                <span className="faint" style={{ fontSize: 12, fontWeight: 400 }}>
                  {" "}· {a.category}
                </span>
              </h2>
              <span className="chip warn">estimated</span>
            </div>
            <div className="row mt8">
              <span className="big-num dim">{fmt(current, sym)}</span>
              <span className="status-line">
                updated {fmtDate(a.lastUpdated)}
                {a.category === "vehicle" && current < a.value && (
                  <> · depreciated from {fmt(a.value, sym)}</>
                )}
              </span>
            </div>
            {stale && (
              <div className="notice mt16">
                Still worth about {fmt(current, sym)}? A quick confirm keeps
                your net worth honest.
              </div>
            )}
            <div className="mt16" style={{ display: "flex", gap: 8 }}>
              <button className="btn" onClick={() => setUpdating(a)}>
                {stale ? "Confirm / update" : "Update value"}
              </button>
              <button
                className="btn btn-quiet"
                onClick={() => {
                  const reason = prompt(`Remove "${a.name}" — one-line reason for the record:`);
                  if (reason !== null) {
                    apply((draft) => actions.removeAsset(draft, a.id, reason || "removed"));
                  }
                }}
              >
                Remove
              </button>
            </div>
          </div>
        );
      })}

      {adding && (
        <AssetForm
          onClose={() => setAdding(false)}
          onSave={(input) => {
            apply((draft) => actions.addAsset(draft, input));
            setAdding(false);
          }}
        />
      )}
      {updating && (
        <UpdateValueForm
          asset={updating}
          currentValue={assetValueAt(updating, now, data.settings)}
          symbol={sym}
          onClose={() => setUpdating(null)}
          onSave={(value, reason) => {
            apply((draft) => actions.updateAssetValue(draft, updating.id, value, reason));
            setUpdating(null);
          }}
        />
      )}
    </div>
  );
}

function AssetForm({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (input: { name: string; category: AssetCategory; value: number }) => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<AssetCategory>("other");
  const [value, setValue] = useState("");
  const v = parseFloat(value);
  const valid = name.trim().length > 0 && !isNaN(v) && v >= 0;

  return (
    <Modal onClose={onClose}>
      <h2 className="mb16">New outside asset</h2>
      <div className="field">
        <span className="label">Name</span>
        <input className="input" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="form-row">
        <div className="field">
          <span className="label">Category</span>
          <select
            className="select"
            value={category}
            onChange={(e) => setCategory(e.target.value as AssetCategory)}
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <span className="label">Current value</span>
          <input
            className="input"
            type="number"
            min="0"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="btn btn-primary"
          disabled={!valid}
          onClick={() => onSave({ name: name.trim(), category, value: v })}
        >
          Add
        </button>
        <button className="btn btn-quiet" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}

function UpdateValueForm({
  asset,
  currentValue,
  symbol,
  onClose,
  onSave,
}: {
  asset: Asset;
  currentValue: number;
  symbol: string;
  onClose: () => void;
  onSave: (value: number, reason: string) => void;
}) {
  const [value, setValue] = useState(String(Math.round(currentValue)));
  const [reason, setReason] = useState("");
  const v = parseFloat(value);
  const valid = !isNaN(v) && v >= 0;

  return (
    <Modal onClose={onClose}>
      <h2 className="mb16">Update {asset.name}</h2>
      <div className="field">
        <span className="label">Value today (currently ~{fmt(currentValue, symbol)})</span>
        <input
          className="input"
          type="number"
          min="0"
          value={value}
          autoFocus
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      <div className="field">
        <span className="label">Reason (optional, logged to history)</span>
        <input
          className="input"
          placeholder="e.g. checked market value"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="btn btn-primary"
          disabled={!valid}
          onClick={() => onSave(v, reason.trim() || "value confirmed")}
        >
          Save
        </button>
        <button className="btn btn-quiet" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}
