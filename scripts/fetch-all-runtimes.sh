#!/usr/bin/env sh
# For distributors: run ONCE on a computer with internet to pre-load Node.js for every platform,
# then zip the folder – the package then runs fully offline on Windows, macOS and Linux.
set -e
cd "$(dirname "$0")/.."
for t in linux-x64 linux-arm64 darwin-x64 darwin-arm64; do [ -x "runtime/$t/bin/node" ] || sh scripts/get-node.sh "${t%-*}" "${t#*-}"; done
command -v pwsh >/dev/null 2>&1 && pwsh -NoProfile -File scripts/get-node.ps1 -Arch x64 || echo "Windows runtime: run scripts\\get-node.ps1 on Windows (or install PowerShell 7 here)."
echo "All runtimes in ./runtime"
