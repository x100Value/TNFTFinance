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
- [ ] NFT escrow and transfer integration (placeholder collateral address only).

## C) Tests and Validation
- [x] Artifact sanity test (`tests/simple-test.js`).
- [x] Security-flow integration test (`tests/mvp-safety-check.ts`):
  - fail-closed oracle
  - stale oracle rejection
  - LTV rejection
  - repay during pause
  - overdue liquidation
  - timelock governance
  - cancel access control
- [x] Local compile + test pass.

## D) Testnet Ops
- [x] Reproducible deploy script (`scripts/deploy-testnet.ps1`).
- [x] Testnet address and tx recorded in `docs/deployments/testnet.md`.
- [x] Re-run deploy confirms idempotent behavior (already deployed guard).

## E) Security Checkpoints (Periodic)
- [x] Checkpoint 1 (design): no unauthorized state writes in funding/repay paths.
- [x] Checkpoint 2 (implementation): oracle freshness enforced before funding.
- [x] Checkpoint 3 (pre-deploy): timelock enforced before risk updates.

## F) Open Findings (Must be fixed before mainnet)
- `HIGH`: Collateral NFT is not escrowed by this MVP contract.
  - What can break: liquidation cannot actually seize collateral.
  - Attack/failure scenario: borrower can keep NFT while defaulting.
  - Minimal safe fix: add on-chain NFT lock/transfer integration and enforce ownership checks.
- `HIGH`: Admin is single wallet, not multisig + timelock governance.
  - What can break: privileged key compromise impacts protocol controls.
  - Attack/failure scenario: attacker changes risk params or oracle price updates.
  - Minimal safe fix: move ownership to multisig and keep timelock execution path.
- `MEDIUM`: Oracle source is centralized (single updater), no quorum.
  - What can break: incorrect pricing can block valid loans or allow unsafe ones.
  - Attack/failure scenario: stale/manipulated price accepted by privileged updater.
  - Minimal safe fix: add multi-source median + quorum checks before updates are accepted.
