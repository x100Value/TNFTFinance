# Testnet Deployments

Use this file to track every public testnet deployment.

## Template

- Date (UTC):
- Commit:
- Deployer wallet (public address):
- Network endpoint:
- Contract:
- Contract address:
- Deployment tx hash:
- Explorer link:
- Run log file:
- Notes:

## Entries

- Date (UTC): 2026-02-20
- Commit: cf01f38
- Deployer wallet (public address): EQBuVfeIXD-R8aYsm8P9PT5s-CEdO83Oy90Ppccw3mlJQ3TB (validation wallet)
- Network endpoint: https://testnet.toncenter.com/api/v2/jsonRPC
- Contract: NFTCollateralLoan
- Contract address: EQAIYlrr3UiMJ9fqI-B4j2nJdiiD7WzyaNL1MX_wiONc4OUi
- Deployment tx hash: n/a (contract already active on testnet)
- Explorer link: https://testnet.tonscan.org/address/EQAIYlrr3UiMJ9fqI-B4j2nJdiiD7WzyaNL1MX_wiONc4OUi
- Run log file: local only (`docs/deployments/testnet-run-*.log`, ignored by git)
- Notes: Reproducible deploy script validated; it correctly detects active deployment and exits safely. Verified via Toncenter (`state=active`) on 2026-02-20.
