# Sanitization Log (2026-02-20)

## Source Paths Used
- `C:\ton-projects\TNFT\contracts`
- `C:\ton-projects\tnftfinance`
- `C:\ton-projects\tnfi-mini-app`

## Removed/Excluded From Repo
- `wallet-data.json` (mnemonic dump)
- `generate-wallet.js` with hardcoded mnemonic
- `node_modules/`
- `build/` artifacts
- local helper junk files from mini app root (`.npm`, `install`, `react-router-dom`, empty `@twa-dev/sdk` file)

## Repaired For Baseline
- `prototypes/tnft-contracts/TNFiItem.tact` rewritten without BOM/invalid first line.
- `prototypes/tnfi-mini-app/package.json` recreated as valid JSON.
- `prototypes/tnfi-mini-app/tma-mock-loader.html` recreated as complete HTML.

## Safety Notes
- Keep real bot tokens/mnemonics only in local `.env.local` files (ignored by git).
- Run `scripts/scan-secrets.ps1` before each commit.
