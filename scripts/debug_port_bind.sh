#!/usr/bin/env bash
# Quick port binding diagnostics. Run with sudo if you hit EPERM on bind.
# Usage: sudo bash scripts/debug_port_bind.sh [port] [host]

set -euo pipefail

PORT="${1:-4010}"
HOST="${2:-127.0.0.1}"

echo "== Port bind debug =="
echo "User: $(id)"
echo "CWD: $(pwd)"
echo "Target: ${HOST}:${PORT}"
echo

echo "== Existing listeners on port ${PORT} (ss) =="
if command -v ss >/dev/null 2>&1; then
  ss -tulnp | grep -E ":${PORT}\\b" || true
else
  echo "ss not available"
fi
echo

echo "== Existing listeners on port ${PORT} (lsof) =="
if command -v lsof >/dev/null 2>&1; then
  lsof -i :"${PORT}" || true
else
  echo "lsof not available"
fi
echo

echo "== Node capabilities (getcap) =="
if command -v getcap >/dev/null 2>&1; then
  getcap "$(command -v node)" || true
else
  echo "getcap not available"
fi
echo

echo "== SELinux status (getenforce) =="
if command -v getenforce >/dev/null 2>&1; then
  getenforce || true
else
  echo "getenforce not available"
fi
echo

echo "== Attempting bind with Python =="
python3 - "$PORT" "$HOST" <<'PY'
import os, socket, sys
port = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get("PORT", 4010))
host = sys.argv[2] if len(sys.argv) > 2 else os.environ.get("HOST", "127.0.0.1")
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
try:
    s.bind((host, port))
    s.listen(1)
    print(f"SUCCESS: bound {host}:{port}")
except Exception as e:
    print(f"FAIL: could not bind {host}:{port}: {e}")
finally:
    s.close()
PY
echo

echo "== Done =="
