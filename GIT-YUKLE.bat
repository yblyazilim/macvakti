@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title Mac Vakti - GitHub'a Yukle
cd /d "%~dp0"
set MARKER=%USERPROFILE%\Desktop\MV_GIT_DONE.txt
set LOG=%USERPROFILE%\Desktop\MV_GIT_LOG.txt
if exist "%MARKER%" del /f /q "%MARKER%"

echo ============================================
echo   MAC VAKTI - GITHUB'A YUKLEME
echo ============================================
echo.

echo [1/5] Git tespiti...
where git >nul 2>&1
if %errorlevel%==0 (
  set "GIT=git"
) else (
  set "GIT="
  if exist "%LOCALAPPDATA%\GitHubDesktop\app-*\resources\app\git\cmd\git.exe" (
    for /d %%D in ("%LOCALAPPDATA%\GitHubDesktop\app-*") do if exist "%%D\resources\app\git\cmd\git.exe" set "GIT=%%D\resources\app\git\cmd\git.exe"
  )
  if not defined GIT if exist "C:\Program Files\Git\cmd\git.exe" set "GIT=C:\Program Files\Git\cmd\git.exe"
)
if not defined GIT (
  echo Git bulunamadi! GitHub Desktop veya Git for Windows kurulu olmali.
  echo GIT_YOK > "%MARKER%"
  pause
  exit /b 1
)
echo    Git: !GIT!

echo [2/5] Depo hazirlaniyor...
if not exist ".git" (
  "!GIT!" init > "%LOG%" 2>&1
  "!GIT!" branch -M main >> "%LOG%" 2>&1
)
"!GIT!" remote remove origin >nul 2>&1
"!GIT!" remote add origin https://github.com/yblyazilim/macvakti.git >> "%LOG%" 2>&1

echo [3/5] Dosyalar ekleniyor...
"!GIT!" add -A >> "%LOG%" 2>&1
"!GIT!" -c user.name="yblyazilim" -c user.email="brk.ygt9496@gmail.com" commit -m "Mac Vakti: ilk surum - veri toplama, yayin kanali dogrulama, uygulama" >> "%LOG%" 2>&1

echo [4/5] GitHub'a gonderiliyor...
echo     (Tarayicida GitHub girisi istenebilir - onaylayin)
"!GIT!" push -u origin main >> "%LOG%" 2>&1
if errorlevel 1 goto hata

echo [5/5] Dogrulama...
"!GIT!" log --oneline -1 >> "%LOG%" 2>&1
echo BASARILI > "%MARKER%"
echo.
echo ============================================
echo   YUKLEME BASARILI
echo   https://github.com/yblyazilim/macvakti
echo ============================================
pause
exit /b 0

:hata
echo HATA > "%MARKER%"
echo.
echo !!! GONDERIM HATASI
echo Masaustu\MV_GIT_LOG.txt dosyasina bakin.
echo Kimlik dogrulama gerekiyorsa GitHub Desktop ile giris yapip tekrar deneyin.
pause
exit /b 1
