/**
 * Actions — every way the document can change, as pure mutating functions on
 * an AppData draft. The store clones state, applies one of these, persists.
 * The seed generator replays the same functions with backdated timestamps, so
 * example data goes through exactly the same rules as real life.
 */

import type {
  Account,
  AccountType,
  AppData,
  Asset,
  AssetCategory,
  Confidence,
  Debt,
  Goal,
  GoalKind,
  LendLayer,
  PendingWithdrawal,
  Receivable,
  Recurrence,
} from "../types";
import { deriveState, floorOf, reserveTargetOf } from "./replay";
import { computeSplit } from "./split";
import { addMonths, parseISO, r2, toISODate, uid } from "../lib/util";

const HOUR_MS = 3_600_000;

/** After anything that raises the reserve: exit recovery quietly when full. */
function maybeExitRecovery(data: AppData, at: Date): void {
  const d = deriveState(data, at);
  if (d.inRecovery && d.reserve >= reserveTargetOf(data.settings)) {
    data.events.push({
      id: uid(),
      type: "recovery",
      direction: "exit",
      date: at.toISOString(),
    });
  }
}

/* ------------------------------------------------------------------ */
/* Money in — the only required interaction                            */
/* ------------------------------------------------------------------ */

export function logIncome(
  data: AppData,
  amount: number,
  source: string,
  at: Date = new Date()
): AppData["events"][number] {
  const d = deriveState(data, at);
  const split = computeSplit(amount, data.settings, data.goals, d, at);
  const event = {
    id: uid(),
    type: "income" as const,
    date: at.toISOString(),
    amount: r2(amount),
    source: source.trim(),
    split,
  };
  data.events.push(event);
  if (source.trim() && !data.incomeSources.includes(source.trim())) {
    data.incomeSources.push(source.trim());
  }
  maybeExitRecovery(data, at);
  return event;
}

/* ------------------------------------------------------------------ */
/* The spend game (optional, never homework)                           */
/* ------------------------------------------------------------------ */

export function logSpend(data: AppData, amount: number, at: Date = new Date()): void {
  data.events.push({
    id: uid(),
    type: "spend",
    date: at.toISOString(),
    amount: r2(amount),
  });
}

/* ------------------------------------------------------------------ */
/* Vault doors                                                         */
/* ------------------------------------------------------------------ */

export function withdrawAccessible(
  data: AppData,
  amount: number,
  category: string,
  note: string = "",
  at: Date = new Date()
): string | null {
  const d = deriveState(data, at);
  if (amount > d.accessible + 0.005) {
    return `Only ${d.accessible.toFixed(2)} is behind the accessible door.`;
  }
  data.events.push({
    id: uid(),
    type: "withdrawal",
    date: at.toISOString(),
    amount: r2(amount),
    layer: "accessible",
    category: category.trim(),
    reason: note.trim(),
  });
  rememberCategory(data, category);
  return null;
}

/** Save a "what's it for" label for reuse, most-recent first. */
function rememberCategory(data: AppData, label: string): void {
  const l = label.trim();
  if (!l) return;
  data.withdrawalCategories = [l, ...data.withdrawalCategories.filter((c) => c !== l)].slice(0, 12);
}

/**
 * "Take this week's allowance" — draw the weekly allowance from the accessible
 * reserve to live on, tagged with the week it covers so draws are trackable.
 * Each draw reduces "Accessible if needed"; two draws leave it two weeks
 * lighter, until income replenishes it. Draws the full allowance, or whatever
 * accessible remains if it is less.
 */
export function takeWeeklyAllowance(
  data: AppData,
  weekOf: string,
  at: Date = new Date()
): string | null {
  const d = deriveState(data, at);
  const amount = r2(Math.min(data.settings.regularWeekly, d.accessible));
  if (amount <= 0) return "The accessible reserve is empty.";
  data.events.push({
    id: uid(),
    type: "withdrawal",
    date: at.toISOString(),
    amount,
    layer: "accessible",
    reason: "Weekly allowance",
    allowance: true,
    weekOf,
  });
  return null;
}

export function withdrawSurplus(
  data: AppData,
  amount: number,
  reason: string,
  at: Date = new Date()
): string | null {
  const d = deriveState(data, at);
  if (amount > d.surplusHeld + 0.005) return "Not enough unassigned surplus.";
  data.events.push({
    id: uid(),
    type: "withdrawal",
    date: at.toISOString(),
    amount: r2(amount),
    layer: "surplus",
    reason,
  });
  return null;
}

