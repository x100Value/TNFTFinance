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

function Status-Label {
    param([int]$Status)

    switch ($Status) {
        0 { return "OPEN" }
        1 { return "FUNDED" }
        2 { return "REPAID" }
        3 { return "LIQUIDATED" }
        4 { return "CANCELLED" }
        default { return "UNKNOWN($Status)" }
    }
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

function Get-AddressMeta {
    param(
        [string]$RpcUrl,
        [string]$Address
    )

    $result = Invoke-ToncenterRpc -RpcUrl $RpcUrl -Method "getAddressInformation" -Params @{
        address = $Address
    }

    return @{
        State      = $result.state
        Balance    = $result.balance
        LastTxHash = $result.last_transaction_id.hash
        LastTxLt   = $result.last_transaction_id.lt
    }
}

function Get-LoanState {
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
    $dueRaw = $stack[3][1]
    $startedRaw = $stack[2][1]
    $status = Parse-Status -Raw $statusRaw
    $dueAt = Parse-Status -Raw $dueRaw
    $startedAt = Parse-Status -Raw $startedRaw
    return @{
        Status   = $status
        DueAt    = $dueAt
        StartedAt = $startedAt
    }
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
        $state = Get-LoanState -RpcUrl $RpcUrl -Address $Address
        if ($state.Status -eq $ExpectedStatus) {
            return
        }

        $elapsed = (Get-Date) - $started
        if ($elapsed.TotalSeconds -ge $TimeoutSeconds) {
            throw "Timeout waiting status=$ExpectedStatus for $Address (current=$($state.Status))"
        }

        Start-Sleep -Seconds $PollSeconds
    }
}

