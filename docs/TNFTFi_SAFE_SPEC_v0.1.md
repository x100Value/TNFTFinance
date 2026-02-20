# TNFTFi Safe Spec v0.1

Date: 2026-02-20  
Status: Draft for implementation (single safe baseline)

## 1) Scope v1
- Product: NFT-collateralized loans in Telegram Mini App.
- Chain: TON.
- Borrow asset: only one stable asset in v1 (`USDT`).
- Collateral: only allowlisted NFT collections.
- Pool model: isolated pool per collection (no shared risk basket).

## 2) Golden Architecture Decisions
- Liquidation only by collateral risk and overdue status, not by social/behavior score.
- Credit score may affect future limits/rates, but never instant liquidation trigger.
- Oracle is multi-source with freshness checks; stale data blocks new borrowing.
- Protocol fees and debt accounting are in `USDT` (not in volatile governance token).

## 3) Safe Risk Parameters (v1 baseline)
- `MAX_LTV_OPEN = 35%`
- `LTV_MARGIN_CALL = 50%`
- `LTV_LIQUIDATION = 55%`
- `LTV_EMERGENCY_PAUSE = 65%` (new loans paused for this pool)
- `MAX_LOAN_TERM = 30 days`
- `ORACLE_HEARTBEAT_MAX_AGE = 10 minutes`
- `ORACLE_QUORUM = 2 of 3`
- `POOL_CAP_PER_COLLECTION` and `MAX_LOAN_PER_USER` must be hard-limited on-chain

## 4) Oracle Rules
- Sources: at least 3 independent sources per collection.
- Price used: median of valid sources.
- Data validity: source ignored if stale or outlier beyond configured deviation.
- Fail mode: if quorum missing, block `newLoan`, allow only repay/add collateral.

## 5) Liquidation Model
- Trigger: `LTV >= LTV_LIQUIDATION` OR loan overdue.
- Step 1: margin call window.
- Step 2: dutch auction liquidation.
- Step 3: if auction deficit exists, cover from insurance reserve/backstop.
- Bad debt must never be silently socialized across unrelated pools.

## 6) Fee Model (safe baseline)
- Origination fee in `USDT`.
- Interest in `USDT`.
- Liquidation penalty in `USDT`.
- Governance token buyback (if used) only from realized protocol revenue, off core debt path.

## 7) Rounding Policy (mandatory)
- Collateral valuation: round down.
- Debt accrual: round up.
- Protocol fee calculations: round up.
- Payouts to users: round down.
- Dust/remainder: move to protocol reserve.

## 8) Access Control and Governance
- Admin actions only via multisig.
- Risk parameter changes only via timelock (`24-48h`).
- Emergency pause allowed for borrow/open/rollover.
- Repay and collateral top-up should remain available in pause mode.

## 9) Security Invariants (must hold in tests)
- Total liabilities never exceed recoverable assets + reserves under configured haircuts.
- User collateral cannot be withdrawn while debt is active.
- No unauthorized oracle/admin write path.
- Pool isolation: one pool insolvency does not mutate balances of another pool.

## 10) Release Gates (before mainnet)
- Unit + integration tests for all critical flows.
- Property/invariant tests for solvency and accounting.
- Fuzz tests for rounding, liquidation, and edge arithmetic.
- External audit passed on frozen commit hash.
- Testnet run with published contract addresses and reproducible deploy script.

## 11) Immediate Build Plan
- Step A: finalize this spec as single source of truth.
- Step B: implement minimal contracts (`CollateralLoan`, `LiquidityPool`, oracle adapter).
- Step C: write tests for liquidation and rounding first.
- Step D: deploy to testnet and publish artifacts.

