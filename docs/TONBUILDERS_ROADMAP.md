# TON Builders -> Testnet -> Mainnet Roadmap

## Phase 1: Packaging (now)

- Keep one canonical testnet contract and one canonical frontend.
- Keep deployment history in `docs/deployments/testnet.md`.
- Keep secrets only in local `.env.local` (never in git).

## Phase 2: TON Builders Registration Prep

- Prepare short project card:
  - Name: TNFT Finance
  - One-line value proposition
  - Testnet contract address
  - Demo frontend (screenshots + short video)
- Prepare public repo README with:
  - Architecture
  - Threat model summary
  - Test instructions

## Phase 3: Testnet Soak

- Run repeated borrower cycle checks:
  - `OPEN -> FUNDED -> REPAID`
  - stale oracle rejection
  - LTV rejection
  - pause mode behavior
- Track tx hashes per run in deployment notes.

## Phase 4: Mainnet Gate (only after soak)

- Freeze MVP scope.
- Security review + final checklist from `docs/PRE_MAINNET_SECURITY_CHECKLIST.md`.
- Dry-run release checklist:
  - clean git status
  - tests green
  - no secret leaks
  - deployment parameters locked
