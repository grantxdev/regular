/**
 * The replay engine. Given the persisted document, replays the entire ledger
 * chronologically and returns every derived number the UI shows. This is the
 * only place balances are computed, so the math is always trustworthy.
 *
 * Week boundaries are processed during replay: if Regular rollover is off,
 * unspent allowance above one week's worth sweeps to the top goal. These
 * sweeps are deterministic, so they are *derived* (returned as virtual ledger
 * rows), never stored.
 */

import type {
  AppData,
  Asset,
  Confidence,
  Goal,
  LedgerEvent,
  Settings,
} from "../types";
import {
  DAY_MS,
  MONTH_DAYS,
  addDays,
  clampMin0,
  monthsBetween,
  parseISO,
  r2,
  startOfWeek,
} from "../lib/util";

export interface SweepRecord {
  date: string;
  amount: number;
  toGoalId: string | null;
  toGoalName: string;
}

export interface HistoryPoint {
  date: string;
  netWorth: number;
}

export interface Derived {
  /* layer balances */
  reserve: number;
  accessible: number;
  deep: number;
  floor: number;
  reserveTarget: number;
  regularWallet: number;
  surplusHeld: number;
  goalBalances: Record<string, number>;
  provisionsTotal: number;
  tiedTotal: number; // accumulating goal balances

  /* receivables — claims, never liquid */
  receivableOutstanding: Record<string, number>;
  receivablesFullValue: number; // outstanding of active receivables, no haircut
  receivablesWeighted: number; // confidence-weighted contribution to net worth

  /* rollups */
  cashTotal: number;
  assetsTotal: number;
  netWorth: number; // cash + assets + weighted receivables
  netWorthIfAllRepaid: number; // cash + assets + full receivables
  liquidWorth: number;
  givenTotal: number;

  /* the three feelings */
  availableToday: number;
  accessibleIfNeeded: number;
  protectedTotal: number;

  runwayMonths: number;
  inRecovery: boolean;
  avgMonthlyIncome: number;

  /* this week's Regular */
  weekStart: Date;
  weekSpent: number;
  regularRemaining: number;

  history: HistoryPoint[];
  sweeps: SweepRecord[];
}

export function reserveTargetOf(s: Settings): number {
  return r2(s.reserveTargetMonths * s.livingExpensesMonthly + s.reserveTargetExtra);
}

export function floorOf(s: Settings): number {
  return Math.max(s.floorMonths * s.livingExpensesMonthly, s.floorAmount);
}

/** Confidence-weighted haircut for a receivable's contribution to net worth. */
export function confidenceWeight(c: Confidence, s: Settings): number {
  return c === "certain"
    ? s.receivableWeightCertain
    : c === "likely"
      ? s.receivableWeightLikely
      : s.receivableWeightHopeful;
}

/** Vehicle values decay on a simple exponential curve from their last update. */
export function assetValueAt(asset: Asset, at: Date, s: Settings): number {
  if (asset.category !== "vehicle") return asset.value;
  const years = clampMin0(monthsBetween(parseISO(asset.lastUpdated), at)) / 12;
  return r2(asset.value * Math.pow(1 - s.vehicleDepreciationRate, years));
}

/** Top-priority active accumulating goal — receives surplus and week-end sweeps. */
export function topGoal(goals: Goal[]): Goal | undefined {
  return goals
    .filter((g) => g.status === "active" && g.kind === "accumulating")
    .sort((a, b) => a.priority - b.priority)[0];
}

interface Buckets {
  reserve: number;
  regular: number;
  surplus: number;
  given: number;
  goals: Record<string, number>;
  /** Outstanding principal per receivable id. */
  recv: Record<string, number>;
  recovery: boolean;
}

