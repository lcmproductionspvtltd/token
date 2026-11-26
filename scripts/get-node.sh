#!/usr/bin/env sh
# Downloads the OFFICIAL portable Node.js (LTS v22) into ./runtime/<os>-<arch> and verifies its SHA-256.
# Nothing is installed system-wide. Usage: sh scripts/get-node.sh linux|darwin x64|arm64
set -e
os="${1:?os}"; arch="${2:?arch}"
cd "$(dirname "$0")/.."
BASE="https://nodejs.org/dist/latest-v22.x"
dl() { if command -v curl >/dev/null 2>&1; then curl -fsSL "$1" -o "$2"; else wget -qO "$2" "$1"; fi; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
echo "Preparing Node.js for $os-$arch (one time only, ~30 MB)…"
dl "$BASE/SHASUMS256.txt" "$tmp/SHASUMS256.txt"
file=$(grep -oE "node-v[0-9.]+-$os-$arch\.tar\.gz" "$tmp/SHASUMS256.txt" | head -1)
[ -n "$file" ] || { echo "No official Node.js build for $os-$arch"; exit 1; }
dl "$BASE/$file" "$tmp/$file"
want=$(grep " $file\$" "$tmp/SHASUMS256.txt" | awk '{print $1}')
if command -v sha256sum >/dev/null 2>&1; then got=$(sha256sum "$tmp/$file" | awk '{print $1}'); else got=$(shasum -a 256 "$tmp/$file" | awk '{print $1}'); fi
[ "$want" = "$got" ] || { echo "Checksum mismatch – download was corrupted, please retry"; exit 1; }
mkdir -p "runtime/$os-$arch"
tar -xzf "$tmp/$file" -C "runtime/$os-$arch" --strip-components=1
echo "Node.js $("runtime/$os-$arch/bin/node" -v) ready in runtime/$os-$arch"
