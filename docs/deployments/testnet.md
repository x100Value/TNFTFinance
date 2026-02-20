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
- Commit: local workspace (MVP state-machine), see newest commit on `main`
- Deployer wallet (public address): EQBuVfeIXD-R8aYsm8P9PT5s-CEdO83Oy90Ppccw3mlJQ3TB (validation wallet)
- Network endpoint: https://testnet.toncenter.com/api/v2/jsonRPC (`--testnet` mode)
- Contract: NFTCollateralLoan (MVP state-machine with oracle fail-closed + risk timelock)
- Contract address: EQBVuxKDAts-fESLPfc1geFEu-C7aj5rawG_HvUxmtZljqTO
- Deployment tx hash: VGD1D9e9dWnsJW84kJzPvgsQLmf8//zlH8TuE70IKsg=
- Explorer link: https://testnet.tonscan.org/address/EQBVuxKDAts-fESLPfc1geFEu-C7aj5rawG_HvUxmtZljqTO
- Run log file: local only (`docs/deployments/testnet-run-*.log`, ignored by git)
- Notes: Verified `state=active` via Toncenter; `get_owner` returns deployer address.

- Date (UTC): 2026-02-20
- Commit: local workspace (2026-02-20), see subsequent commits on `main`
- Deployer wallet (public address): EQBuVfeIXD-R8aYsm8P9PT5s-CEdO83Oy90Ppccw3mlJQ3TB (validation wallet)
- Network endpoint: https://testnet.toncenter.com/api/v2/jsonRPC (default `--testnet` used)
- Contract: NFTCollateralLoan
- Contract address: EQD3jGq2xrN8LkvD4Sk-3EwZy8568miPnfaU3vVWIDW7hEtJ
- Deployment tx hash: i92bKEku43DWd1+mUtk3EBmM7/Mgew5n5Mb5R2WqRAU=
- Explorer link: https://testnet.tonscan.org/address/EQD3jGq2xrN8LkvD4Sk-3EwZy8568miPnfaU3vVWIDW7hEtJ
- Run log file: local only (`docs/deployments/testnet-run-*.log`, ignored by git)
- Notes: Reproducible deploy script validated; contract deployed and verified via Toncenter (`state=active`) on 2026-02-20.
