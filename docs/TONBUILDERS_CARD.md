# TON Builders Card (submission-ready draft)

Last updated: 2026-02-21
Status: pre-alpha, testnet-only

## 1) Copy/Paste Fields (EN)
- Project name: `TNFT Finance`
- One-liner: `NFT-collateralized liquidity flow on TON with safety-first risk controls.`
- Category: `DeFi`, `NFT`, `Telegram Mini App`
- Stage: `Pre-Alpha (Testnet)`
- Network: `TON Testnet`
- Website / demo: `https://tnftfi.ru/`
- Source code: `https://github.com/x100Value/TNFTFinance`
- Main testnet contract: `EQDNj4-A8lILD6G3YXvEQWbMreziRuCGkbu2Tbb6xuPJjQUE`
- Explorer link: `https://testnet.tonscan.org/address/EQDNj4-A8lILD6G3YXvEQWbMreziRuCGkbu2Tbb6xuPJjQUE`

## 2) Short Description (EN)
TNFT Finance is a TON testnet pre-alpha for NFT-collateralized borrow flows. The MVP focuses on protocol safety: oracle freshness checks, timelocked risk updates, and pause controls.

## 3) Full Description (EN)
TNFT Finance is building a Telegram-native NFT-collateralized liquidity protocol on TON.  
The current release is pre-alpha on testnet, designed to validate risk mechanics before public scaling.

The MVP contract already supports a full loan state machine (`OPEN -> FUNDED -> REPAID / LIQUIDATED / CANCELLED`) and enforces safety gates at funding time:
- stale-oracle rejection (fail-closed),
- LTV limits with protocol-favor rounding,
- emergency pause behavior,
- timelocked risk parameter updates.

Current focus is security hardening and architecture completion before mainnet: real NFT escrow, multi-oracle quorum, multisig governance, and liquidity pool modules.

## 4) What Is Verified Right Now
- Testnet deployment recorded and reproducible.
- Loan lifecycle tested end-to-end (including repay and overdue liquidation path).
- Safety checks validated in tests (oracle freshness, pause gating, timelock).
- Mini app prototype available for demo flow.

Evidence:
- `docs/deployments/testnet.md`
- `docs/MVP_TESTNET_CHECKLIST.md`
- `docs/PRE_MAINNET_SECURITY_CHECKLIST.md`
- `prototypes/tnfi-mini-app`

## 5) Transparent Scope Notes (for reviewers)
Not live yet (intentional pre-alpha scope):
- real NFT escrow transfer integration,
- multi-oracle median/quorum,
- multisig owner model,
- production liquidity pools and lock tiers.

Mainnet is explicitly blocked until security checklist completion:
- `docs/PRE_MAINNET_SECURITY_CHECKLIST.md`

## 6) Media Pack Checklist for Card
- Logo: `512x512` PNG (transparent).
- Cover: `1280x720` PNG.
- 3 screenshots:
  - mini app borrower flow,
  - risk controls panel,
  - testnet transaction/explorer proof.
- Optional 30-60s demo video (mini app flow + testnet proof).

## 7) Submission Order (Fast)
1. Fill fields from section 1.
2. Paste section 2 into short description.
3. Paste section 3 into full description.
4. Attach media from section 6.
5. Add explorer + repo links.
6. Submit as `pre-alpha / testnet`.

