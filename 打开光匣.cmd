@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 20.9 or newer, then try again.
  pause
  exit /b 1
)
node -e "for (const name of ['sharp','bmp-js','tesseract.js','@tesseract.js-data/eng','@tesseract.js-data/chi_sim']) require.resolve(name)" >nul 2>nul
if errorlevel 1 (
  call npm ci
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
node launcher.mjs
if errorlevel 1 pause
