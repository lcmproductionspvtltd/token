#!/bin/bash
# Fails if a secret looks committed: private keys, cloud/API tokens, a real database password, or
# an .env file. Run by the GitHub check on every push (also: npm run check:secrets).
set -u
cd "$(dirname "$0")/.."
found=0
report() { echo "✗ $1"; found=1; }

files=$(git ls-files | grep -v -E '^(public/app/|material_ui/|cupertino_ui/|app-packages/)' )
check() { # label  perl-regex
  local hits
  hits=$(printf '%s\n' $files | xargs grep -I -n -P -- "$2" 2>/dev/null | grep -v 'check-secrets.sh' | head -5)
  [ -n "$hits" ] && report "$1:
$hits"
}

check 'Private key' '-----BEGIN ([A-Z]+ )?PRIVATE KEY-----'
check 'AWS access key' 'AKIA[0-9A-Z]{16}'
check 'GitHub token' 'gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{40,}'
check 'Stripe / Slack / Google key' 'sk_live_[0-9A-Za-z]{20,}|xox[baprs]-[0-9A-Za-z-]{10,}|AIza[0-9A-Za-z_-]{35}'
# A database URL with a password for a host that isn't local / a test container.
check 'Database password' 'postgres(ql)?://[^:/@ ]+:(?!\$\{)[^@ ]{6,}@(?!localhost|127\.0\.0\.1|db[:/]|postgres[:/])'
if git ls-files | grep -q -E '(^|/)\.env$'; then report '.env file is committed'; fi
for f in $(git ls-files | grep -E '\.(pem|key|p12|jks|keystore)$'); do report "Key file committed: $f"; done

[ $found -eq 0 ] && echo "✓ No secrets found in the repository."
exit $found
