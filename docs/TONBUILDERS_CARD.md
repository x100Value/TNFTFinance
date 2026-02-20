# TON Builders Card (draft)

## 1. Project identity
- **Name:** TNFT Finance
- **Value proposition:** Collateralized NFT borrow/lend rails with TVM-driven risk controls deployed on DEVnet/Ton Testnet.
- **Current status:** Demo sandbox + live RPC viewer for testnet contract EQDNj4-A8lILD6G3YXvEQWbMreziRuCGkbu2Tbb6xuPJjQUE (default in prototypes/tnfi-mini-app).

## 2. Frontend & demo
- **Canonical GUI path:** prototypes/tnfi-mini-app (React CRA). Run 
pm ci && npm start (default port 3001) for live view.
- **Deck:** security-first console (egg-shell theme) with Operator Suggestions, Loan Sheet, Risk Envelope, sandbox operations (try fund, repay, pause/oracle toggles).
- **UX hooks:** 1) Hard stop if oracle stale/pause; 2) Live risk data via Toncenter; 3) Dual theme toggles (eggshell safe mode + graphite metal look for launch).

## 3. Security & controls
- Inline display of fail-closed oracle gate, timelocked risk updates, emergency pause, no bypass path.
- Security brief cards show posture/freshness/pause signal (+ Operator Suggestions for teams).
- Security thresholds defined in docs/PRE_MAINNET_SECURITY_CHECKLIST.md and docs/TNFTFi_SAFE_SPEC_v0.1.md.

## 4. Testing & readiness
- Functional flows exercised via docs/MVP_TESTNET_CHECKLIST.md. Sandbox tests include borrow/playback, LTV/Oracle rejections, pause gating.
- Automated checks: 
pm test -- --watchAll=false, 
pm run build (both currently passing in prototypes/tnfi-mini-app).
- Deployment log: docs/deployments/testnet.md captures contract history and refresh hashes.

## 5. Next steps for TON Builders submission
- Capture screenshots/video for eggshell testnet console + graphite production style.
- Finalize README highlights (architecture + threat model) as noted in docs/TONBUILDERS_ROADMAP.md.
- Collect security proof points (audits checklist, TVL soak metrics) before enabling public card submission.

