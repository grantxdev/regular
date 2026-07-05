/**
 * Regular — core data model.
 *
 * Design rule: the ledger (events) is the source of truth for every balance.
 * Settings, goal definitions, and asset records are *inputs*; every derived
 * number (layer balances, net worth, runway, feasibility) is recomputed from
 * the ledger on every render. Nothing derived is ever stored.
 */

export type Screen =
  | "console"
  | "money-in"
  | "goals"
  | "vault"
  | "assets"
  | "ledger"
  | "rules";

/* ------------------------------------------------------------------ */
/* Settings — "these are your laws"                                    */
/* ------------------------------------------------------------------ */

export interface Settings {
  currencySymbol: string;
  /** % of every inflow, off the top, first, always — even in recovery. */
  tithePercent: number;
  /** % of every inflow routed to the reserve until the target is met. */
  reservePercent: number;
  /** Reserve target = reserveTargetMonths × livingExpenses + reserveTargetExtra. */
  reserveTargetMonths: number;
  reserveTargetExtra: number;
  /** When the reserve is full: keep a small trickle flowing, or pause entirely. */
  reserveFullBehavior: "trickle" | "pause";
  reserveTricklePercent: number;
  /** How many months of expenses sit behind the light "accessible" door. */
  accessibleMonths: number;
  /** The Floor: max(floorMonths × expenses, floorAmount) can never be withdrawn. */
  floorMonths: number;
  floorAmount: number;
  livingExpensesMonthly: number;
  /** The Regular — fixed weekly allowance. Sacred. */
  regularWeekly: number;
  /** false = unspent Regular sweeps to the top goal at week's end; true = rolls over. */
  regularRollover: boolean;
  /** Where leftover money goes after the split. */
  surplusBehavior: "top_goal" | "reserve" | "hold";
  /** In recovery mode, this share of the normal goal flow refills the reserve (rest keeps the heartbeat). */
  recoveryReserveShare: number;
  /** Annual depreciation applied to vehicle assets so the number never quietly lies. */
  vehicleDepreciationRate: number;
  /** Confidence-weighted haircuts for receivables' contribution to net worth (0–1). */
  receivableWeightCertain: number;
  receivableWeightLikely: number;
  receivableWeightHopeful: number;
}

/* ------------------------------------------------------------------ */
/* Goals — two species                                                 */
/* ------------------------------------------------------------------ */

export type GoalKind = "accumulating" | "provision";
export type Recurrence = "monthly" | "quarterly" | "yearly";

