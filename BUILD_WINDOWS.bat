@echo off
setlocal
cd /d "%~dp0"
echo ================================================
echo   Infinity Dental Clinic - Windows Build
 echo ================================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not installed.
  echo Install Node.js LTS, restart Windows, then run this file again.
  pause
  exit /b 1
)
echo Node.js found:
node -v
npm -v
 echo.
echo Installing build dependencies. This needs internet ONCE.
npm install
if errorlevel 1 (
  echo.
  echo ERROR: npm install failed. Check your internet connection and try again.
  pause
  exit /b 1
)
echo.
echo Building Windows installer and portable EXE...
npm run dist
if errorlevel 1 (
  echo.
  echo ERROR: Windows build failed. The window above contains the reason.
  pause
  exit /b 1
)
echo.
echo BUILD COMPLETE.
echo Open the RELEASE folder. It contains the installer and portable EXE.
pause
