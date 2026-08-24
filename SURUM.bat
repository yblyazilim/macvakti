@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title Mac Vakti - Play Surumu (imzali AAB)

echo ==========================================
echo   MAC VAKTI - PLAY SURUMU
echo ==========================================
echo.

rem --- JDK bul (DERLE.bat ile ayni yontem) ---
if defined JAVA_HOME if exist "%JAVA_HOME%\bin\keytool.exe" goto :java_ok
set "JH="
if exist "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" set "JH=C:\Program Files\Android\Android Studio\jbr"
if not defined JH if exist "%LOCALAPPDATA%\Programs\Android Studio\jbr\bin\keytool.exe" set "JH=%LOCALAPPDATA%\Programs\Android Studio\jbr"
if not defined JH for /d %%D in ("C:\Program Files\Android\openjdk\jdk*") do if exist "%%D\bin\keytool.exe" set "JH=%%D"
if not defined JH for /d %%D in ("C:\Program Files\Java\jdk*") do if exist "%%D\bin\keytool.exe" set "JH=%%D"
if not defined JH for /d %%D in ("C:\Program Files\Eclipse Adoptium\jdk*") do if exist "%%D\bin\keytool.exe" set "JH=%%D"
if not defined JH for /d %%D in ("C:\Program Files\Microsoft\jdk*") do if exist "%%D\bin\keytool.exe" set "JH=%%D"
if not defined JH (
  echo [HATA] JDK bulunamadi. Android Studio veya JDK 17 kurulu olmali.
  pause
  exit /b 1
)
set "JAVA_HOME=!JH!"
:java_ok
set "KEYTOOL=%JAVA_HOME%\bin\keytool.exe"
echo JDK: %JAVA_HOME%
echo.

set "KS=%~dp0android\macvakti.keystore"
set "KSPROP=%~dp0android\keystore.properties"

if exist "%KS%" goto :derle

echo Imza anahtari (keystore) bulunamadi. Simdi olusturulacak.
echo.
echo ONEMLI: Bu sifreyi KAYBETME. Kaybedersen uygulamayi
echo bir daha guncelleyemezsin.
echo.
set /p KSPASS=Belirlemek istedigin sifre (en az 6 karakter): 
if "!KSPASS!"=="" (echo [HATA] Sifre bos olamaz. & pause & exit /b 1)

"%KEYTOOL%" -genkeypair -v -keystore "%KS%" ^
  -alias macvakti -keyalg RSA -keysize 2048 -validity 10000 ^
  -storepass "!KSPASS!" -keypass "!KSPASS!" ^
  -dname "CN=Mac Vakti, O=Berk, C=TR"
if errorlevel 1 (echo [HATA] Keystore olusturulamadi. & pause & exit /b 1)

>  "%KSPROP%" echo storeFile=../macvakti.keystore
>> "%KSPROP%" echo storePassword=!KSPASS!
>> "%KSPROP%" echo keyAlias=macvakti
>> "%KSPROP%" echo keyPassword=!KSPASS!

echo.
echo [TAMAM] Keystore olusturuldu: %KS%
echo         Bu dosyayi ve sifreni YEDEKLE.
echo.

:derle
echo Web dosyalari kopyalaniyor...
call npx cap sync android
if errorlevel 1 (echo [HATA] cap sync basarisiz. & pause & exit /b 1)

echo.
echo Imzali AAB derleniyor...
cd android
call gradlew.bat bundleRelease
if errorlevel 1 (echo [HATA] Derleme basarisiz. & cd .. & pause & exit /b 1)
cd ..

set "AAB=%~dp0android\app\build\outputs\bundle\release\app-release.aab"
if exist "%AAB%" (
  copy /y "%AAB%" "%USERPROFILE%\Desktop\MacVakti-play.aab" >nul
  echo.
  echo ==========================================
  echo   TAMAM. Masaustunde: MacVakti-play.aab
  echo   Play Console'a bu dosyayi yukle.
  echo ==========================================
) else (
  echo [HATA] AAB bulunamadi.
)
echo.
pause
