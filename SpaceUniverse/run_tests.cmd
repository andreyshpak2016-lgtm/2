@echo off
setlocal
REM Run project tests on each compilation/build.
REM Configure GODOT_EXE to your Godot 4.7.2 console executable, e.g.:
REM   set GODOT_EXE=C:\Tools\Godot_v4.7.2-stable_win64_console.exe

if "%GODOT_EXE%"=="" (
  echo [tests] GODOT_EXE is not set. Set it to Godot 4.7.2 executable to run automated tests.
  echo [tests] Static checks can be run manually; no GdUnit/GUT test suite is configured yet.
  exit /b 0
)

pushd "%~dp0"
echo [tests] Running Godot headless checks...
"%GODOT_EXE%" --headless --path . --quit --check-only
if errorlevel 1 (
  echo [tests] FAIL: headless check failed.
  popd
  exit /b 1
)

REM If a test framework is added (e.g. GdUnit4), run it here, e.g.:
REM "%GODOT_EXE%" --headless --path . -s res://addons/gdUnit4/bin/GdUnitCmdTool.gd -a res://tests

echo [tests] PASS
popd
exit /b 0
