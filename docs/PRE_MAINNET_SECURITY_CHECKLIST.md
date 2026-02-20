# TNFTFi Pre-Mainnet Security Checklist

Version: 0.1  
Date: 2026-02-20  
Rule: no mainnet launch until all `BLOCKER` items are done.

## How we use this file
- `Owner`: who executes (`VAL` or `CODEX` or `BOTH`).
- `Evidence`: link/file/screenshot proving completion.
- `If skipped`: what to do immediately.

## BLOCKER Gate
- [ ] Threat model written and approved (`Owner: BOTH`)  
  Evidence: `docs/security/threat-model.md`  
  If skipped: stop development changes and finalize threat model first.
- [ ] Spec single source of truth fixed (`Owner: BOTH`)  
  Evidence: `TNFTFi_SAFE_SPEC_v0.1.md` updated and signed off  
  If skipped: freeze new features; resolve contradictions in parameters.
- [ ] All critical math uses safe rounding policy (`Owner: CODEX`)  
  Evidence: tests + code refs  
  If skipped: block deploy; patch math and retest.
- [ ] Oracle fail-closed implemented (`Owner: CODEX`)  
  Evidence: unit tests for stale/missing price  
  If skipped: block borrow entrypoints.
- [ ] Isolated pools enforced (`Owner: CODEX`)  
  Evidence: integration tests showing pool isolation  
  If skipped: block release.
- [ ] Liquidation invariants tested (`Owner: CODEX`)  
  Evidence: test report + edge-case suite  
  If skipped: block release.
- [ ] Access control via multisig + timelock (`Owner: VAL`)  
  Evidence: wallet setup screenshots + tx policy file  
  If skipped: no privileged deployment allowed.
- [ ] External audit completed on frozen commit (`Owner: VAL`)  
  Evidence: audit PDF + commit hash  
  If skipped: no mainnet.

## High Priority (must be done before public beta)
- [ ] CI runs unit/integration tests on each commit (`Owner: CODEX`)  
  Evidence: CI config + passing run URL  
  If skipped: no merge to main.
- [ ] Fuzz/property tests for solvency and accounting (`Owner: CODEX`)  
  Evidence: test artifacts  
  If skipped: restrict to private testnet only.
- [ ] Incident response runbook (`Owner: BOTH`)  
  Evidence: `docs/security/incident-runbook.md`  
  If skipped: no TVL onboarding.
- [ ] Monitoring and alerts for abnormal outflows (`Owner: CODEX`)  
  Evidence: alert rules + test alerts  
  If skipped: keep protocol paused for deposits.
- [ ] Dependency lock and integrity checks (`Owner: CODEX`)  
  Evidence: lockfiles + verify script  
  If skipped: block production build.

## Operations and Key Safety
- [ ] Hardware wallets for all signers (`Owner: VAL`)  
  Evidence: signer inventory (no seed phrases)  
  If skipped: do not sign privileged tx.
- [ ] 2-person review for privileged tx (`Owner: VAL`)  
  Evidence: signed review log per tx  
  If skipped: cancel tx.
- [ ] Human-readable transaction decode before signing (`Owner: VAL`)  
  Evidence: decode screenshot/log attached to tx record  
  If skipped: cancel tx.
- [ ] No unlimited approvals in production (`Owner: CODEX`)  
  Evidence: approval policy tests  
  If skipped: revoke approvals and patch.

## Testnet Readiness
- [ ] Reproducible deploy script (`Owner: CODEX`)  
  Evidence: `scripts/deploy-testnet.*` + run log  
  If skipped: no testnet redeploy.
- [ ] Published testnet addresses and tx hashes (`Owner: VAL`)  
  Evidence: `docs/deployments/testnet.md`  
  If skipped: no public demo.
- [ ] End-to-end flow tested in TMA (`Owner: BOTH`)  
  Evidence: checklist with borrower/lender scenarios  
  If skipped: no external user testing.

## Mainnet Go/No-Go
- [ ] All BLOCKER items complete (`Owner: BOTH`)
- [ ] No open `CRITICAL` and no open `HIGH` (`Owner: BOTH`)
- [ ] Final sign-off meeting note saved (`Owner: BOTH`)

If any item above is unchecked: decision is automatically `NO-GO`.

