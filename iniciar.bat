@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Instalando dependencias...
  call npm install || pause
)
start "Hulioke" cmd /k npm start
timeout /t 3 /nobreak >nul
start chrome --kiosk --autoplay-policy=no-user-gesture-required "http://localhost:3000/tv?autostart"
