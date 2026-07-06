/**
 * Accounts — the "where is my money" view. Pure derivation: it maps the
 * managed-cash pools (from the ledger-derived state) and outside assets onto
 * the accounts the user has defined, so net worth can be read by location.
 * No balances are stored; this reconciles to net worth exactly.
 */

import type { Account, AppData } from "../types";
import type { Derived } from "./replay";
import { assetValueAt } from "./replay";
import { r2 } from "../lib/util";

export interface Pool {
  key: string;
  label: string;
  value: number;
}

/** The four managed-cash pools that can be assigned to an account. */
export function managedPools(d: Derived): Pool[] {
  return [
    { key: "reserve", label: "Reserve", value: d.reserve },
    { key: "allowance", label: "Allowance & surplus", value: r2(d.regularWallet + d.surplusHeld) },
    { key: "goals", label: "Objectives", value: d.tiedTotal },
    { key: "provisions", label: "Provisions", value: d.provisionsTotal },
  ];
}

export interface LocationItem {
  label: string;
  value: number;
}

export interface LocationGroup {
  /** null = not yet assigned to any account. */
  account: Account | null;
  items: LocationItem[];
  total: number;
}

/**
 * Net worth grouped by account. Every positive holding (managed pool or asset)
 * lands in exactly one group; unassigned holdings collect under account: null.
 * Receivables (owed to you) and debts (owed by you) are NOT accounts — the
 * caller shows them separately so the whole thing sums to net worth.
 */
export function whereItIs(
  data: AppData,
  d: Derived,
  now: Date = new Date()
): LocationGroup[] {
  const accountById = new Map(data.accounts.map((a) => [a.id, a]));
  const groups = new Map<string, LocationItem[]>(); // accountId ("" = unassigned) → items

  const push = (accountId: string, item: LocationItem) => {
    if (item.value <= 0) return;
    const key = accountById.has(accountId) ? accountId : "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  };

  for (const p of managedPools(d)) {
    push(data.accountMap[p.key] ?? "", { label: p.label, value: p.value });
  }
  for (const a of data.assets) {
    push(a.accountId ?? "", {
      label: a.name,
      value: assetValueAt(a, now, data.settings),
    });
  }

  // Emit defined accounts first (even if empty), then the unassigned bucket.
  const out: LocationGroup[] = [];
  for (const account of data.accounts) {
    const items = groups.get(account.id) ?? [];
    out.push({ account, items, total: r2(items.reduce((s, i) => s + i.value, 0)) });
  }
  const unassigned = groups.get("") ?? [];
  if (unassigned.length > 0) {
    out.push({
      account: null,
      items: unassigned,
      total: r2(unassigned.reduce((s, i) => s + i.value, 0)),
    });
  }
  return out;
}