/** Deep door, step 1: request. Enforces the Floor — a hard block, not a warning. */
export function requestDeepWithdrawal(
  data: AppData,
  amount: number,
  reason: string,
  at: Date = new Date()
): string | null {
  const d = deriveState(data, at);
  const pendingTotal = data.pendingWithdrawals.reduce((s, p) => s + p.amount, 0);
  const withdrawable = Math.max(0, d.deep - floorOf(data.settings) - pendingTotal);
  if (amount > withdrawable + 0.005) {
    return `The Floor protects the last ${floorOf(data.settings).toFixed(0)}. Maximum withdrawable: ${withdrawable.toFixed(2)}.`;
  }
  data.pendingWithdrawals.push({
    id: uid(),
    createdAt: at.toISOString(),
    amount: r2(amount),
    reason,
    confirmAfter: new Date(at.getTime() + 24 * HOUR_MS).toISOString(),
  });
  return null;
}

/** Deep door, step 2: confirm after the 24h cooldown.
 *  A withdrawal enters recovery mode; a loan does not (the money is a claim
 *  expected back, and repayment refills the reserve through the normal Split). */
export function confirmDeepWithdrawal(
  data: AppData,
  pendingId: string,
  at: Date = new Date()
): string | null {
  const idx = data.pendingWithdrawals.findIndex((p) => p.id === pendingId);
  if (idx === -1) return "Pending withdrawal not found.";
  const p = data.pendingWithdrawals[idx];
  if (at.getTime() < parseISO(p.confirmAfter).getTime()) {
    return "The cooldown hasn't finished yet.";
  }
  const d = deriveState(data, at);
  data.pendingWithdrawals.splice(idx, 1);

  if (p.lend) {
    // Convert the deep-reserve cash into a receivable claim.
    const rec: Receivable = {
      id: uid(),
      person: p.lend.person,
      amount: p.amount,
      expectedDate: p.lend.expectedDate,
      note: p.lend.note,
      confidence: p.lend.confidence,
      status: "active",
      createdAt: at.toISOString(),
    };
    data.receivables.push(rec);
    data.events.push({
      id: uid(),
      type: "lend",
      date: at.toISOString(),
      receivableId: rec.id,
      person: rec.person,
      amount: p.amount,
      layer: "deep",
      confidence: rec.confidence,
      reason: p.reason,
    });
    return null;
  }

  data.events.push({
    id: uid(),
    type: "withdrawal",
    date: at.toISOString(),
    amount: p.amount,
    layer: "deep",
    reason: p.reason,
  });
  if (!d.inRecovery) {
    data.events.push({
      id: uid(),
      type: "recovery",
      direction: "enter",
      date: at.toISOString(),
    });
  }
  return null;
}

export function cancelDeepWithdrawal(data: AppData, pendingId: string): void {
  data.pendingWithdrawals = data.pendingWithdrawals.filter((p) => p.id !== pendingId);
}

/* ------------------------------------------------------------------ */
/* Goals                                                               */
/* ------------------------------------------------------------------ */

export function addGoal(
  data: AppData,
  input: {
    kind: GoalKind;
    name: string;
    target: number;
    targetDate: string;
    recurrence?: Recurrence | null;
  },
  at: Date = new Date()
): Goal {
  const maxPriority = data.goals.reduce((m, g) => Math.max(m, g.priority), 0);
  const goal: Goal = {
    id: uid(),
    kind: input.kind,
    name: input.name.trim(),
    target: r2(input.target),
    targetDate: input.targetDate,
    priority: maxPriority + 1,
    recurrence: input.kind === "provision" ? input.recurrence ?? null : null,
    status: "active",
    createdAt: at.toISOString(),
  };
  data.goals.push(goal);
  return goal;
}

export function updateGoal(data: AppData, goal: Goal): void {
  const idx = data.goals.findIndex((g) => g.id === goal.id);
  if (idx !== -1) data.goals[idx] = goal;
}