/** Apply one ledger event to running balances. Shared by replay + snapshots. */
function applyEvent(b: Buckets, e: LedgerEvent): void {
  switch (e.type) {
    case "income": {
      const s = e.split;
      b.given = r2(b.given + s.giving);
      b.reserve = r2(b.reserve + s.reserve);
      b.regular = r2(b.regular + s.regular);
      for (const a of s.goals) {
        b.goals[a.goalId] = r2((b.goals[a.goalId] ?? 0) + a.amount);
      }
      if (s.surplus > 0) {
        if (s.surplusTarget === "top_goal" && s.surplusGoalId) {
          b.goals[s.surplusGoalId] = r2((b.goals[s.surplusGoalId] ?? 0) + s.surplus);
        } else if (s.surplusTarget === "reserve") {
          b.reserve = r2(b.reserve + s.surplus);
        } else {
          b.surplus = r2(b.surplus + s.surplus);
        }
      }
      break;
    }
    case "spend":
      b.regular = r2(clampMin0(b.regular - e.amount));
      break;
    case "withdrawal":
      if (e.layer === "accessible" || e.layer === "deep") {
        b.reserve = r2(clampMin0(b.reserve - e.amount));
      } else if (e.layer === "surplus") {
        b.surplus = r2(clampMin0(b.surplus - e.amount));
      } else if (e.layer === "goal" && e.goalId) {
        b.goals[e.goalId] = r2(clampMin0((b.goals[e.goalId] ?? 0) - e.amount));
      }
      break;
    case "provision_paid":
      b.goals[e.goalId] = r2(clampMin0((b.goals[e.goalId] ?? 0) - e.amount));
      break;
    case "adjustment":
      if (e.target === "reserve") b.reserve = r2(clampMin0(b.reserve + e.amount));
      else if (e.target === "surplus") b.surplus = r2(clampMin0(b.surplus + e.amount));
      else if (e.target === "regular") b.regular = r2(clampMin0(b.regular + e.amount));
      else if (e.target === "goal" && e.goalId)
        b.goals[e.goalId] = r2(clampMin0((b.goals[e.goalId] ?? 0) + e.amount));
      break;
    case "recovery":
      b.recovery = e.direction === "enter";
      break;
    case "asset":
      // Asset events are audit trail only; asset values live on the asset records.
      break;

    /* ---- receivables ---- */
    case "receivable_added":
      // Recording a pre-existing claim: no cash moves, the receivable appears.
      b.recv[e.receivableId] = r2((b.recv[e.receivableId] ?? 0) + e.amount);
      break;
    case "lend": {
      // Cash leaves the chosen layer and becomes a claim. Net worth is flat
      // (at full confidence); liquidity in that layer correctly drops.
      if (e.layer === "accessible" || e.layer === "deep") {
        b.reserve = r2(clampMin0(b.reserve - e.amount));
      } else if (e.layer === "surplus") {
        b.surplus = r2(clampMin0(b.surplus - e.amount));
      } else if (e.layer === "regular") {
        b.regular = r2(clampMin0(b.regular - e.amount));
      } else if (e.layer === "goal" && e.goalId) {
        b.goals[e.goalId] = r2(clampMin0((b.goals[e.goalId] ?? 0) - e.amount));
      }
      b.recv[e.receivableId] = r2((b.recv[e.receivableId] ?? 0) + e.amount);
      break;
    }
    case "receivable_repaid": {
      // The money comes home through the standard Split, exactly like income.
      const s = e.split;
      b.given = r2(b.given + s.giving);
      b.reserve = r2(b.reserve + s.reserve);
      b.regular = r2(b.regular + s.regular);
      for (const a of s.goals) {
        b.goals[a.goalId] = r2((b.goals[a.goalId] ?? 0) + a.amount);
      }
      if (s.surplus > 0) {
        if (s.surplusTarget === "top_goal" && s.surplusGoalId) {
          b.goals[s.surplusGoalId] = r2((b.goals[s.surplusGoalId] ?? 0) + s.surplus);
        } else if (s.surplusTarget === "reserve") {
          b.reserve = r2(b.reserve + s.surplus);
        } else {
          b.surplus = r2(b.surplus + s.surplus);
        }
      }
      // The claim shrinks (never below zero — overpayment is pure income).
      b.recv[e.receivableId] = r2(clampMin0((b.recv[e.receivableId] ?? 0) - e.amount));
      break;
    }
    case "receivable_writeoff":
      // The outstanding claim leaves net worth; it does not touch any cash layer.
      b.recv[e.receivableId] = 0;
      break;
  }
}

