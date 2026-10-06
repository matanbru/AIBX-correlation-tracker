@echo off
REM AI Stock Tracker - starts the backend and frontend in separate windows.
REM Run from anywhere: paths are relative to this script's folder.

setlocal
set "ROOT=%~dp0"

node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js was not found. Install it from https://nodejs.org/
    pause
    exit /b 1
)

if not exist "%ROOT%backend\node_modules" (
    echo Installing backend dependencies...
    pushd "%ROOT%backend" && call npm install && popd
)
if not exist "%ROOT%frontend\node_modules" (
    echo Installing frontend dependencies...
    pushd "%ROOT%frontend" && call npm install && popd
)

echo Starting backend on http://localhost:5000 ...
start "AI Stock Tracker - Backend" cmd /k "cd /d "%ROOT%backend" && npm run dev"

timeout /t 3 /nobreak >nul

echo Starting frontend on http://localhost:5173 ...
start "AI Stock Tracker - Frontend" cmd /k "cd /d "%ROOT%frontend" && npm run dev"

echo.
echo The app will open in your browser at http://localhost:5173
endlocal
