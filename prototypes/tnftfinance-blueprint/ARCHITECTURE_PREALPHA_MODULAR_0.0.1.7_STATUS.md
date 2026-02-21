# TNFTFi Prealpha Modular 0.0.1.7 Contract Modules

Date: 2026-02-21  
Status: compiled, not yet fully orchestrated end-to-end

## Added modules
- `contracts/TNFTCollateralEscrow.tact`
  - Collateral lock/release state machine for loan lifecycle.
- `contracts/TNFTLiquidationAuction.tact`
  - Public auction with bid replacement and settlement waterfall.
- `contracts/TNFTReserveBackstopVault.tact`
  - Reserve/backstop balances + bad debt tracking + authorized coverage requests.
- `contracts/TNFTLiquidityPool.tact`
  - LP deposits with lock tiers, LP rewards accounting, borrow/repay gateway for loan manager.
- `contracts/TNFTOracleQuorum.tact`
  - 3-source oracle quorum with deviation filter and optional fallback.
- `contracts/TNFTRiskMultisig.tact`
  - 2-of-3 timelocked risk parameter governance.

## Current production path
- Legacy MVP flow remains in:
  - `contracts/n_f_t_collateral_loan.tact`
- Existing MVP tests remain green:
  - `tests/mvp-safety-check.ts`

## What is still needed to go full protocol
1. Add `LoanCorePrealphaModular_0_0_1_7` orchestrator contract to wire all modules.
2. Add integration tests covering:
   - borrow/repay with pool accounting,
   - liquidation with reserve/backstop coverage,
   - oracle quorum failure modes,
   - multisig risk update flow.
3. Freeze deploy graph and register addresses in deployment manifest.
