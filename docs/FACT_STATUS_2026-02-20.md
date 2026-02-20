# TNFTFi Fact Status (2026-02-20)

## Confirmed State
- `C:\Users\Вал\Desktop\TNFTFi` contains documentation only (plus planning markdown files).
- `https://github.com/x100Value/TNFTFinance` has `0` commits (empty remote).
- Real working directories exist outside Desktop:
  - `C:\ton-projects\TNFT`
  - `C:\ton-projects\tnfi-mini-app`
  - `C:\ton-projects\tnftfinance`

## Build/Compile Reality
- `C:\ton-projects\TNFT\contracts`: `npx tact -c tact.config.json` fails due invalid first line/BOM in `TNFiItem.tact`.
- `C:\ton-projects\tnftfinance`: `npx tact -c tact.config.json` compiles, but config points to template contract `contracts/n_f_t_collateral_loan.tact` (not full lending logic).
- `C:\ton-projects\tnfi-mini-app`: `npm run build` fails; `package.json` is invalid JSON and file is truncated.

## Security Findings
- `CRITICAL`: mnemonic stored in plaintext:
  - `C:\ton-projects\TNFT\contracts\generate-wallet.js`
  - `C:\ton-projects\TNFT\contracts\wallet-data.json`
- `CRITICAL`: bot token was exposed in chat history (must be rotated immediately).

## Testnet Evidence
- Found: wallet testnet address in `wallet-data.json`.
- Not found yet: deployed contract address, tx hash, tonviewer links for TNFT contracts.

## Single Source of Truth Decision
- Use `C:\Users\Вал\Desktop\TNFTFi\TNFTFi_SAFE_SPEC_v0.1.md` as baseline spec.
- Before coding: execute security cleanup and normalize repository structure.

