@echo off
echo ======================================
echo Installing PNG Optimization Tools
echo ======================================

REM Check if Chocolatey is installed
where choco >nul 2>nul
if %errorlevel% neq 0 (
    echo Chocolatey not found. Installing Chocolatey...
    echo Please run this in Administrator PowerShell:
    echo Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
    pause
    exit /b 1
)

echo Installing pngquant and optipng via Chocolatey...
choco install pngquant optipng -y

echo.
echo Installation complete!
echo You can now run optimize_assets.bat
pause