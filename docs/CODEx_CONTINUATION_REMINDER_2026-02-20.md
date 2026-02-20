# Codex Continuation Reminder (2026-02-20)

If the session stops due to limits, continue from this file first.

## Current Testnet Baseline

- Active MVP contract: `EQDNj4-A8lILD6G3YXvEQWbMreziRuCGkbu2Tbb6xuPJjQUE`
- Owner wallet: `UQCQ4dGD-gm1VS7UkPZtvPZwmXzAUzokZ1HS551IcwQ_KYXA`
- Last full cycle result: `REPAID` (`status=2`)
- Key tx hashes:
  - `SetOraclePrice`: `f8a24de7b7927bcb9ff0b99823e0e030a17c03b9ae817c62d4ced0a1435a1117`
  - `FundLoan`: `b54e4689c69a54684f49ada8d0bfb841320b5980df7d02e9b305a3c57e6acf25`
  - `Repay`: `c53f4ef9a533dcc07212ec44126bcf9bf72e29f74eafb67c0a89cf7c19d021c8`

## Safety Rules (Do Not Skip)

- Never commit `.env.local`.
- Never commit mnemonic/seed/private keys.
- `docs/qr/` is local helper output only (ignored by git).
- Deploy guard is active: if sender wallet != `MVP_OWNER_ADDRESS`, deploy is blocked by default.
- Run checks before any new deploy:
  - `powershell -ExecutionPolicy Bypass -File scripts/scan-secrets.ps1`
  - `npm test` in `prototypes/tnftfinance-blueprint`

## Quick Verification Commands

1. Contract tx feed:
   - `Invoke-RestMethod "https://testnet.tonapi.io/v2/blockchain/accounts/EQDNj4-A8lILD6G3YXvEQWbMreziRuCGkbu2Tbb6xuPJjQUE/transactions?limit=5"`
2. Re-generate flow links (fresh oracle timestamp):
   - `node -r ts-node/register prototypes/tnftfinance-blueprint/scripts/printMvpFlowLinks.ts`

## Next Milestones

1. TonConnect actions in live UI (`SetOraclePrice`, `FundLoan`, `Repay`) with tx-status badges.
2. End-to-end smoke script for `OPEN -> FUNDED -> REPAID`.
3. Testnet soak period with repeated safety checks.
4. Mainnet checklist pass only after stable soak.