function Wait-LoanOverdue {
    param(
        [string]$RpcUrl,
        [string]$Address,
        [int]$SafetySeconds = 5,
        [int]$TimeoutSeconds = 600
    )

    $started = Get-Date
    while ($true) {
        $state = Get-LoanState -RpcUrl $RpcUrl -Address $Address
        if ($state.Status -ne 1) {
            throw "Loan $Address is not FUNDED while waiting overdue (status=$($state.Status))"
        }

        $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
        if ($now -gt ($state.DueAt + $SafetySeconds)) {
            return
        }

        $elapsed = (Get-Date) - $started
        if ($elapsed.TotalSeconds -ge $TimeoutSeconds) {
            throw "Timeout waiting overdue for $Address (now=$now dueAt=$($state.DueAt))"
        }

        Start-Sleep -Seconds 4
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
        $output | ForEach-Object { Write-Host $_ }
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
        return [string]$address
    }
    finally {
        Pop-Location
    }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$projectDir = Join-Path $repoRoot "prototypes\tnftfinance-blueprint"
$envLocal = Join-Path $repoRoot ".env.local"
$deploymentsDir = Join-Path $repoRoot "docs\deployments"
$rpcUrl = if ($env:TONCENTER_RPC_URL) { $env:TONCENTER_RPC_URL } else { "https://testnet.toncenter.com/api/v2/jsonRPC" }
$runStartedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")

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
Wait-LoanStatus -RpcUrl $rpcUrl -Address $repaidAddress -ExpectedStatus 1 -TimeoutSeconds 180 -PollSeconds 6
Write-Host "Now execute repay from borrower wallet (tonconnect):" -ForegroundColor Yellow
Write-Host "cd $projectDir"
Write-Host "  `$env:MVP_CONTRACT_ADDRESS='$repaidAddress'"
Write-Host "  npm exec -- blueprint run sendRepay --testnet --tonconnect"
Write-Host "Waiting for status REPAID (2)..."
Wait-LoanStatus -RpcUrl $rpcUrl -Address $repaidAddress -ExpectedStatus 2 -TimeoutSeconds 1800 -PollSeconds 8
Write-Host "Branch A PASS: status=REPAID" -ForegroundColor Green

Write-Host "=== Branch B: LIQUIDATED ===" -ForegroundColor Cyan
$liquidatedAddress = Deploy-Loan -ProjectDir $projectDir -TermSeconds 120 -BorrowerAddress $env:MVP_BORROWER_ADDRESS
$env:MVP_CONTRACT_ADDRESS = $liquidatedAddress
Write-Host "LIQUIDATED_CONTRACT=$liquidatedAddress"
Invoke-BlueprintRun -ProjectDir $projectDir -ScriptName "sendOwnerSetOracle"
Invoke-BlueprintRun -ProjectDir $projectDir -ScriptName "sendOwnerFundLoan"
Wait-LoanStatus -RpcUrl $rpcUrl -Address $liquidatedAddress -ExpectedStatus 1 -TimeoutSeconds 180 -PollSeconds 6
Write-Host "Waiting until loan is overdue..." -ForegroundColor Yellow
Wait-LoanOverdue -RpcUrl $rpcUrl -Address $liquidatedAddress -SafetySeconds 5 -TimeoutSeconds 900
Invoke-BlueprintRun -ProjectDir $projectDir -ScriptName "sendOwnerLiquidate"
Wait-LoanStatus -RpcUrl $rpcUrl -Address $liquidatedAddress -ExpectedStatus 3 -TimeoutSeconds 300 -PollSeconds 8
Write-Host "Branch B PASS: status=LIQUIDATED" -ForegroundColor Green

Write-Host "=== Summary ===" -ForegroundColor Cyan
Write-Host "REPAID_CONTRACT=$repaidAddress"
Write-Host "LIQUIDATED_CONTRACT=$liquidatedAddress"

$repaidState = Get-LoanState -RpcUrl $rpcUrl -Address $repaidAddress
$liquidatedState = Get-LoanState -RpcUrl $rpcUrl -Address $liquidatedAddress
$repaidMeta = Get-AddressMeta -RpcUrl $rpcUrl -Address $repaidAddress
$liquidatedMeta = Get-AddressMeta -RpcUrl $rpcUrl -Address $liquidatedAddress
$repaidLabel = Status-Label -Status $repaidState.Status
$liquidatedLabel = Status-Label -Status $liquidatedState.Status

New-Item -ItemType Directory -Force -Path $deploymentsDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$jsonPath = Join-Path $deploymentsDir "testnet-matrix-$stamp.json"
$mdPath = Join-Path $deploymentsDir "testnet-matrix-$stamp.md"
$generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")

$report = @{
    generatedAtUtc = $generatedAt
    startedAtUtc = $runStartedAt
    rpcUrl = $rpcUrl
    branchRepaid = @{
        contractAddress = $repaidAddress
        finalStatus = $repaidState.Status
        finalStatusLabel = $repaidLabel
        startedAt = $repaidState.StartedAt
        dueAt = $repaidState.DueAt
        accountState = $repaidMeta.State
        lastTxHash = $repaidMeta.LastTxHash
        lastTxLt = $repaidMeta.LastTxLt
    }
    branchLiquidated = @{
        contractAddress = $liquidatedAddress
        finalStatus = $liquidatedState.Status
        finalStatusLabel = $liquidatedLabel
        startedAt = $liquidatedState.StartedAt
        dueAt = $liquidatedState.DueAt
        accountState = $liquidatedMeta.State
        lastTxHash = $liquidatedMeta.LastTxHash
        lastTxLt = $liquidatedMeta.LastTxLt
    }
}

$report | ConvertTo-Json -Depth 8 | Set-Content -Path $jsonPath -Encoding UTF8

$md = @(
    "# Testnet Full Matrix Run",
    "",
    "Generated (UTC): $generatedAt",
    "Started (UTC): $runStartedAt",
    "",
    "## Branch A: Repaid",
    "- Contract: $repaidAddress",
    "- Final status: $($repaidState.Status) ($repaidLabel)",
    "- Last tx hash: $($repaidMeta.LastTxHash)",
    "- Tonscan: https://testnet.tonscan.org/address/$repaidAddress",
    "",
    "## Branch B: Liquidated",
    "- Contract: $liquidatedAddress",
    "- Final status: $($liquidatedState.Status) ($liquidatedLabel)",
    "- Last tx hash: $($liquidatedMeta.LastTxHash)",
    "- Tonscan: https://testnet.tonscan.org/address/$liquidatedAddress",
    ""
)
$md | Set-Content -Path $mdPath -Encoding UTF8

Write-Host "JSON report: $jsonPath" -ForegroundColor Green
Write-Host "MD report: $mdPath" -ForegroundColor Green
Write-Host "Testnet full matrix completed." -ForegroundColor Green
