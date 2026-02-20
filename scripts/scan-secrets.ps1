$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$patterns = @(
  '[0-9]{8,10}:[A-Za-z0-9_-]{20,}',
  '(?i)mnemonic\s*[:=]\s*["'']?[a-z]+(\s+[a-z]+){11,23}["'']?',
  '(?i)seed phrase\s*[:=]',
  'private key',
  'BEGIN PRIVATE KEY',
  'wallet-data',
  'secret\s*=\s*[^\s]+'
)

$exclude = @("node_modules", "build", "dist", ".git")
$regex = ($patterns -join "|")

$files = Get-ChildItem -Path $root -Recurse -File |
  Where-Object {
    $p = $_.FullName.ToLower()
    if ($p -match "\\docs\\") { return $false }
    if ($p -like "*.md" -or $p -like "*.txt") { return $false }
    if ($p -match "\\.env\\.example$") { return $false }
    if ($p -match "\\scripts\\scan-secrets.ps1$") { return $false }
    if ($p -match "\\.gitignore$") { return $false }
    -not ($exclude | ForEach-Object { $p -match "\\\\$_\\\\" } | Where-Object { $_ })
  }

$hits = @()
foreach ($f in $files) {
  try {
    $m = Select-String -Path $f.FullName -Pattern $regex -CaseSensitive:$false
    if ($m) { $hits += $m }
  } catch {}
}

if ($hits.Count -gt 0) {
  Write-Host "Potential secrets found:" -ForegroundColor Red
  $hits | ForEach-Object { "{0}:{1}: {2}" -f $_.Path, $_.LineNumber, $_.Line.Trim() }
  exit 1
}

Write-Host "No obvious secret patterns found." -ForegroundColor Green
