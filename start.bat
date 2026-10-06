@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
chcp 65001 >nul

echo ================================================
echo    20/10 DEADLINE RUN - khoi dong may chu LAN
echo ================================================
echo.

rem --- Tim node.exe: uu tien PATH, neu khong co thi dung node di kem Kiro-Cli ---
set "NODE_EXE=node"
where node >nul 2>nul
if errorlevel 1 (
  if exist "%LOCALAPPDATA%\Kiro-Cli\node.exe" (
    set "NODE_EXE=%LOCALAPPDATA%\Kiro-Cli\node.exe"
  ) else (
    echo [LOI] Khong tim thay Node.js. Hay cai Node 20+ tu https://nodejs.org
    pause
    exit /b 1
  )
)

rem --- Hoi xac nhan xoa bang xep hang ---
set "RESET=N"
set /p "RESET=Xoa toan bo bang xep hang va bat dau moi? (y/N): "

if /i "!RESET!"=="y" (
  if exist "data\scores.json" (
    rem Sao luu diem cu kem nhan thoi gian truoc khi xoa.
    for /f "tokens=1-4 delims=/-: " %%a in ("!date! !time!") do set "STAMP=%%a%%b%%c_%%d"
    set "STAMP=!STAMP: =0!"
    copy /y "data\scores.json" "data\scores.backup-!STAMP!.json" >nul 2>nul
    echo   - Da sao luu diem cu vao: data\scores.backup-!STAMP!.json
  )
  if not exist "data" mkdir "data"
  > "data\scores.json" echo {}
  echo   - Da xoa sach bang xep hang.
) else (
  echo   - Giu nguyen bang xep hang hien tai.
)

rem --- Luon xoa thumbnail cu de tao lai tu anh moi nhat ---
if exist "characters\thumbs" (
  rmdir /s /q "characters\thumbs"
  echo   - Da xoa thumbnail cu (se tao lai khi khoi dong).
)

echo.
echo Dang khoi dong may chu...
echo.
"%NODE_EXE%" server.js

echo.
echo May chu da dung. Nhan phim bat ky de dong cua so.
pause >nul
