$ErrorActionPreference = "Stop"

function Import-EnvFile {
    param([string]$Path)

    if (-not (Test-Path $Path)) {
        throw "Missing env file: $Path"
    }

    Get-Content -Path $Path | ForEach-Object {
        $line = $_.Trim()
        if ($line.Length -eq 0 -or $line.StartsWith("#")) {
            return
        }

        $splitAt = $line.IndexOf("=")
        if ($splitAt -lt 1) {
            return
        }

        $name = $line.Substring(0, $splitAt).Trim()
        $value = $line.Substring($splitAt + 1).Trim()

        if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
            $value = $value.Substring(1, $value.Length - 2)
        }

        [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
}

function Parse-Status {
    param([string]$Raw)

    if ($Raw.StartsWith("0x")) {
        return [Convert]::ToInt32($Raw.Substring(2), 16)
    }

    return [int]$Raw
}

function Invoke-ToncenterRpc {
    param(
        [string]$RpcUrl,
        [string]$Method,
        [hashtable]$Params,
        [int]$Retries = 5,
        [int]$RetryDelaySeconds = 3
    )

    for ($attempt = 1; $attempt -le $Retries; $attempt++) {
        try {
            $headers = @{ "Content-Type" = "application/json" }
            if ($env:TONCENTER_API_KEY) {
                $headers["X-API-Key"] = $env:TONCENTER_API_KEY
            }

            $body = @{
                id      = "1"
                jsonrpc = "2.0"
                method  = $Method
                params  = $Params
            } | ConvertTo-Json -Depth 10

            $response = Invoke-RestMethod -Method Post -Uri $RpcUrl -Headers $headers -Body $body -TimeoutSec 40
            if (-not $response.ok) {
                throw "RPC error: $($response.code) $($response.result)"
            }
            return $response.result
        }
        catch {
            if ($attempt -ge $Retries) {
                throw
            }
            Start-Sleep -Seconds $RetryDelaySeconds
        }
    }
}

function Get-LoanStatus {
    param(
        [string]$RpcUrl,
        [string]$Address
    )

    $result = Invoke-ToncenterRpc -RpcUrl $RpcUrl -Method "runGetMethod" -Params @{
        address = $Address
        method  = "get_loan_state"
        stack   = @()
    }

    $stack = $result.stack
    $statusRaw = $stack[0][1]
    return Parse-Status -Raw $statusRaw
}

function Wait-LoanStatus {
    param(
        [string]$RpcUrl,
        [string]$Address,
        [int]$ExpectedStatus,
        [int]$TimeoutSeconds = 300,
        [int]$PollSeconds = 6
    )

    $started = Get-Date
    while ($true) {
        $status = Get-LoanStatus -RpcUrl $RpcUrl -Address $Address
        if ($status -eq $ExpectedStatus) {
            return
        }

        $elapsed = (Get-Date) - $started
        if ($elapsed.TotalSeconds -ge $TimeoutSeconds) {
            throw "Timeout waiting status=$ExpectedStatus for $Address (current=$status)"
        }

        Start-Sleep -Seconds $PollSeconds
    }
}

function Invoke-BlueprintRun {
    param(
        [string]$ProjectDir,
        [string]$ScriptName
    )

    Push-Location $ProjectDir
    try {
        $cmd = "npm exec -- blueprint run $ScriptName --testnet --mnemonic"
        & cmd /c $cmd
        if ($LASTEXITCODE -ne 0) {
            throw "Blueprint script failed: $ScriptName"
        }
    }
    finally {
        Pop-Location
    }
}

function Deploy-Loan {
    param(
        [string]$ProjectDir,
        [int]$TermSeconds,
        [string]$BorrowerAddress
    )

    Remove-Item Env:MVP_OWNER_ADDRESS -ErrorAction SilentlyContinue
    $env:MVP_BORROWER_ADDRESS = $BorrowerAddress
    $env:MVP_TERM_SECONDS = "$TermSeconds"

    Push-Location $ProjectDir
    try {
        $cmd = "npm exec -- blueprint run deployNFTCollateralLoan --testnet --mnemonic"
        $output = & cmd /c $cmd 2>&1
        $output | Write-Output
        if ($LASTEXITCODE -ne 0) {
            throw "Deploy failed"
        }

        $targetLine = $output | Select-String "Target address:" | Select-Object -First 1
        $deployedLine = $output | Select-String "Deployed NFTCollateralLoan at:" | Select-Object -First 1
        $line = if ($targetLine) { $targetLine.ToString() } elseif ($deployedLine) { $deployedLine.ToString() } else { "" }
        $m = [regex]::Match($line, '(E[QkU][A-Za-z0-9_\-]{30,})')
        if (-not $m.Success) {
            throw "Could not parse contract address from deploy output"
        }
        $address = $m.Groups[1].Value.Trim()
        return $address
    }
    finally {
        Pop-Location
    }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$projectDir = Join-Path $repoRoot "prototypes\tnftfinance-blueprint"
$envLocal = Join-Path $repoRoot ".env.local"
$rpcUrl = if ($env:TONCENTER_RPC_URL) { $env:TONCENTER_RPC_URL } else { "https://testnet.toncenter.com/api/v2/jsonRPC" }

Import-EnvFile -Path $envLocal

if (-not $env:WALLET_MNEMONIC) {
    throw "WALLET_MNEMONIC missing in .env.local"
}
if (-not $env:WALLET_VERSION) {
    throw "WALLET_VERSION missing in .env.local"
}
if (-not $env:MVP_BORROWER_ADDRESS) {
    throw "MVP_BORROWER_ADDRESS missing in .env.local"
}

$env:MVP_SEND_RETRIES = "5"
$env:MVP_SEND_RETRY_DELAY_MS = "3000"

Write-Host "=== Compile ===" -ForegroundColor Cyan
Push-Location $projectDir
try {
    & cmd /c "npm run compile"
    if ($LASTEXITCODE -ne 0) {
        throw "Compile failed"
    }
}
finally {
    Pop-Location
}

Write-Host "=== Branch A: REPAID ===" -ForegroundColor Cyan
$repaidAddress = Deploy-Loan -ProjectDir $projectDir -TermSeconds 86400 -BorrowerAddress $env:MVP_BORROWER_ADDRESS
$env:MVP_CONTRACT_ADDRESS = $repaidAddress
Write-Host "REPAID_CONTRACT=$repaidAddress"
Invoke-BlueprintRun -ProjectDir $projectDir -ScriptName "sendOwnerSetOracle"
Invoke-BlueprintRun -ProjectDir $projectDir -ScriptName "sendOwnerFundLoan"
Write-Host "Now execute repay from borrower wallet (tonconnect):" -ForegroundColor Yellow
Write-Host "cd $projectDir"
Write-Host "  `$env:MVP_CONTRACT_ADDRESS='$repaidAddress'"
Write-Host "  npm exec -- blueprint run sendRepay --testnet --tonconnect"
Write-Host "Waiting for status REPAID (2)..."
Wait-LoanStatus -RpcUrl $rpcUrl -Address $repaidAddress -ExpectedStatus 2 -TimeoutSeconds 600 -PollSeconds 8
Write-Host "Branch A PASS: status=REPAID" -ForegroundColor Green

Write-Host "=== Branch B: LIQUIDATED ===" -ForegroundColor Cyan
$liquidatedAddress = Deploy-Loan -ProjectDir $projectDir -TermSeconds 120 -BorrowerAddress $env:MVP_BORROWER_ADDRESS
$env:MVP_CONTRACT_ADDRESS = $liquidatedAddress
Write-Host "LIQUIDATED_CONTRACT=$liquidatedAddress"
Invoke-BlueprintRun -ProjectDir $projectDir -ScriptName "sendOwnerSetOracle"
Invoke-BlueprintRun -ProjectDir $projectDir -ScriptName "sendOwnerFundLoan"
Start-Sleep -Seconds 130
Invoke-BlueprintRun -ProjectDir $projectDir -ScriptName "sendOwnerLiquidate"
Wait-LoanStatus -RpcUrl $rpcUrl -Address $liquidatedAddress -ExpectedStatus 3 -TimeoutSeconds 300 -PollSeconds 8
Write-Host "Branch B PASS: status=LIQUIDATED" -ForegroundColor Green

Write-Host "=== Summary ===" -ForegroundColor Cyan
Write-Host "REPAID_CONTRACT=$repaidAddress"
Write-Host "LIQUIDATED_CONTRACT=$liquidatedAddress"
Write-Host "Testnet full matrix completed." -ForegroundColor Green
