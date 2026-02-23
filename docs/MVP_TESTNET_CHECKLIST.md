# TNFTFi MVP Testnet Checklist

Date: 2026-02-20  
Scope: testnet-only MVP for `NFTCollateralLoan` with safety-first controls.

## A) Security Gates
- [x] `scripts/scan-secrets.ps1` passes.
- [x] CI green (`secret scan`, `compile`, `tests`, `mini-app`).
- [x] Oracle fail-closed on loan funding.
- [x] Risk parameter changes protected by timelock.
- [x] Pause mechanism blocks new funding while allowing repay.
- [ ] Multisig owner on testnet (still single signer wallet).
- [ ] Oracle quorum (currently single trusted updater).

## B) Contract MVP Features
- [x] Loan lifecycle: `OPEN -> FUNDED -> REPAID/LIQUIDATED/CANCELLED`.
- [x] LTV check with protocol-favor rounding (`floor` on max borrow).
- [x] Overdue liquidation path.
- [x] Borrower cancel path before funding.
- [x] Getters for loan state and risk state.
- [x] Collateral lock guard for non-placeholder collateral (`ConfirmCollateralLocked` required before funding).
- [ ] NFT transfer custody is still external to loan contract (escrow release is workflow-managed).

## C) Tests and Validation
- [x] Artifact sanity test (`tests/simple-test.js`).
- [x] Security-flow integration test (`tests/mvp-safety-check.ts`):
  - fail-closed oracle
  - stale oracle rejection
  - LTV rejection
  - collateral lock guard
  - repay during pause
  - overdue liquidation
  - timelock governance
  - cancel access control
- [x] Full modular e2e test (`tests/prealpha-e2e-full-0.0.1.8.ts`) covering oracle + pool + reserve + escrow + auction + risk + loan flows.
- [x] Local compile + test pass.

## D) Testnet Ops
- [x] Reproducible deploy script (`scripts/deploy-testnet.ps1`).
- [x] Testnet address and tx recorded in `docs/deployments/testnet.md`.
- [x] Re-run deploy confirms idempotent behavior (already deployed guard).
- [x] Smoke runner script added (`npm run smoke:testnet` in `prototypes/tnftfinance-blueprint`).
- [x] Smoke dry run command documented (`SMOKE_DRY_RUN=true npm run smoke:testnet`).
- [x] Smoke full-run prerequisites documented (`MVP_CONTRACT_ADDRESS` must be `OPEN`, `TONCENTER_API_KEY` recommended).
- [x] Full testnet matrix runner added (`scripts/run-testnet-full-matrix.ps1`).

## E) Security Checkpoints (Periodic)
- [x] Checkpoint 1 (design): no unauthorized state writes in funding/repay paths.
- [x] Checkpoint 2 (implementation): oracle freshness enforced before funding.
- [x] Checkpoint 3 (pre-deploy): timelock enforced before risk updates.

## F) Open Findings (Must be fixed before mainnet)
- `HIGH`: Loan and escrow are not yet hard-wired by on-chain callbacks.
  - What can break: operator may run release flow out-of-sequence if off-chain orchestration is wrong.
  - Attack/failure scenario: escrow release is executed without direct on-chain proof from loan contract state transition.
  - Minimal safe fix: add escrow->loan lock callback and loan->escrow release commands with strict sender checks.
- `HIGH`: Admin is single wallet, not multisig + timelock governance.
  - What can break: privileged key compromise impacts protocol controls.
  - Attack/failure scenario: attacker changes risk params or oracle price updates.
  - Minimal safe fix: move ownership to multisig and keep timelock execution path.
- `MEDIUM`: Oracle source is centralized (single updater), no quorum.
  - What can break: incorrect pricing can block valid loans or allow unsafe ones.
  - Attack/failure scenario: stale/manipulated price accepted by privileged updater.
  - Minimal safe fix: add multi-source median + quorum checks before updates are accepted.
