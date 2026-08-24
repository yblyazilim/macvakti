@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title Mac Vakti - Derleme
cd /d "%~dp0"
set MARKER=%USERPROFILE%\Desktop\MV_DERLE_DONE.txt
set LOG=%USERPROFILE%\Desktop\MV_DERLE_LOG.txt
if exist "%MARKER%" del /f /q "%MARKER%"

echo ============================================
echo   MAC VAKTI - DERLEME
echo ============================================
echo.

echo [1/4] JDK tespiti...
if defined JAVA_HOME if exist "%JAVA_HOME%\bin\java.exe" goto :java_ok
set "JH="
if exist "C:\Program Files\Android\Android Studio\jbr\bin\java.exe" set "JH=C:\Program Files\Android\Android Studio\jbr"
if not defined JH if exist "%LOCALAPPDATA%\Programs\Android Studio\jbr\bin\java.exe" set "JH=%LOCALAPPDATA%\Programs\Android Studio\jbr"
if not defined JH for /d %%D in ("C:\Program Files\Android\openjdk\jdk*") do if exist "%%D\bin\java.exe" set "JH=%%D"
if not defined JH for /d %%D in ("C:\Program Files\Java\jdk*") do if exist "%%D\bin\java.exe" set "JH=%%D"
if not defined JH for /d %%D in ("C:\Program Files\Eclipse Adoptium\jdk*") do if exist "%%D\bin\java.exe" set "JH=%%D"
if not defined JH for /d %%D in ("C:\Program Files\Microsoft\jdk*") do if exist "%%D\bin\java.exe" set "JH=%%D"
if not defined JH (
  echo JDK bulunamadi! Android Studio veya JDK 17 kurulu olmali.
  echo JDK_YOK > "%MARKER%"
  pause
  exit /b 1
)
set "JAVA_HOME=!JH!"
:java_ok
echo    JAVA_HOME=%JAVA_HOME%

echo [2/4] Web dosyalari senkronlaniyor...
call npx cap sync android > "%LOG%" 2>&1
if errorlevel 1 goto hata

echo [3/4] Android derleniyor (ilk derleme uzun surebilir)...
cd android
call gradlew.bat assembleDebug >> "%LOG%" 2>&1
set GRADLE_SONUC=%errorlevel%
cd ..
if not "%GRADLE_SONUC%"=="0" goto hata

echo [4/4] Cikti kopyalaniyor...
if exist "android\app\build\outputs\apk\debug\app-debug.apk" (
  copy /y "android\app\build\outputs\apk\debug\app-debug.apk" "%USERPROFILE%\Desktop\MacVakti-test.apk" >nul
  echo BASARILI > "%MARKER%"
  echo.
  echo ============================================
  echo   DERLEME BASARILI
  echo   Masaustu\MacVakti-test.apk
  echo ============================================
) else (
  echo APK_BULUNAMADI > "%MARKER%"
  echo APK olusmadi!
)
pause
exit /b 0

:hata
cd /d "%~dp0"
echo HATA > "%MARKER%"
echo.
echo !!! DERLEME HATASI - Masaustu\MV_DERLE_LOG.txt dosyasina bakin
pause
exit /b 1
