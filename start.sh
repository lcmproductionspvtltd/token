#!/usr/bin/env sh
# BQuee launcher for Linux and macOS.
# Uses the Node.js kept in ./runtime (downloaded once if missing) – nothing is installed system-wide.
#
#   ./start.sh                 start the server
#   ./start.sh seed            load the demo data (empty database only)
#   ./start.sh seed --force    wipe everything and load the demo data
#   ./start.sh migrate         apply database migrations
#   ./start.sh reset-admin     set a new super admin password
set -e
cd "$(dirname "$0")"
APP_DIR=$(pwd)

case "$(uname -s)" in
  Linux) os=linux ;;
  Darwin) os=darwin ;;
  *) echo "Unsupported OS: $(uname -s)"; exit 1 ;;
esac
case "$(uname -m)" in
  x86_64 | amd64) arch=x64 ;;
  aarch64 | arm64) arch=arm64 ;;
  *) echo "Unsupported CPU: $(uname -m)"; exit 1 ;;
esac

NODE="$APP_DIR/runtime/$os-$arch/bin/node"
node_ok() { [ -x "$1" ] && "$1" -e "process.exit(+process.versions.node.split('.')[0] >= 20 ? 0 : 1)" >/dev/null 2>&1; }

if ! node_ok "$NODE"; then
  if command -v node >/dev/null 2>&1 && node_ok "$(command -v node)"; then
    NODE=$(command -v node)
  else
    sh "$APP_DIR/scripts/get-node.sh" "$os" "$arch" || {
      echo "Could not download Node.js. Connect to the internet once, or install Node.js 20+ (https://nodejs.org)."
      exit 1
    }
  fi
fi

[ -f .env ] || { cp .env.example .env; echo "Created .env from .env.example – set DATABASE_URL in it."; }

case "$1" in
  seed) shift; exec "$NODE" scripts/seed.js "$@" ;;
  migrate) exec "$NODE" src/db/migrate.js ;;
  reset-admin) shift; exec "$NODE" scripts/reset-admin.js "$@" ;;
  *) echo "BQuee – Node.js $("$NODE" -v)"; exec "$NODE" server.js ;;
esac
