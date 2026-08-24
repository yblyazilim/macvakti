@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title Mac Vakti - GitHub'a Guncelle
cd /d "%~dp0"
set MARKER=%USERPROFILE%\Desktop\MV_GIT_DONE.txt
set LOG=%USERPROFILE%\Desktop\MV_GIT_LOG.txt
if exist "%MARKER%" del /f /q "%MARKER%"

where git >nul 2>&1
if %errorlevel%==0 (set "GIT=git") else (
  set "GIT="
  for /d %%D in ("%LOCALAPPDATA%\GitHubDesktop\app-*") do if exist "%%D\resources\app\git\cmd\git.exe" set "GIT=%%D\resources\app\git\cmd\git.exe"
  if not defined GIT if exist "C:\Program Files\Git\cmd\git.exe" set "GIT=C:\Program Files\Git\cmd\git.exe"
)
if not defined GIT ( echo GIT_YOK > "%MARKER%" & echo Git bulunamadi & pause & exit /b 1 )

echo Guncellemeler gonderiliyor...
"!GIT!" pull --rebase --autostash origin main > "%LOG%" 2>&1
"!GIT!" add -A >> "%LOG%" 2>&1
"!GIT!" -c user.name="yblyazilim" -c user.email="brk.ygt9496@gmail.com" commit -m "guncelleme" >> "%LOG%" 2>&1
"!GIT!" push origin main >> "%LOG%" 2>&1
if errorlevel 1 ( echo HATA > "%MARKER%" & echo Gonderim hatasi - MV_GIT_LOG.txt & pause & exit /b 1 )
echo BASARILI > "%MARKER%"
echo Gonderildi.
timeout /t 3 >nul
exit /b 0
