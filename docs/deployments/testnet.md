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
- Commit: local workspace (frontend sandbox + testnet redeploy via TonConnect/deeplink)
- Deployer wallet (public address): UQCQ4dGD-gm1VS7UkPZtvPZwmXzAUzokZ1HS551IcwQ_KYXA
- Network endpoint: https://testnet.toncenter.com/api/v2/jsonRPC
- Contract: NFTCollateralLoan (MVP state-machine)
- Contract address: EQDNj4-A8lILD6G3YXvEQWbMreziRuCGkbu2Tbb6xuPJjQUE
- Deployment tx hash: CNsKnfRvNoNSHqNK9R/kIZN2xGtt6ZZLsdN74nZIvyE=
- Explorer link: https://testnet.tonscan.org/address/EQDNj4-A8lILD6G3YXvEQWbMreziRuCGkbu2Tbb6xuPJjQUE
- Run log file: manual wallet confirmation flow (`blueprint --tonconnect/deeplink`)
- Notes: Owner decoded from `get_owner` is `UQCQ4dGD-gm1VS7UkPZtvPZwmXzAUzokZ1HS551IcwQ_KYXA`; contract is `active`.
- Notes: Full MVP cycle completed on 2026-02-20 (UTC): `SetOraclePrice` tx `f8a24de7b7927bcb9ff0b99823e0e030a17c03b9ae817c62d4ced0a1435a1117`, `FundLoan` tx `b54e4689c69a54684f49ada8d0bfb841320b5980df7d02e9b305a3c57e6acf25`, `Repay` tx `c53f4ef9a533dcc07212ec44126bcf9bf72e29f74eafb67c0a89cf7c19d021c8`; final `get_loan_state.status = 2 (REPAID)`.

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

## Integrity Check (2026-02-20, double-pass)

- Pass 1 and Pass 2 matched exactly (no new unexpected transactions between checks).
- `EQDNj4-A8lILD6G3YXvEQWbMreziRuCGkbu2Tbb6xuPJjQUE`: `active`, latest tx `c53f4ef9a533dcc0...`, current loan status `2 (REPAID)`.
- `EQBVuxKDAts-fESLPfc1geFEu-C7aj5rawG_HvUxmtZljqTO`: `active`, latest tx `8e4a8e86cb098381...`, current loan status `0 (OPEN)`.
- `EQD3jGq2xrN8LkvD4Sk-3EwZy8568miPnfaU3vVWIDW7hEtJ`: `active`, latest tx `8bdd9b28492ee370...`, legacy deployment (older ABI getters are partially incompatible with current wrapper).
