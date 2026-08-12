@echo off
REM AI Stock Tracker - Start Script for Windows
echo.
echo ========================================
echo   AI Stock Tracker Platform Startup
echo ========================================
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found! Please install it first.
    pause
    exit /b 1
)

echo [OK] Node.js detected
echo.
echo ========================================
echo   Starting Backend Server...
echo ========================================
echo.
echo Opening new window for backend...
echo.

REM Open new window for backend
start "AI Stock Tracker - Backend" cmd /k "cd /d c:\Users\student\Desktop\Ideas\ai-stock-tracker\backend && npm run dev"

timeout /t 3 /nobreak

echo.
echo ========================================
echo   Starting Frontend Server...
echo ========================================
echo.
echo Opening new window for frontend...
echo.

REM Open new window for frontend
start "AI Stock Tracker - Frontend" cmd /k "cd /d c:\Users\student\Desktop\Ideas\ai-stock-tracker\frontend && npm run dev"

timeout /t 3 /nobreak

echo.
echo ========================================
echo   Platform is Starting!
echo ========================================
echo.
echo Backend Server:  http://localhost:5000
echo Frontend App:    http://localhost:5173
echo.
echo Frontend will open automatically in your browser.
echo.
echo IMPORTANT:
echo - Make sure MongoDB is running (local or cloud)
echo - You should see "MongoDB connected" in backend window
echo.
pause
