@echo off
rem Ensure current directory is project root
cd /d "%~dp0"

title EcoSort Platform - Running (Ctrl+C to stop)

rem Run unified server runner via PowerShell so Ctrl+C shuts down everything immediately
rem with ZERO "Terminate batch job (Y/N)?" prompts.
powershell -NoProfile -ExecutionPolicy Bypass -Command "& { node start_servers.js }"
