@echo off
cd /d "%~dp0"
echo Instalando dependencias do A.R.T.Y...
call npm install
if errorlevel 1 (echo. & echo Deu erro. Voce instalou o Node.js? https://nodejs.org & pause & exit /b 1)
echo.
echo Pronto! Agora rode 2_testar.bat
pause
