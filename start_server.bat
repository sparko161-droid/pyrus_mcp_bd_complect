@echo off
title Pyrus MCP Server
echo Запуск Pyrus MCP Server...
cd /d "%~dp0\pyrus_mcp_server"

:: Запуск напрямую через виртуальное окружение
.venv\Scripts\python.exe -m pyrus_mcp.server

pause
