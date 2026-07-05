/**
 * The Feasibility Meter — the app as honest advisor.
 *
 * For each accumulating goal we compare its required $/month (remaining ÷
 * months left) against what the split would actually send it at the user's
 * real average income. Three states:
 *
 *   on_track — base contributions hit the date.
 *   stretch  — only closes if surplus keeps flowing; the assumption is shown.
 *   wishful  — the math doesn't close. We never just declare it: we invert
 *              the equation and say what income (or what date) would make it real.
 */

import type { AppData, Goal } from "../types";
import type { Derived } from "./replay";
import { computeSplit, monthlyNeed } from "./split";
import {
  MONTH_DAYS,
  DAY_MS,
  addDays,
  clampMin0,
  monthsBetween,
  parseISO,
  r2,
} from "../lib/util";

export type FeasibilityState = "on_track" | "stretch" | "wishful" | "funded";

export interface Feasibility {
  goal: Goal;
  balance: number;
  remaining: number;
  progressPct: number;
  requiredMonthly: number;
  /** Expected $/month from the split alone (no surplus). */
  expectedMonthly: number;
  /** Expected $/month including surplus sweeps this goal receives. */
  expectedWithSurplus: number;
  state: FeasibilityState;
  /** Projected completion at current pace (null if pace is ~zero). */
  projectedDate: Date | null;
  /** Wishful only: income that would make the date real. */
  neededMonthlyIncome: number | null;
  /** Wishful only: the date that current pace actually supports. */
  achievableDate: Date | null;
}

export function assessGoals(
  data: AppData,
  d: Derived,
  now: Date = new Date()
): Feasibility[] {
  const active = data.goals.filter(
    (g) => g.status === "active" && g.kind === "accumulating"
  );
  if (active.length === 0) return [];

  // Simulate one typical month of income through the current rules.
  const avg = d.avgMonthlyIncome;
  const sim = avg > 0 ? computeSplit(avg, data.settings, data.goals, d, now) : null;

  return active.map((goal) => {
    const balance = d.goalBalances[goal.id] ?? 0;
    const remaining = clampMin0(r2(goal.target - balance));
    const progressPct = goal.target > 0 ? Math.min(100, (balance / goal.target) * 100) : 100;
    const requiredMonthly = monthlyNeed(goal, balance, now);

    let expectedMonthly = 0;
    let surplusShare = 0;
    if (sim) {
      expectedMonthly = sim.goals.find((a) => a.goalId === goal.id)?.amount ?? 0;
      if (sim.surplusTarget === "top_goal" && sim.surplusGoalId === goal.id) {
        surplusShare = sim.surplus;
      }
    }
    const expectedWithSurplus = r2(expectedMonthly + surplusShare);

    if (remaining === 0) {
      return {
        goal, balance, remaining, progressPct: 100,
        requiredMonthly: 0, expectedMonthly, expectedWithSurplus,
        state: "funded" as const, projectedDate: null,
        neededMonthlyIncome: null, achievableDate: null,
      };
    }

    const paceMonths =
      expectedWithSurplus > 1 ? remaining / expectedWithSurplus : Infinity;
    const projectedDate = isFinite(paceMonths)
      ? addDays(now, paceMonths * MONTH_DAYS)
      : null;

    let state: FeasibilityState;
    // 5% grace so a goal a few dollars off isn't flapping between states.
    if (expectedMonthly >= requiredMonthly * 0.95) state = "on_track";
    else if (expectedWithSurplus >= requiredMonthly * 0.95) state = "stretch";
    else state = "wishful";

    // Goal flow scales ~linearly with income once fixed cuts are covered,
    // so scale average income by the shortfall ratio. Approximate, honest, ~.
    const neededMonthlyIncome =
      state === "wishful" && expectedWithSurplus > 1 && avg > 0
        ? r2(avg * (requiredMonthly / expectedWithSurplus))
        : null;

    return {
      goal, balance, remaining, progressPct,
      requiredMonthly, expectedMonthly, expectedWithSurplus,
      state, projectedDate,
      neededMonthlyIncome,
      achievableDate: state === "wishful" ? projectedDate : null,
    };
  });
}

/** Days until a provision is due (negative = overdue). */
export function daysUntilDue(goal: Goal, now: Date = new Date()): number {
  return Math.ceil((parseISO(goal.targetDate).getTime() - now.getTime()) / DAY_MS);
}

/** Fractional months until a date — for "drops your runway from 12 to 9.5" copy. */
export function monthsUntil(dateISO: string, now: Date = new Date()): number {
  return monthsBetween(now, parseISO(dateISO));
}
