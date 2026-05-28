@echo off
setlocal enabledelayedexpansion

echo ========================================
echo TERROR IN THE JUNGLE - Asset Optimizer
echo Using pngquant + optipng for best results
echo ========================================

REM Set paths
set ASSETS_DIR=..\public\assets
set OUTPUT_DIR=..\public\assets_optimized
set BACKUP_DIR=..\assets_backup_%date:~-4%%date:~3,2%%date:~0,2%_%time:~0,2%%time:~3,2%

REM Create directories
if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

REM Check if tools are installed
where pngquant >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: pngquant not found! Run install_tools.bat first
    pause
    exit /b 1
)

where optipng >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: optipng not found! Run install_tools.bat first
    pause
    exit /b 1
)

echo.
echo [1/4] Creating backup...
xcopy "%ASSETS_DIR%\*.*" "%BACKUP_DIR%\" /E /I /Q /Y
echo Backup created in %BACKUP_DIR%

echo.
echo [2/4] Optimizing PNG files...
echo ----------------------------------------

set count=0
set total_original=0
set total_optimized=0

for %%f in (%ASSETS_DIR%\*.png) do (
    set /a count+=1
    echo Processing: %%~nxf

    REM Get original size
    for %%A in ("%%f") do set size_before=%%~zA

    REM Step 1: Use pngquant for lossy compression (preserving quality)
    pngquant --quality=85-100 --speed=1 --force --output "%OUTPUT_DIR%\%%~nxf" "%%f" 2>nul

    REM Step 2: Use optipng for additional lossless compression
    optipng -o5 -quiet "%OUTPUT_DIR%\%%~nxf" 2>nul

    REM Get new size
    for %%A in ("%OUTPUT_DIR%\%%~nxf") do set size_after=%%~zA

    REM Calculate reduction
    set /a reduction=(!size_before!-!size_after!)*100/!size_before!
    echo   Original: !size_before! bytes
    echo   Optimized: !size_after! bytes
    echo   Reduction: !reduction!%%
    echo.
)

echo.
echo [3/4] Copying optimized audio files...
echo ----------------------------------------

REM Copy already optimized audio files
if exist "%ASSETS_DIR%\optimized\*.ogg" (
    copy "%ASSETS_DIR%\optimized\*.ogg" "%OUTPUT_DIR%\" >nul
    echo Copied OGG files
)

if exist "%ASSETS_DIR%\optimized\*.wav" (
    copy "%ASSETS_DIR%\optimized\*.wav" "%OUTPUT_DIR%\" >nul
    echo Copied WAV files
)

echo.
echo [4/4] Generating report...
echo ----------------------------------------

REM Create a simple report
echo Optimization Report > "%OUTPUT_DIR%\optimization_report.txt"
echo =================== >> "%OUTPUT_DIR%\optimization_report.txt"
echo Date: %date% %time% >> "%OUTPUT_DIR%\optimization_report.txt"
echo Files processed: !count! >> "%OUTPUT_DIR%\optimization_report.txt"
echo Backup location: %BACKUP_DIR% >> "%OUTPUT_DIR%\optimization_report.txt"
echo Output location: %OUTPUT_DIR% >> "%OUTPUT_DIR%\optimization_report.txt"

echo.
echo ========================================
echo OPTIMIZATION COMPLETE!
echo ========================================
echo.
echo Files optimized: !count!
echo Backup saved to: %BACKUP_DIR%
echo Optimized assets in: %OUTPUT_DIR%
echo.
echo Next steps:
echo 1. Test the game with optimized assets
echo 2. If everything works, update your code to use assets_optimized/
echo 3. If issues occur, restore from backup
echo.
pause