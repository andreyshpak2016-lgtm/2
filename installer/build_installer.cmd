@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
set "ISCC=%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"
if not exist "%ISCC%" set "ISCC=%ProgramFiles%\Inno Setup 6\ISCC.exe"

if not exist "%ISCC%" (
  echo Inno Setup Compiler (ISCC.exe) not found.
  echo Install Inno Setup 6 from https://jrsoftware.org/isinfo.php
  echo Then open SpaceUniverse.iss in Inno Setup or run this script again.
  exit /b 1
)

if not exist "%SCRIPT_DIR%..\export\windows\SpaceUniverse.exe" (
  echo Export not found: %SCRIPT_DIR%..\export\windows\SpaceUniverse.exe
  echo Export the project from Godot 4.7.2 to ..\export\windows\ first.
  echo (See installer\README.md)
  exit /b 1
)

"%ISCC%" "%SCRIPT_DIR%SpaceUniverse.iss"
if errorlevel 1 (
  echo Build failed.
  exit /b 1
)

echo.
echo Installer built in dist\
exit /b 0
