# Bundled Node.js runtime
BQuee runs on Node.js, kept inside this folder, so nothing has to be installed on the computer.

| Folder | Platform | Included |
|---|---|---|
| `linux-x64/` | Linux 64-bit (Ubuntu, Debian, RHEL, Rocky, Amazon Linux… with glibc 2.28+) | ✅ Node.js v22 LTS, official build |
| `win-x64/`, `win-arm64/` | Windows | Downloaded automatically by `start.bat` on first run (official build, SHA-256 verified) |
| `darwin-x64/`, `darwin-arm64/` | macOS Intel / Apple Silicon | Downloaded automatically by `start.sh` on first run |
| `linux-arm64/` | Raspberry Pi 4/5, ARM servers | Downloaded automatically by `start.sh` on first run |

To make a package that runs **fully offline on every platform**, run `sh scripts/fetch-all-runtimes.sh` once on a computer with internet, then zip the folder.

Node.js is © OpenJS Foundation and contributors, MIT licence – see `linux-x64/LICENSE`.
