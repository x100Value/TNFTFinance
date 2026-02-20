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

$repoRoot = Split-Path -Parent $PSScriptRoot
$projectDir = Join-Path $repoRoot "prototypes\tnftfinance-blueprint"
$envLocal = Join-Path $repoRoot ".env.local"
$deploymentsDir = Join-Path $repoRoot "docs\deployments"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$runLog = Join-Path $deploymentsDir "testnet-run-$timestamp.log"

Import-EnvFile -Path $envLocal

if (-not $env:WALLET_MNEMONIC) {
    throw "WALLET_MNEMONIC is missing in .env.local"
}

if (-not $env:WALLET_VERSION) {
    throw "WALLET_VERSION is missing in .env.local (example: v4)"
}

New-Item -ItemType Directory -Force -Path $deploymentsDir | Out-Null

Push-Location $projectDir
try {
    npm ci
    npm run compile

    $deployCmd = "npm exec -- blueprint run deployNFTCollateralLoan --testnet --mnemonic"
    if ($env:TONCENTER_API_KEY) {
        $deployCmd = "npm exec -- blueprint run deployNFTCollateralLoan --custom https://testnet.toncenter.com/api/v2/jsonRPC --custom-version v2 --custom-type testnet --mnemonic --custom-key $($env:TONCENTER_API_KEY)"
    }

    & cmd /c $deployCmd 2>&1 | Tee-Object -FilePath $runLog
    if ($LASTEXITCODE -ne 0) {
        throw "Deploy failed. See log: $runLog"
    }
}
finally {
    Pop-Location
}

Write-Host "Testnet deploy completed. Log: $runLog" -ForegroundColor Green
