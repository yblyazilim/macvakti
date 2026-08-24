@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title Mac Vakti - Degisiklikleri GitHub'a Gonder
cd /d "%~dp0"

echo ============================================
echo   MAC VAKTI - GITHUB'A GONDER
echo ============================================
echo.

rem --- Git bul ---
where git >nul 2>&1
if %errorlevel%==0 (set "GIT=git") else (set "GIT=")
if not defined GIT if exist "C:\Program Files\Git\cmd\git.exe" set "GIT=C:\Program Files\Git\cmd\git.exe"
if not defined GIT (
  for /d %%D in ("%LOCALAPPDATA%\GitHubDesktop\app-*") do if exist "%%D\resources\app\git\cmd\git.exe" set "GIT=%%D\resources\app\git\cmd\git.exe"
)
if not defined GIT ( echo [HATA] Git bulunamadi. & pause & exit /b 1 )
echo Git: !GIT!
echo.

rem Onceki bir git islemi yarim kalmissa bayat kilit dosyasi kalir
rem ve butun git komutlari calismaz. Varsa temizle.
if exist ".git\\index.lock" (
  echo    Bayat kilit dosyasi temizleniyor...
  del /f /q ".git\\index.lock"
)

echo [1/4] GitHub'daki son hal aliniyor...
"!GIT!" fetch origin main
if errorlevel 1 ( echo [HATA] fetch basarisiz. & pause & exit /b 1 )

echo [2/4] Yerel degisiklikler GitHub'in ustune tasiniyor...
rem --mixed: HEAD ve indeks origin/main'e gider, CALISMA DOSYALARINA DOKUNULMAZ.
rem Boylece asagidaki 'add' yalnizca gercek farklari yakalar.
"!GIT!" reset --mixed origin/main
if errorlevel 1 ( echo [HATA] reset basarisiz. & pause & exit /b 1 )

echo [3/4] Degisiklikler isaretleniyor...
"!GIT!" add -A
"!GIT!" status --short
echo.

"!GIT!" diff --cached --quiet
if not errorlevel 1 (
  echo Gonderilecek degisiklik yok. Her sey guncel.
  echo.
  pause
  exit /b 0
)

set "MESAJ=%~1"
if "%MESAJ%"=="" set "MESAJ=guncelleme"

"!GIT!" -c user.name="yblyazilim" -c user.email="brk.ygt9496@gmail.com" commit -m "%MESAJ%"
if errorlevel 1 ( echo [HATA] commit basarisiz. & pause & exit /b 1 )

echo [4/4] GitHub'a gonderiliyor...
"!GIT!" push origin HEAD:main
if errorlevel 1 (
  echo.
  echo [HATA] Gonderim basarisiz. Kimlik dogrulama gerekiyor olabilir.
  echo GitHub Desktop ile giris yapip tekrar deneyin.
  pause
  exit /b 1
)

echo.
echo ============================================
echo   GONDERILDI
echo   https://github.com/yblyazilim/macvakti
echo ============================================
"!GIT!" log --oneline -1
echo.
pause
