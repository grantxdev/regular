# Regular — never not saving

A single-user personal wealth operating system. Set your rules once, calmly;
from then on every dollar that enters is split automatically, and your only
job is to live on a fixed weekly allowance (your **Regular**). Ignore it for
two weeks and nothing breaks.

## Run it

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build → dist/
```

First launch seeds example data so you can feel it immediately — wipe it with
one click under **Rules → Wipe example data**.

## Architecture

- **Stack:** Vite + React + TypeScript. No backend; data persists in
  `localStorage` behind a tiny load/save interface ([src/storage.ts](src/storage.ts))
  so a real backend + auth can be added later without touching anything else.
  Full JSON export/import lives in **Rules** and **Ledger**.
- **The ledger is the source of truth.** Every balance, runway month, and
  feasibility verdict is recomputed from the event log on every render —
  nothing derived is ever stored. See [src/engine/replay.ts](src/engine/replay.ts).
- **The Split** ([src/engine/split.ts](src/engine/split.ts)) runs when income is
  logged and is stored on the event as fact — the receipt. Priority: giving →
  reserve → Regular top-up (sacred; funded before goals so it never starves) →
  goals (scaled to the inflow's share of an average month) → surplus.
- **Actions** ([src/engine/actions.ts](src/engine/actions.ts)) are the only way
  the document changes. The seed generator replays the same actions with
  backdated timestamps, so example data obeys the same laws as real life.
- **Vault layers** are views over the same reserve balance: accessible =
  first N months of expenses, deep = the rest, the Floor = a hard block at
  max(final months, final amount). Deep withdrawals wait 24h as *pending*
  (reversible) before becoming ledger events, and entering recovery mode.
- **Recovery mode** is a pair of ledger events (enter on deep withdrawal
  confirm, exit appended automatically when the reserve refills). While
  active, the split diverts ~80% of the goal flow to the reserve; goals keep a
  heartbeat; giving and Regular are untouched.
- **Week-end sweeps** of unspent Regular are deterministic, so they are
  derived during replay and shown in the ledger as `sweep · auto` rows rather
  than stored.

## Files

```
src/
  types.ts             data model + defaults
  storage.ts           persistence (swap me to add a backend)
  seed.ts              example data via the real action layer
  store.tsx            React store: clone → mutate → persist
  engine/
    replay.ts          ledger → every derived number
    split.ts           the rules engine
    feasibility.ts     on track / stretch / wishful + inversion
    actions.ts         all mutations
  components/          one file per screen + shared pieces
```
