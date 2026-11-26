# Downloads the OFFICIAL portable Node.js (LTS v22) for Windows into .\runtime\win-<arch> and verifies SHA-256.
# Nothing is installed system-wide.  Usage: powershell -ExecutionPolicy Bypass -File scripts\get-node.ps1 -Arch x64
param([string]$Arch = "x64")
$ErrorActionPreference = "Stop"
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}
$root = Split-Path -Parent $PSScriptRoot
$base = "https://nodejs.org/dist/latest-v22.x"
$tmp  = Join-Path ([IO.Path]::GetTempPath()) ("bquee-node-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
  Write-Host "Downloading Node.js for win-$Arch (one time only, ~30 MB)..."
  $sums = (Invoke-WebRequest -UseBasicParsing "$base/SHASUMS256.txt").Content
  $line = ($sums -split "`n") | Where-Object { $_ -match "node-v[\d.]+-win-$Arch\.zip\s*$" } | Select-Object -First 1
  if (-not $line) { throw "No official Node.js build for win-$Arch" }
  $parts = $line.Trim() -split "\s+"; $hash = $parts[0]; $file = $parts[1]
  $zip = Join-Path $tmp $file
  Invoke-WebRequest -UseBasicParsing "$base/$file" -OutFile $zip
  $got = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
  if ($got -ne $hash.ToLower()) { throw "Checksum mismatch - download was corrupted, please retry" }
  Expand-Archive $zip -DestinationPath $tmp -Force
  $dest = Join-Path $root "runtime\win-$Arch"
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  Copy-Item (Join-Path (Join-Path $tmp ($file -replace '\.zip$', '')) '*') $dest -Recurse -Force
  Write-Host "Node.js ready in $dest"
} finally { Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue }
