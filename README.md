# TNFTFinance (Sanitized Working Baseline)

This repository is a sanitized baseline prepared for secure development.

## Structure
- `docs/` - specs, security rules, checklists.
- `prototypes/tnft-contracts/` - NFT collection prototype contracts.
- `prototypes/tnftfinance-blueprint/` - lending protocol prototype (Blueprint/Tact).
- `prototypes/tnfi-mini-app/` - Telegram Mini App prototype.
- `scripts/scan-secrets.ps1` - local pre-commit secret scan.

## Security First
- Do not commit mnemonics, private keys, bot tokens, or wallet dumps.
- Run `scripts/scan-secrets.ps1` before every commit.
- Mainnet is forbidden until checklist is fully complete:
  `docs/PRE_MAINNET_SECURITY_CHECKLIST.md`.

## Quick Start
### 1) Protocol prototype
```powershell
cd prototypes/tnftfinance-blueprint
npm install
npx tact -c tact.config.json
```

### 2) NFT contracts prototype
```powershell
cd prototypes/tnft-contracts
npm install
npx tact -c tact.config.json
```

### 3) Mini App prototype
```powershell
cd prototypes/tnfi-mini-app
npm install
npm run build
```