export function sortEvents(events: LedgerEvent[]): LedgerEvent[] {
  return [...events].sort(
    (a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime()
  );
}

export function deriveState(data: AppData, now: Date = new Date()): Derived {
  const s = data.settings;
  const events = sortEvents(data.events);
  const goalById = new Map(data.goals.map((g) => [g.id, g]));

  const b: Buckets = {
    reserve: 0,
    regular: 0,
    surplus: 0,
    given: 0,
    goals: {},
    recv: {},
    recovery: false,
  };

  const recvById = new Map(data.receivables.map((r) => [r.id, r]));
  const sweeps: SweepRecord[] = [];
  const history: HistoryPoint[] = [];

  /** Total value of typed-in assets as of a point in time (with depreciation). */
  const assetsAt = (at: Date): number => {
    let total = 0;
    for (const a of data.assets) {
      if (parseISO(a.createdAt).getTime() <= at.getTime()) {
        total += assetValueAt(a, at, s);
      }
    }
    return r2(total);
  };

  const cashOf = (bk: Buckets): number => {
    let goalsSum = 0;
    for (const v of Object.values(bk.goals)) goalsSum += v;
    return r2(bk.reserve + bk.regular + bk.surplus + goalsSum);
  };

  /** Confidence-weighted value of live claims — the net-worth contribution. */
  const receivablesWeightedOf = (bk: Buckets): number => {
    let total = 0;
    for (const [id, out] of Object.entries(bk.recv)) {
      const rec = recvById.get(id);
      if (!rec || out <= 0 || rec.status === "written_off") continue;
      total += out * confidenceWeight(rec.confidence, s);
    }
    return r2(total);
  };

  const snapshot = (at: Date) => {
    history.push({
      date: at.toISOString(),
      netWorth: r2(cashOf(b) + assetsAt(at) + receivablesWeightedOf(b)),
    });
  };

  /** Week-boundary bookkeeping: sweep unspent Regular above one week's allowance. */
  const crossWeekBoundary = (boundary: Date) => {
    if (!s.regularRollover && b.regular > s.regularWeekly) {
      const excess = r2(b.regular - s.regularWeekly);
      b.regular = s.regularWeekly;
      const top = topGoal(data.goals);
      if (top) {
        b.goals[top.id] = r2((b.goals[top.id] ?? 0) + excess);
        sweeps.push({
          date: boundary.toISOString(),
          amount: excess,
          toGoalId: top.id,
          toGoalName: top.name,
        });
      } else {
        b.surplus = r2(b.surplus + excess);
        sweeps.push({
          date: boundary.toISOString(),
          amount: excess,
          toGoalId: null,
          toGoalName: "unassigned",
        });
      }
    }
    snapshot(boundary);
  };

  let cursor: Date | null =
    events.length > 0 ? startOfWeek(parseISO(events[0].date)) : null;

  const advanceTo = (target: Date) => {
    if (!cursor) return;
    let next = addDays(cursor, 7);
    while (next.getTime() <= target.getTime()) {
      cursor = next;
      crossWeekBoundary(cursor);
      next = addDays(cursor, 7);
    }
  };

  for (const e of events) {
    advanceTo(parseISO(e.date));
    applyEvent(b, e);
  }
  advanceTo(now);
  snapshot(now);

  /* ------------- rollups from final buckets ------------- */

  let provisionsTotal = 0;
  let tiedTotal = 0;
  for (const [id, bal] of Object.entries(b.goals)) {
    const g = goalById.get(id);
    if (!g || bal <= 0) continue;
    if (g.kind === "provision") provisionsTotal += bal;
    else tiedTotal += bal;
  }
  provisionsTotal = r2(provisionsTotal);
  tiedTotal = r2(tiedTotal);

  const reserveTarget = reserveTargetOf(s);
  const floor = floorOf(s);
  const accessible = r2(Math.min(b.reserve, s.accessibleMonths * s.livingExpensesMonthly));
  const deep = r2(b.reserve - accessible);

  /* average monthly income over the trailing 90 days (or actual span if shorter) */
  const cutoff = new Date(now.getTime() - 90 * DAY_MS);
  let incomeSum = 0;
  let firstIncome: Date | null = null;
  for (const e of events) {
    if (e.type !== "income") continue;
    const d = parseISO(e.date);
    if (!firstIncome) firstIncome = d;
    if (d.getTime() >= cutoff.getTime()) incomeSum += e.amount;
  }
  let avgMonthlyIncome = 0;
  if (firstIncome) {
    const spanDays = Math.min(
      90,
      Math.max(14, (now.getTime() - firstIncome.getTime()) / DAY_MS)
    );
    avgMonthlyIncome = r2(incomeSum / (spanDays / MONTH_DAYS));
  }

  /* this week's Regular */
  const weekStart = startOfWeek(now);
  let weekSpent = 0;
  for (const e of events) {
    if (e.type === "spend" && parseISO(e.date).getTime() >= weekStart.getTime()) {
      weekSpent += e.amount;
    }
  }
  weekSpent = r2(weekSpent);
  // The spend-game countdown: this week's allowance minus this week's spends,
  // never more than what the wallet actually holds.
  const regularRemaining = r2(
    Math.max(0, Math.min(b.regular, s.regularWeekly - weekSpent))
  );

  const cashTotal = cashOf(b);
  const assetsTotal = assetsAt(now);

  /* receivables — never liquid; counted in net worth at a haircut only */
  const receivableOutstanding: Record<string, number> = {};
  let receivablesFullValue = 0;
  let receivablesWeighted = 0;
  for (const [id, out] of Object.entries(b.recv)) {
    const rec = recvById.get(id);
    if (!rec || out <= 0 || rec.status === "written_off") continue;
    receivableOutstanding[id] = out;
    receivablesFullValue += out;
    receivablesWeighted += out * confidenceWeight(rec.confidence, s);
  }
  receivablesFullValue = r2(receivablesFullValue);
  receivablesWeighted = r2(receivablesWeighted);

  return {
    reserve: b.reserve,
    accessible,
    deep,
    floor,
    reserveTarget,
    regularWallet: b.regular,
    surplusHeld: b.surplus,
    goalBalances: b.goals,
    provisionsTotal,
    tiedTotal,
    receivableOutstanding,
    receivablesFullValue,
    receivablesWeighted,
    cashTotal,
    assetsTotal,
    // Receivables raise net worth (at a haircut) but never liquidity.
    netWorth: r2(cashTotal + assetsTotal + receivablesWeighted),
    netWorthIfAllRepaid: r2(cashTotal + assetsTotal + receivablesFullValue),
    liquidWorth: r2(b.reserve + b.regular + b.surplus + provisionsTotal),
    givenTotal: b.given,
    // Liquidity feelings deliberately exclude receivables.
    availableToday: r2(regularRemaining + b.surplus),
    accessibleIfNeeded: accessible,
    protectedTotal: r2(deep + provisionsTotal + tiedTotal + assetsTotal),
    runwayMonths:
      s.livingExpensesMonthly > 0 ? b.reserve / s.livingExpensesMonthly : 0,
    inRecovery: b.recovery,
    avgMonthlyIncome,
    weekStart,
    weekSpent,
    regularRemaining,
    history,
    sweeps,
  };
}
