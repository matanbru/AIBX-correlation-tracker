@echo off
REM AI Stock Tracker - Quick Start (No MongoDB Required!)
REM This script starts both backend and frontend servers

echo.
echo ========================================
echo   AI Stock Tracker - Starting...
echo ========================================
echo.

REM Check Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not installed!
    echo Install from: https://nodejs.org/
    pause
    exit /b 1
)

echo [OK] Node.js detected
echo.

REM Start Backend
echo Starting Backend Server (Port 5000)...
echo.
start "AI Stock Tracker - Backend" cmd /k "cd /d c:\Users\student\Desktop\Ideas\ai-stock-tracker\backend && npm run dev"

REM Wait for backend to start
timeout /t 3

REM Start Frontend
echo Starting Frontend Server (Port 5173)...
echo.
start "AI Stock Tracker - Frontend" cmd /k "cd /d c:\Users\student\Desktop\Ideas\ai-stock-tracker\frontend && npm run dev"

timeout /t 2

echo.
echo ========================================
echo   Platform Starting!
echo ========================================
echo.
echo Backend:  http://localhost:5000
echo Frontend: http://localhost:5173
echo.
echo Features:
echo   - Live price updates every 5 seconds
echo   - Real-time WebSocket connection
echo   - 10 AI companies with dynamic pricing
echo   - No database needed!
echo.
echo Frontend will open automatically...
echo.
pause