/** One-tap "paid": what was set aside exits; recurring provisions renew themselves. */
export function payProvision(
  data: AppData,
  goalId: string,
  at: Date = new Date()
): string | null {
  const goal = data.goals.find((g) => g.id === goalId);
  if (!goal || goal.kind !== "provision" || goal.status !== "active") {
    return "Provision not found.";
  }
  const d = deriveState(data, at);
  const balance = d.goalBalances[goal.id] ?? 0;
  if (balance <= 0) return "Nothing set aside for this provision yet.";
  data.events.push({
    id: uid(),
    type: "provision_paid",
    date: at.toISOString(),
    goalId: goal.id,
    goalName: goal.name,
    amount: r2(Math.min(balance, goal.target)),
  });
  goal.status = "done";
  if (goal.recurrence) {
    const months =
      goal.recurrence === "monthly" ? 1 : goal.recurrence === "quarterly" ? 3 : 12;
    addGoal(
      data,
      {
        kind: "provision",
        name: goal.name,
        target: goal.target,
        targetDate: toISODate(addMonths(parseISO(goal.targetDate), months)),
        recurrence: goal.recurrence,
      },
      at
    );
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Manual corrections                                                  */
/* ------------------------------------------------------------------ */

export function adjust(
  data: AppData,
  target: "reserve" | "surplus" | "regular" | "goal",
  amount: number,
  reason: string,
  goalId?: string,
  at: Date = new Date()
): void {
  const goal = goalId ? data.goals.find((g) => g.id === goalId) : undefined;
  data.events.push({
    id: uid(),
    type: "adjustment",
    date: at.toISOString(),
    target,
    goalId,
    goalName: goal?.name,
    amount: r2(amount),
    reason,
  });
  if (amount > 0) maybeExitRecovery(data, at);
}

/* ------------------------------------------------------------------ */
/* Outside assets                                                      */
/* ------------------------------------------------------------------ */

export function addAsset(
  data: AppData,
  input: { name: string; category: AssetCategory; value: number },
  at: Date = new Date()
): Asset {
  const asset: Asset = {
    id: uid(),
    name: input.name.trim(),
    category: input.category,
    value: r2(input.value),
    lastUpdated: at.toISOString(),
    createdAt: at.toISOString(),
  };
  data.assets.push(asset);
  data.events.push({
    id: uid(),
    type: "asset",
    date: at.toISOString(),
    action: "added",
    assetId: asset.id,
    name: asset.name,
    category: asset.category,
    value: asset.value,
  });
  return asset;
}

export function updateAssetValue(
  data: AppData,
  assetId: string,
  value: number,
  reason: string,
  at: Date = new Date()
): void {
  const asset = data.assets.find((a) => a.id === assetId);
  if (!asset) return;
  asset.value = r2(value);
  asset.lastUpdated = at.toISOString();
  data.events.push({
    id: uid(),
    type: "asset",
    date: at.toISOString(),
    action: "updated",
    assetId,
    name: asset.name,
    category: asset.category,
    value: asset.value,
    reason,
  });
}

export function removeAsset(
  data: AppData,
  assetId: string,
  reason: string,
  at: Date = new Date()
): void {
  const asset = data.assets.find((a) => a.id === assetId);
  if (!asset) return;
  data.assets = data.assets.filter((a) => a.id !== assetId);
  data.events.push({
    id: uid(),
    type: "asset",
    date: at.toISOString(),
    action: "removed",
    assetId,
    name: asset.name,
    category: asset.category,
    value: asset.value,
    reason,
  });
}

/* ------------------------------------------------------------------ */
/* Receivables — a claim, never cash                                   */
/* ------------------------------------------------------------------ */

/** Record a claim that already existed (someone owed you). No cash moves. */
export function addReceivable(
  data: AppData,
  input: {
    person: string;
    amount: number;
    expectedDate?: string | null;
    note?: string;
    confidence: Confidence;
  },
  at: Date = new Date()
): Receivable {
  const rec: Receivable = {
    id: uid(),
    person: input.person.trim(),
    amount: r2(input.amount),
    expectedDate: input.expectedDate ?? null,
    note: input.note?.trim() ?? "",
    confidence: input.confidence,
    status: "active",
    createdAt: at.toISOString(),
  };
  data.receivables.push(rec);
  data.events.push({
    id: uid(),
    type: "receivable_added",
    date: at.toISOString(),
    receivableId: rec.id,
    person: rec.person,
    amount: rec.amount,
    confidence: rec.confidence,
  });
  return rec;
}

export function updateReceivable(data: AppData, rec: Receivable): void {
  const idx = data.receivables.findIndex((r) => r.id === rec.id);
  if (idx !== -1) data.receivables[idx] = { ...rec, amount: r2(rec.amount) };
}

/** Available to lend from a given layer right now (Floor enforced on deep). */
export function lendableFrom(data: AppData, layer: LendLayer, goalId: string | undefined, at: Date): number {
  const d = deriveState(data, at);
  switch (layer) {
    case "accessible":
      return d.accessible;
    case "deep": {
      const pendingTotal = data.pendingWithdrawals.reduce((s, p) => s + p.amount, 0);
      return Math.max(0, r2(d.deep - floorOf(data.settings) - pendingTotal));
    }
    case "surplus":
      return d.surplusHeld;
    case "regular":
      return d.regularWallet;
    case "goal":
      return goalId ? d.goalBalances[goalId] ?? 0 : 0;
  }
}

/**
 * "Lend money" — convert cash into a receivable. Deep-reserve loans return a
 * pending id (24h cooldown, like a deep withdrawal); every other layer settles
 * immediately. The Floor is a hard block for lending too.
 */
export function lendMoney(
  data: AppData,
  input: {
    person: string;
    amount: number;
    layer: LendLayer;
    goalId?: string;
    expectedDate?: string | null;
    note?: string;
    confidence: Confidence;
    reason: string;
  },
  at: Date = new Date()
): { error?: string; pending?: boolean } {
  const amount = r2(input.amount);
  const available = lendableFrom(data, input.layer, input.goalId, at);
  if (amount <= 0) return { error: "Enter an amount to lend." };
  if (amount > available + 0.005) {
    return input.layer === "deep"
      ? { error: `The Floor protects the deep reserve. Maximum lendable: ${available.toFixed(2)}.` }
      : { error: `Only ${available.toFixed(2)} is available in that layer.` };
  }

  if (input.layer === "deep") {
    // Heavy door: hold as pending; confirmed after 24h creates the receivable.
    data.pendingWithdrawals.push({
      id: uid(),
      createdAt: at.toISOString(),
      amount,
      reason: input.reason.trim(),
      confirmAfter: new Date(at.getTime() + 24 * HOUR_MS).toISOString(),
      lend: {
        person: input.person.trim(),
        expectedDate: input.expectedDate ?? null,
        note: input.note?.trim() ?? "",
        confidence: input.confidence,
      },
    });
    return { pending: true };
  }

  const goal = input.goalId ? data.goals.find((g) => g.id === input.goalId) : undefined;
  const rec: Receivable = {
    id: uid(),
    person: input.person.trim(),
    amount,
    expectedDate: input.expectedDate ?? null,
    note: input.note?.trim() ?? "",
    confidence: input.confidence,
    status: "active",
    createdAt: at.toISOString(),
  };
  data.receivables.push(rec);
  data.events.push({
    id: uid(),
    type: "lend",
    date: at.toISOString(),
    receivableId: rec.id,
    person: rec.person,
    amount,
    layer: input.layer,
    goalId: input.goalId,
    goalName: goal?.name,
    confidence: rec.confidence,
    reason: input.reason.trim(),
  });
  return {};
}

/**
 * "Repaid" (full or partial): the money comes home through the standard Split,
 * exactly like income. Repaying a written-off debt is logged as income that
 * references the old claim; the claim stays archived.
 */
export function repayReceivable(
  data: AppData,
  receivableId: string,
  amount: number,
  at: Date = new Date()
): string | null {
  const rec = data.receivables.find((r) => r.id === receivableId);
  if (!rec) return "Receivable not found.";
  const value = r2(amount);
  if (value <= 0) return "Enter a repayment amount.";

  const d = deriveState(data, at);
  const split = computeSplit(value, data.settings, data.goals, d, at);
  data.events.push({
    id: uid(),
    type: "receivable_repaid",
    date: at.toISOString(),
    receivableId: rec.id,
    person: rec.person,
    amount: value,
    split,
    wasWrittenOff: rec.status === "written_off" ? true : undefined,
  });

  if (rec.status === "active") {
    const outstanding = d.receivableOutstanding[rec.id] ?? 0;
    if (value >= outstanding - 0.005) rec.status = "repaid";
  }
  maybeExitRecovery(data, at);
  return null;
}

/** Dignified write-off: the outstanding claim leaves net worth, logged calmly. */
export function writeOffReceivable(
  data: AppData,
  receivableId: string,
  reason: string,
  at: Date = new Date()
): string | null {
  const rec = data.receivables.find((r) => r.id === receivableId);
  if (!rec || rec.status !== "active") return "Receivable not found.";
  const d = deriveState(data, at);
  const outstanding = d.receivableOutstanding[rec.id] ?? 0;
  data.events.push({
    id: uid(),
    type: "receivable_writeoff",
    date: at.toISOString(),
    receivableId: rec.id,
    person: rec.person,
    amount: r2(outstanding),
    reason: reason.trim(),
  });
  rec.status = "written_off";
  return null;
}

/* ------------------------------------------------------------------ */
/* Accounts — where money lives (labels, not balances)                 */
/* ------------------------------------------------------------------ */

export function addAccount(
  data: AppData,
  input: { name: string; type: AccountType; note?: string },
  at: Date = new Date()
): Account {
  const account: Account = {
    id: uid(),
    name: input.name.trim(),
    type: input.type,
    note: input.note?.trim() ?? "",
    createdAt: at.toISOString(),
  };
  data.accounts.push(account);
  return account;
}

export function updateAccount(data: AppData, account: Account): void {
  const idx = data.accounts.findIndex((a) => a.id === account.id);
  if (idx !== -1) data.accounts[idx] = { ...account, name: account.name.trim() };
}

/** Remove an account and clear any pool/asset that pointed at it. */
export function removeAccount(data: AppData, accountId: string): void {
  data.accounts = data.accounts.filter((a) => a.id !== accountId);
  for (const key of Object.keys(data.accountMap)) {
    if (data.accountMap[key] === accountId) delete data.accountMap[key];
  }
  for (const asset of data.assets) {
    if (asset.accountId === accountId) asset.accountId = undefined;
  }
}

/** Assign a managed-cash pool (reserve/allowance/goals/provisions) to an account. */
export function setPoolAccount(data: AppData, poolKey: string, accountId: string): void {
  if (accountId) data.accountMap[poolKey] = accountId;
  else delete data.accountMap[poolKey];
}

/** Assign an outside asset to an account. */
export function setAssetAccount(data: AppData, assetId: string, accountId: string): void {
  const asset = data.assets.find((a) => a.id === assetId);
  if (asset) asset.accountId = accountId || undefined;
}

/* ------------------------------------------------------------------ */
/* Debts — money I owe. A liability against net worth.                 */
/* ------------------------------------------------------------------ */

export function addDebt(
  data: AppData,
  input: { name: string; amount: number; dueDate?: string | null; note?: string },
  at: Date = new Date()
): Debt {
  const debt: Debt = {
    id: uid(),
    name: input.name.trim(),
    amount: r2(input.amount),
    dueDate: input.dueDate ?? null,
    note: input.note?.trim() ?? "",
    status: "active",
    createdAt: at.toISOString(),
  };
  data.debts.push(debt);
  data.events.push({
    id: uid(),
    type: "debt_added",
    date: at.toISOString(),
    debtId: debt.id,
    name: debt.name,
    amount: debt.amount,
  });
  return debt;
}

export function updateDebt(data: AppData, debt: Debt): void {
  const idx = data.debts.findIndex((x) => x.id === debt.id);
  if (idx !== -1) data.debts[idx] = { ...debt, amount: r2(debt.amount) };
}

/** Pay down a debt (full or partial) from a cash layer. */
export function payDebt(
  data: AppData,
  debtId: string,
  amount: number,
  layer: "accessible" | "surplus" = "accessible",
  at: Date = new Date()
): string | null {
  const debt = data.debts.find((x) => x.id === debtId);
  if (!debt || debt.status !== "active") return "Debt not found.";
  const d = deriveState(data, at);
  const value = r2(amount);
  if (value <= 0) return "Enter a payment amount.";
  const available = layer === "surplus" ? d.surplusHeld : d.accessible;
  if (value > available + 0.005) {
    return `Only ${available.toFixed(2)} available in that layer.`;
  }
  data.events.push({
    id: uid(),
    type: "debt_payment",
    date: at.toISOString(),
    debtId: debt.id,
    name: debt.name,
    amount: value,
    layer,
  });
  const outstanding = d.debtOutstanding[debt.id] ?? debt.amount;
  if (value >= outstanding - 0.005) debt.status = "paid";
  return null;
}
