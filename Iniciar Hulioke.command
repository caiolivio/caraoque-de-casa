#!/bin/bash
# Mac: dê dois cliques neste arquivo no Finder. Ele instala o que falta (na primeira vez),
# liga o Huliokê e abre a tela da TV no navegador. Feche esta janela para desligar.

cd "$(dirname "$0")" || exit 1
clear
echo ""
echo "  🎤  Huliokê · Life is a Huli"
echo ""

# O Terminal aberto pelo Finder nem sempre conhece o caminho do Node; tenta os lugares comuns.
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"

if ! command -v node >/dev/null 2>&1; then
  echo "  O Node.js não está instalado."
  echo "  Instale a versão LTS no site que vai abrir agora e depois abra este arquivo de novo."
  open "https://nodejs.org"
  echo ""
  read -r -p "  Aperte Enter para fechar."
  exit 1
fi

if [ ! -d node_modules ] || [ package.json -nt node_modules ]; then
  echo "  Instalando (só na primeira vez ou depois de atualizar)…"
  if ! npm install --no-fund --no-audit; then
    echo ""
    read -r -p "  A instalação falhou. Tire um print desta janela e aperte Enter para fechar."
    exit 1
  fi
  touch node_modules
fi

PORT=$(grep -E '^PORT=[0-9]+' .env 2>/dev/null | cut -d= -f2)
PORT=${PORT:-3000}
URL="http://localhost:$PORT/tv?autostart"

# Abre a TV alguns segundos depois, quando o servidor já estiver no ar.
(
  sleep 3
  if [ -d "/Applications/Google Chrome.app" ]; then
    open -na "Google Chrome" --args --kiosk --autoplay-policy=no-user-gesture-required "$URL"
  else
    open "$URL"
  fi
) &

npm start

echo ""
read -r -p "  O Huliokê foi desligado. Aperte Enter para fechar."