export interface Goal {
  id: string;
  kind: GoalKind;
  name: string;
  target: number;
  /** Target date for accumulating goals; due date for provisions. ISO yyyy-mm-dd. */
  targetDate: string;
  /** 1 = top priority. Top goal receives surplus sweeps. */
  priority: number;
  /** Provisions only — recurring ones auto-recreate on payment. */
  recurrence: Recurrence | null;
  status: "active" | "done";
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Outside assets                                                      */
/* ------------------------------------------------------------------ */

export type AssetCategory =
  | "vehicle"
  | "savings"
  | "investment"
  | "crypto"
  | "property"
  | "other";

export interface Asset {
  id: string;
  name: string;
  category: AssetCategory;
  /** Value as typed by the user, at lastUpdated. Vehicles depreciate from here. */
  value: number;
  lastUpdated: string; // ISO datetime
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Receivables — money owed to me. A claim, NEVER cash.                */
/*                                                                     */
/* A receivable never counts as liquid: it never appears in "Available */
/* today" or "Accessible if needed" and never affects runway. It DOES  */
/* count toward net worth, at a confidence-weighted haircut.           */
/* ------------------------------------------------------------------ */

export type Confidence = "certain" | "likely" | "hopeful";

export interface Receivable {
  id: string;
  person: string;
  /** Original principal claimed. Outstanding is derived from the ledger. */
  amount: number;
  /** Optional expected repayment date, ISO yyyy-mm-dd. */
  expectedDate: string | null;
  note: string;
  confidence: Confidence;
  status: "active" | "repaid" | "written_off";
  createdAt: string;
}

/** Where a loan is funded from when converting cash into a receivable. */
export type LendLayer = "accessible" | "deep" | "surplus" | "regular" | "goal";

/* ------------------------------------------------------------------ */
/* The Split — computed at income time, stored as fact on the event    */
/* ------------------------------------------------------------------ */

export interface GoalAllocation {
  goalId: string;
  goalName: string;
  amount: number;
}

export interface SplitResult {
  giving: number;
  /** Includes any recovery-mode diversion (recoveryDiverted is the informational part). */
  reserve: number;
  recoveryDiverted: number;
  goals: GoalAllocation[];
  regular: number;
  surplus: number;
  surplusTarget: "top_goal" | "reserve" | "hold";
  surplusGoalId?: string;
  surplusGoalName?: string;
  /** Was recovery mode active when this split ran? */
  recovery: boolean;
}

/* ------------------------------------------------------------------ */
/* Ledger events                                                       */
/* ------------------------------------------------------------------ */

interface BaseEvent {
  id: string;
  /** ISO datetime */
  date: string;
}

export interface IncomeEvent extends BaseEvent {
  type: "income";
  amount: number;
  source: string;
  split: SplitResult;
}

/** Optional spend-game entry against this week's Regular. */
export interface SpendEvent extends BaseEvent {
  type: "spend";
  amount: number;
}

export type WithdrawLayer = "accessible" | "deep" | "surplus" | "goal";

export interface WithdrawalEvent extends BaseEvent {
  type: "withdrawal";
  amount: number;
  layer: WithdrawLayer;
  goalId?: string;
  goalName?: string;
  reason: string;
}

export interface ProvisionPaidEvent extends BaseEvent {
  type: "provision_paid";
  goalId: string;
  goalName: string;
  amount: number;
}

/** Manual +/- correction on any bucket. Life is messy; the reason is logged. */
export interface AdjustmentEvent extends BaseEvent {
  type: "adjustment";
  target: "reserve" | "surplus" | "regular" | "goal";
  goalId?: string;
  goalName?: string;
  amount: number; // signed
  reason: string;
}

export interface RecoveryEvent extends BaseEvent {
  type: "recovery";
  direction: "enter" | "exit";
}

export interface AssetEvent extends BaseEvent {
  type: "asset";
  action: "added" | "updated" | "removed";
  assetId: string;
  name: string;
  category: AssetCategory;
  value: number;
  reason?: string;
}

/* ---- receivables ---- */

/** A claim recorded with no cash movement (someone already owed you). */
export interface ReceivableAddedEvent extends BaseEvent {
  type: "receivable_added";
  receivableId: string;
  person: string;
  amount: number;
  confidence: Confidence;
}

/** "Lend money" — cash leaves a layer and becomes a receivable. Net worth flat. */
export interface LendEvent extends BaseEvent {
  type: "lend";
  receivableId: string;
  person: string;
  amount: number;
  layer: LendLayer;
  goalId?: string;
  goalName?: string;
  confidence: Confidence;
  reason: string;
}

/** Repayment (full or partial): money enters the Bucket via the standard Split. */
export interface ReceivableRepaidEvent extends BaseEvent {
  type: "receivable_repaid";
  receivableId: string;
  person: string;
  amount: number;
  split: SplitResult;
  /** True when repaying a debt that was previously written off. */
  wasWrittenOff?: boolean;
}

/** Dignified write-off: removes the outstanding claim from net worth, logged. */
export interface ReceivableWriteoffEvent extends BaseEvent {
  type: "receivable_writeoff";
  receivableId: string;
  person: string;
  amount: number; // outstanding written off
  reason: string;
}

export type LedgerEvent =
  | IncomeEvent
  | SpendEvent
  | WithdrawalEvent
  | ProvisionPaidEvent
  | AdjustmentEvent
  | RecoveryEvent
  | AssetEvent
  | ReceivableAddedEvent
  | LendEvent
  | ReceivableRepaidEvent
  | ReceivableWriteoffEvent;

/* ------------------------------------------------------------------ */
/* Deep-reserve withdrawals wait 24h here before becoming events        */
/* ------------------------------------------------------------------ */

export interface PendingWithdrawal {
  id: string;
  createdAt: string;
  amount: number;
  reason: string;
  /** Earliest moment the user may confirm (createdAt + 24h). */
  confirmAfter: string;
  /** When present, confirming this creates a receivable (a deep-reserve loan). */
  lend?: {
    person: string;
    expectedDate: string | null;
    note: string;
    confidence: Confidence;
  };
}

/* ------------------------------------------------------------------ */
/* Root persisted document                                             */
/* ------------------------------------------------------------------ */

export interface AppData {
  version: 1;
  settings: Settings;
  goals: Goal[];
  assets: Asset[];
  receivables: Receivable[];
  events: LedgerEvent[];
  pendingWithdrawals: PendingWithdrawal[];
  /** Saved, reusable income source labels. */
  incomeSources: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  currencySymbol: "$",
  tithePercent: 10,
  reservePercent: 15,
  reserveTargetMonths: 12,
  reserveTargetExtra: 10000,
  reserveFullBehavior: "trickle",
  reserveTricklePercent: 2,
  accessibleMonths: 1,
  floorMonths: 3,
  floorAmount: 5000,
  livingExpensesMonthly: 2400,
  regularWeekly: 200,
  regularRollover: false,
  surplusBehavior: "top_goal",
  recoveryReserveShare: 0.8,
  vehicleDepreciationRate: 0.15,
  receivableWeightCertain: 1.0,
  receivableWeightLikely: 0.7,
  receivableWeightHopeful: 0.3,
};

export function emptyData(settings?: Settings): AppData {
  return {
    version: 1,
    settings: settings ?? { ...DEFAULT_SETTINGS },
    goals: [],
    assets: [],
    receivables: [],
    events: [],
    pendingWithdrawals: [],
    incomeSources: [],
  };
}
