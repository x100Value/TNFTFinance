# TNFTFi Testnet Execution Matrix (v0.0.1.8)

Date: 2026-02-23  
Network: TON testnet

## Prerequisites
- `cd C:\Users\Вал\tmp\TNFTFinance\prototypes\tnftfinance-blueprint`
- Load `.env.local` in current PowerShell session.
- Retry defaults (recommended):
  - `$env:MVP_SEND_RETRIES='5'`
  - `$env:MVP_SEND_RETRY_DELAY_MS='3000'`

## One-command Runner
From repo root:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-testnet-full-matrix.ps1
```
What it does:
- compiles contracts,
- runs REPAID branch deploy + owner steps and waits for borrower repay,
- runs LIQUIDATED branch deploy + owner steps + overdue + liquidation,
- validates on-chain statuses,
- writes run reports to `docs/deployments/testnet-matrix-YYYYMMDD-HHmmss.{json,md}`.

## Flow A: Repaid Branch (`OPEN -> FUNDED -> REPAID`)
1. Deploy fresh loan:
   - Set:
     - `$env:MVP_OWNER_ADDRESS='EQBJIBZU6P-55OnXGWDKnwsY-RiXi0rADnONlcSfvekNj6Ea'`
     - `$env:MVP_BORROWER_ADDRESS='EQCQ4dGD-gm1VS7UkPZtvPZwmXzAUzokZ1HS551IcwQ_KdgF'`
     - `$env:MVP_TERM_SECONDS='86400'`
   - Run:
     - `npm exec -- blueprint run deployNFTCollateralLoan --testnet --mnemonic`
2. Set contract:
   - `$env:MVP_CONTRACT_ADDRESS='<Target address from deploy output>'`
3. Set oracle:
   - `npm exec -- blueprint run sendOwnerSetOracle --testnet --mnemonic`
4. Fund:
   - `npm exec -- blueprint run sendOwnerFundLoan --testnet --mnemonic`
5. Repay (borrower wallet):
   - `npm exec -- blueprint run sendRepay --testnet --tonconnect`
6. Verify:
   - `runGetMethod(get_loan_state)` status must be `0x2`.

## Flow B: Liquidation Branch (`OPEN -> FUNDED -> LIQUIDATED`)
1. Deploy fresh loan:
   - Set:
     - `$env:MVP_OWNER_ADDRESS='EQBJIBZU6P-55OnXGWDKnwsY-RiXi0rADnONlcSfvekNj6Ea'`
     - `$env:MVP_BORROWER_ADDRESS='EQCQ4dGD-gm1VS7UkPZtvPZwmXzAUzokZ1HS551IcwQ_KdgF'`
     - `$env:MVP_TERM_SECONDS='120'`
   - Run:
     - `npm exec -- blueprint run deployNFTCollateralLoan --testnet --mnemonic`
2. Set contract:
   - `$env:MVP_CONTRACT_ADDRESS='<Target address from deploy output>'`
3. Set oracle:
   - `npm exec -- blueprint run sendOwnerSetOracle --testnet --mnemonic`
4. Fund:
   - `npm exec -- blueprint run sendOwnerFundLoan --testnet --mnemonic`
5. Wait:
   - `Start-Sleep -Seconds 130`
6. Liquidate:
   - `npm exec -- blueprint run sendOwnerLiquidate --testnet --mnemonic`
7. Verify:
   - `runGetMethod(get_loan_state)` status must be `0x3`.

## Optional Collateral Lock Step (non-placeholder collateral mode)
- If `collateralNft != borrower`, run before funding:
  - `npm run collateral:lock:testnet`
- Sender must be collateral notifier wallet address configured in contract init.

## Status Check Snippet
```powershell
$rpc='https://testnet.toncenter.com/api/v2/jsonRPC'
$addr=$env:MVP_CONTRACT_ADDRESS
$body=@{id='1';jsonrpc='2.0';method='runGetMethod';params=@{address=$addr;method='get_loan_state';stack=@()}} | ConvertTo-Json -Depth 8
$r=Invoke-RestMethod -Method Post -Uri $rpc -ContentType 'application/json' -Body $body
$r.result.stack[0][1]
```

Status map:
- `0x0` OPEN
- `0x1` FUNDED
- `0x2` REPAID
- `0x3` LIQUIDATED
- `0x4` CANCELLED
