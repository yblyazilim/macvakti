@echo off
chcp 65001 >nul
title Mac Vakti - Kurulum
cd /d "%~dp0"
echo ============================================
echo   MAC VAKTI - ILK KURULUM
echo ============================================
echo.
echo [1/4] Bagimliliklar yukleniyor (npm install)...
call npm install
if errorlevel 1 goto hata
echo.
echo [2/4] Android platformu ekleniyor...
if not exist "android" (
  call npx cap add android
  if errorlevel 1 goto hata
) else (
  echo    Android klasoru zaten var, atlaniyor.
)
echo.
echo [3/4] Web dosyalari Android'e senkronlaniyor...
call npx cap sync android
if errorlevel 1 goto hata
echo.
echo [4/4] Dogrulama testleri...
call node toplayici/test/dogrula.js
echo.
echo ============================================
echo   KURULUM TAMAMLANDI
echo ============================================
echo Sonraki adim: RELEASE_AUTO.bat ile derleme
echo KURULUM_TAMAM > "%USERPROFILE%\Desktop\MV_KURULUM_DONE.txt"
pause
exit /b 0

:hata
echo.
echo !!! HATA OLUSTU - yukaridaki mesaji kontrol edin
echo KURULUM_HATA > "%USERPROFILE%\Desktop\MV_KURULUM_DONE.txt"
pause
exit /b 1
