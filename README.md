# TNFTFinance (Sanitized Working Baseline)

This repository is a sanitized baseline prepared for secure development.

## Structure
- `docs/` - specs, security rules, checklists.
- `docs/deployments/` - testnet deployment records and logs.
- `docs/MVP_TESTNET_CHECKLIST.md` - security-first execution checklist for MVP.
- `prototypes/tnft-contracts/` - NFT collection prototype contracts.
- `prototypes/tnftfinance-blueprint/` - lending protocol prototype (Blueprint/Tact).
- `prototypes/tnfi-mini-app/` - Telegram Mini App prototype.
- `scripts/scan-secrets.ps1` - local pre-commit secret scan.
- `scripts/deploy-testnet.ps1` - reproducible NFTCollateralLoan testnet deploy script.

## Security First
- Do not commit mnemonics, private keys, bot tokens, or wallet dumps.
- Run `scripts/scan-secrets.ps1` before every commit.
- Mainnet is forbidden until checklist is fully complete:
  `docs/PRE_MAINNET_SECURITY_CHECKLIST.md`.

## Quick Start
### 1) Protocol prototype
```powershell
cd prototypes/tnftfinance-blueprint
npm ci
npm run compile
npm test
```

### 2) NFT contracts prototype
```powershell
cd prototypes/tnft-contracts
npm ci
npx tact -c tact.config.json
```

### 3) Mini App prototype
```powershell
cd prototypes/tnfi-mini-app
npm ci
npm run build
```

### 4) Deploy NFTCollateralLoan to TON testnet
```powershell
# 1) create .env.local from .env.example and fill WALLET_MNEMONIC + WALLET_VERSION
# 2) run deploy script from repo root
powershell -ExecutionPolicy Bypass -File .\scripts\deploy-testnet.ps1
```
