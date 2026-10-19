@echo off
cd /d "%~dp0"
echo Gerando ARTY.exe e Setup_ARTY.exe (demora uns minutos)...
call npm run dist
if errorlevel 1 (echo. & echo Deu erro, veja a mensagem acima. & pause & exit /b 1)
echo.
echo Pronto! O instalador esta em dist\Setup_ARTY.exe
explorer dist
pause
