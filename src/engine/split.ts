/**
 * The Split — the rules engine that divides every inflow, in strict priority:
 *
 *   1. Giving (tithe) — off the top, first, always, even in recovery.
 *   2. Reserve contribution — until the reserve target is met (then trickle/pause).
 *   3. Regular allowance top-up — sacred; funded before goals so a light month
 *      never starves the present. (Displayed after goals, per the canonical
 *      receipt order, but guaranteed here.)
 *   4. Goal contributions — split across active goals by their ideal monthly
 *      need, scaled to this inflow's share of a typical month.
 *   5. Surplus — swept per settings (top goal / reserve / hold).
 *
 * Recovery mode: the reserve takes recoveryReserveShare (default 80%) of the
 * flow that would have gone to goals; goals keep the heartbeat. Regular and
 * giving are untouched.
 *
 * The result is stored on the income event as fact — the receipt.
 */

import type { Goal, Settings, SplitResult } from "../types";
import type { Derived } from "./replay";
import { reserveTargetOf, topGoal } from "./replay";
import { clampMin0, monthsBetween, parseISO, r2 } from "../lib/util";

/** Ideal $/month for a goal: remaining amount spread over remaining months.
 *  A provision due inside a month needs its full remainder now. */
export function monthlyNeed(goal: Goal, balance: number, now: Date): number {
  const remaining = clampMin0(goal.target - balance);
  if (remaining === 0) return 0;
  const months = Math.max(monthsBetween(now, parseISO(goal.targetDate)), 1 / 4);
  return r2(remaining / months);
}

export function computeSplit(
  amount: number,
  settings: Settings,
  goals: Goal[],
  d: Derived,
  now: Date = new Date()
): SplitResult {
  const s = settings;
  let remaining = r2(amount);

  /* 1 — Giving, off the top, always. */
  const giving = r2(amount * (s.tithePercent / 100));
  remaining = r2(remaining - giving);

  /* 2 — Reserve. */
  const target = reserveTargetOf(s);
  const gap = clampMin0(r2(target - d.reserve));
  let reserve: number;
  if (gap > 0) {
    reserve = r2(Math.min(remaining, amount * (s.reservePercent / 100), gap));
  } else if (s.reserveFullBehavior === "trickle") {
    reserve = r2(Math.min(remaining, amount * (s.reserveTricklePercent / 100)));
  } else {
    reserve = 0;
  }
  remaining = r2(remaining - reserve);

  /* 3 — Regular top-up (sacred): keep the wallet funded for this week + next. */
  const walletTarget = s.regularWeekly * 2;
  const regular = r2(Math.min(remaining, clampMin0(walletTarget - d.regularWallet)));
  remaining = r2(remaining - regular);

  /* 4 — Goals: ideal monthly needs, scaled to this inflow's share of a month. */
  const active = goals.filter((g) => g.status === "active");
  const needs = active
    .map((g) => ({
      goal: g,
      monthly: monthlyNeed(g, d.goalBalances[g.id] ?? 0, now),
      remainingNeed: clampMin0(r2(g.target - (d.goalBalances[g.id] ?? 0))),
    }))
    .filter((n) => n.monthly > 0);

  const totalMonthly = needs.reduce((sum, n) => sum + n.monthly, 0);
  // What fraction of a typical month is this inflow? (≥ full month if income is sparse)
  const monthFraction =
    d.avgMonthlyIncome > 0 ? amount / Math.max(d.avgMonthlyIncome, amount) : 1;

  let goalPool = r2(Math.min(remaining, totalMonthly * monthFraction));

  /* Recovery: divert most of the goal flow to refill the reserve; keep a heartbeat. */
  let recoveryDiverted = 0;
  if (d.inRecovery && goalPool > 0) {
    const reserveRoom = clampMin0(r2(target - d.reserve - reserve));
    recoveryDiverted = r2(Math.min(goalPool * s.recoveryReserveShare, reserveRoom));
    goalPool = r2(goalPool - recoveryDiverted);
  }
  remaining = r2(remaining - goalPool - recoveryDiverted);

  /* Allocate the pool proportionally, capped at each goal's remaining need. */
  const goalAllocs: SplitResult["goals"] = [];
  let allocated = 0;
  if (goalPool > 0 && totalMonthly > 0) {
    for (const n of needs) {
      const share = r2(Math.min(goalPool * (n.monthly / totalMonthly), n.remainingNeed));
      if (share > 0) {
        goalAllocs.push({ goalId: n.goal.id, goalName: n.goal.name, amount: share });
        allocated += share;
      }
    }
  }
  allocated = r2(allocated);
  // Anything the caps or rounding left unallocated falls through to surplus.
  remaining = r2(remaining + (goalPool - allocated));

  /* 5 — Surplus. */
  let surplusTarget = s.surplusBehavior;
  let surplusGoalId: string | undefined;
  let surplusGoalName: string | undefined;
  if (surplusTarget === "top_goal") {
    const top = topGoal(goals);
    if (top) {
      surplusGoalId = top.id;
      surplusGoalName = top.name;
    } else {
      surplusTarget = "hold";
    }
  } else if (surplusTarget === "reserve" && gap <= 0) {
    surplusTarget = "hold"; // reserve is already full; don't overstuff it
  }

  /* Exactness check: force the pieces to sum to the inflow, remainder → surplus. */
  const surplus = r2(amount - giving - reserve - recoveryDiverted - regular - allocated);

  return {
    giving,
    reserve: r2(reserve + recoveryDiverted),
    recoveryDiverted,
    goals: goalAllocs,
    regular,
    surplus: clampMin0(surplus),
    surplusTarget,
    surplusGoalId,
    surplusGoalName,
    recovery: d.inRecovery,
  };
}
