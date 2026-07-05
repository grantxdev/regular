/**
 * Actions — every way the document can change, as pure mutating functions on
 * an AppData draft. The store clones state, applies one of these, persists.
 * The seed generator replays the same functions with backdated timestamps, so
 * example data goes through exactly the same rules as real life.
 */

import type {
  AppData,
  Asset,
  AssetCategory,
  Goal,
  GoalKind,
  PendingWithdrawal,
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
  reason: string,
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
    reason,
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

/** Deep door, step 2: confirm after the 24h cooldown. Enters recovery mode. */
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
