#!/usr/bin/env bash
# Sobe o servidor e abre a TV em tela cheia com som liberado.
cd "$(dirname "$0")"
[ -d node_modules ] || npm install
npm start &
sleep 3
URL="http://localhost:${PORT:-3000}/tv?autostart"
for b in google-chrome chromium chromium-browser "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; do
  if command -v "$b" >/dev/null 2>&1 || [ -x "$b" ]; then
    "$b" --kiosk --autoplay-policy=no-user-gesture-required "$URL" >/dev/null 2>&1 &
    break
  fi
done
wait
