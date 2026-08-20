@echo off
echo Очистка остатков службы Windows (если есть)...
sc stop PyrusMCPServer >nul 2>&1
sc delete PyrusMCPServer >nul 2>&1

cd /d "%~dp0\pyrus_mcp_server"
echo Собираем и запускаем Docker-контейнер Pyrus MCP...
docker compose down
docker compose up -d --build

echo.
echo Готово! Контейнер Pyrus MCP запущен на порту 8000.
pause
