# Regular — engineering reference

Single-user personal wealth OS. Tagline: **"Your affairs, in order."**
You set money rules once; every dollar of income is split automatically; your
only job is to live on a fixed weekly allowance. Calm, never-nags, private-
banking voice. This file is the map for future work — read it before changing
the engine.

## Stack & scripts

- **Vite + React 18 + TypeScript**, no framework backend.
- `npm run dev` (http://localhost:5173) · `npm run build` (tsc + vite) · `npm run typecheck`.
- Persistence: `localStorage` behind a tiny interface, with **optional Supabase**
  cloud sync + auth layered on top. No bank integrations — all money events are
  logged manually.
- Deploy: push to `main` → GitHub Actions (`.github/workflows/deploy.yml`) →
  GitHub Pages at **https://grantxdev.github.io/regular/**. Vite `base: "./"`.

## The one big idea: the ledger is the source of truth

`data.events` (the ledger) is the **only** record of money movement. Every
balance, layer, runway month, net-worth point, feasibility verdict, and report
is **recomputed from the ledger on every render** by replaying it. Nothing
derived is ever stored. Definitions (`settings`, `goals`, `assets`,
`receivables`, `debts`) are inputs; balances are outputs.

Consequence: to change how money behaves, change the **replay** and **split**
engines — never patch a stored balance. If a number looks wrong, it's a replay
bug, not stale data.

## Layout

```
src/
  types.ts          Data model, event union, DEFAULT_SETTINGS, DEFAULT_CATEGORIES, emptyData()
  storage.ts        localStorage load/save + JSON import/export + backfill of new fields
  cloud.ts          Supabase client, fetch/push document (optional; env-gated)
  store.tsx         React context: clone → mutate via actions → persist (+ debounced cloud push)
  seed.ts           Example data, built by replaying the REAL actions with backdated timestamps
  engine/
    replay.ts       deriveState(): ledger → every derived number (the heart)
    split.ts        computeSplit(): the rules engine that divides each inflow
    feasibility.ts  assessGoals(): on-schedule / with-discipline / underfunded + required-income
    actions.ts      Every mutation as a pure function on an AppData draft
  components/       One file per screen + shared pieces
  lib/util.ts       ids, money round/format (r2/fmt/fmtExact), date math (startOfWeek etc.)
  styles.css        Design system (mission-control dark; IBM Plex; gauge & allocation bar)
```

## Data model (`types.ts`)

- **Settings** — tithe %, reserve % + target (months × expenses + extra), floor,
  accessible months, `regularWeekly` (the allowance), surplus behavior, recovery
  weighting, vehicle depreciation, receivable confidence weights.
- **Goal** — `accumulating` (target + date, piles up as tied worth) or
  `provision` (money set aside for a due bill, optionally recurring).
- **Asset** — outside holdings; vehicles depreciate; "estimated" vs "verified".
- **Receivable** — money owed *to* me. A claim, **never liquid**. Counts toward
  net worth at a confidence haircut (certain/likely/hopeful weights).
- **Debt** — money *I* owe. A liability that **reduces net worth** by the
  outstanding amount until paid down.
- **LedgerEvent** (discriminated union on `type`): `income`, `spend`,
  `withdrawal` (layer: accessible/deep/surplus/goal; `allowance` + `weekOf` flag
  for weekly draws; `category` + `reason` note for accessible spending),
  `provision_paid`, `adjustment`, `recovery` (enter/exit), `asset`,
  `receivable_added` / `lend` / `receivable_repaid` / `receivable_writeoff`,
  `debt_added` / `debt_payment`.
- **PendingWithdrawal** — deep-reserve draws/loans wait 24h here before becoming
  events (reversible until confirmed). `lend` field marks a queued loan.

## The Split (`split.ts`)

Runs when income is logged; the result is stored on the income event as the
receipt. Priority waterfall:
1. **Giving** (tithe %) — off the top, always first, even in recovery.
2. **Reserve** (reserve % of inflow, capped at the gap to target; trickle/pause
   when full).
3. **Regular allowance** top-up (funded before goals so a light month never
   starves the present).
4. **Goals** — split by each goal's ideal monthly need, scaled to the inflow's
   share of an average month.
5. **Surplus** — swept to top goal / reserve / held, per settings.

**Recovery mode**: entered when the deep reserve is tapped. The split diverts
~80% of the goal flow to refill the reserve; goals keep a heartbeat; giving and
the allowance are untouched. Exits automatically (appends a `recovery` exit
event) when the reserve refills.

## The reserve is TWO real buckets (important)

`replay.ts` tracks **`acc`** (accessible) and **`deep`** separately — not a
single reserve sliced by `min()`. Income fills accessible up to its cap
(`accessibleMonths × monthlyExpenses`), then overflows to deep. Withdrawals hit
the bucket they target and **stick** (accessible does NOT silently refill from
deep). This is what makes "take the weekly allowance → Accessible if needed
drops, and by week two it's two weeks lighter" true. `reserve = acc + deep`, so
the invariant `deep = reserve − accessible` still holds for old assumptions.

- **Weekly allowance** = a per-week draw from accessible (`takeWeeklyAllowance`,
  tagged `allowance` + `weekOf`). Taking it spends the money (net worth drops).
- **Accessible withdrawals** carry a prefilled **category** + optional note.
- **Deep withdrawals** enforce the **Floor** (`max(floorMonths×expenses,
  floorAmount)` can never leave) and a **24h cooldown** (pending → confirm).

## Net worth composition

`netWorth = cash (acc+deep+regular+surplus+goals) + assets(with depreciation)
+ receivablesWeighted − debtsOutstanding`.
`netWorthIfAllRepaid` uses full receivable value (no haircut). History points
are snapshots computed the same way at each week boundary. Week-end sweeps of
unspent Regular are **derived** during replay (shown as `sweep · auto` in the
ledger), not stored.

## Screens

- **Console** — hero net worth (+ "if all debts repaid", weekly allowance &
  accessible as secondary text), Money in / Money out actions, net-worth chart,
  reserve **gauge** (red→green), **allocation bar** (hover to read), objectives
  strip, calm overdue-receivable line.
- **Money in** — fast income logging + live split receipt; optional discretionary
  spend log.
- **Goals** — Objectives (feasibility), Provisions (set-aside bills, settle/
  renew), **Debts** (owe → pay down).
- **Vault** — the four layers + doors; accessible uses the shared category
  withdrawal + take-allowance flow; deep door has the cooldown + Floor.
- **Assets** — outside holdings + **Receivables** (lend / repay / write-off).
- **Reports** — earned & out by month, spending by category, performance figures.
- **Ledger** — full searchable record; income/repayment rows open their receipt.
- **Rules** — "standing instructions"; edit is deliberate (unlock to amend);
  manual adjustments; JSON export/import; wipe/load sample data; replay tour.

## Cloud sync & auth (`cloud.ts`, `store.tsx`)

Optional and env-gated: if `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are
absent, the app runs local-only with no login. When present, `Login.tsx` gates
the app; the whole `AppData` document is stored as one row per user in a
`documents` table (RLS: each user sees only their row — see
`supabase/migrations/0001_documents.sql`). Sync is last-write-wins, debounced;
localStorage stays as the offline cache. Keys are public by design (RLS
enforces access) and are set as GitHub repo variables for the Pages build.

## Conventions & gotchas

- **All mutations go through `actions.ts`** on a cloned draft; the store persists.
  The seed replays the same actions with backdated timestamps, so example data
  obeys the exact same rules as real life.
- **Money math funnels through `r2()`** (round to cents). Format with `fmt`
  (whole dollars) / `fmtExact` (cents).
- **Voice**: calm declaratives, short sentences, understatement, no exclamation
  points, no cheerleading. Use the "marble" register (e.g. "Everything is where
  it should be.") sparingly — mostly just show numbers.
- **New `AppData` fields must be backfilled** in `storage.ts` (both `load` and
  `validateImport`) and added to `emptyData()`.
- **`applyEvent` needs the accessible cap** passed in — keep new reserve-touching
  events consistent with the two-bucket model.
- When adding a `LedgerEvent` type: extend the union, handle it in `applyEvent`
  (replay), render it in `Ledger.tsx`, and (usually) add an action.
- Verify engine changes by replaying, not by inspecting stored balances. There
  are ad-hoc replay tests written during development (scratchpad) worth
  recreating under `src` if you formalize testing.
