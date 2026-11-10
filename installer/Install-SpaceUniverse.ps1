param(
  [string]$SourceDir = (Join-Path $PSScriptRoot "..\export\windows"),
  [string]$InstallDir = (Join-Path $env:LOCALAPPDATA "Space Universe"),
  [string]$ExeName = "SpaceUniverse.exe",
  [switch]$NoDesktopShortcut
)

$ErrorActionPreference = "Stop"

$SourceDir = (Resolve-Path $SourceDir -ErrorAction Stop).Path
$exePath = Join-Path $SourceDir $ExeName
if (-not (Test-Path $exePath)) {
  Write-Error "Export not found: $exePath`nExport the game from Godot 4.7.2 to export\windows first (see installer\README.md)."
}

Write-Host "Installing Space Universe..."
Write-Host "  From: $SourceDir"
Write-Host "  To:   $InstallDir"

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Copy-Item -Path (Join-Path $SourceDir "*") -Destination $InstallDir -Recurse -Force

$installedExe = Join-Path $InstallDir $ExeName
if (-not (Test-Path $installedExe)) {
  Write-Error "Installation failed: $installedExe not found after copy."
}

# Create shortcuts
$WshShell = New-Object -ComObject WScript.Shell
$startMenuDir = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Space Universe"
New-Item -ItemType Directory -Force -Path $startMenuDir | Out-Null

$shortcut = $WshShell.CreateShortcut((Join-Path $startMenuDir "Space Universe.lnk"))
$shortcut.TargetPath = $installedExe
$shortcut.WorkingDirectory = $InstallDir
$shortcut.Description = "Space Universe"
$shortcut.Save()

# Uninstall helper (shortcut opens folder; manual removal) + uninstall script
$uninstallScript = @"
Write-Host 'Removing Space Universe...'
Remove-Item -LiteralPath '$InstallDir' -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath '$startMenuDir' -Recurse -Force -ErrorAction SilentlyContinue
`$desk = [Environment]::GetFolderPath('Desktop')
Remove-Item -LiteralPath (Join-Path `$desk 'Space Universe.lnk') -Force -ErrorAction SilentlyContinue
Write-Host 'Uninstalled.'
"@
$uninstallPath = Join-Path $InstallDir "Uninstall-SpaceUniverse.ps1"
Set-Content -Path $uninstallPath -Value $uninstallScript -Encoding UTF8

$unShortcut = $WshShell.CreateShortcut((Join-Path $startMenuDir "Uninstall Space Universe.lnk"))
$unShortcut.TargetPath = "powershell.exe"
$unShortcut.Arguments = "-ExecutionPolicy Bypass -File `"$uninstallPath`""
$unShortcut.WorkingDirectory = $InstallDir
$unShortcut.Description = "Uninstall Space Universe"
$unShortcut.Save()

if (-not $NoDesktopShortcut) {
  $desktop = [Environment]::GetFolderPath("Desktop")
  $dShortcut = $WshShell.CreateShortcut((Join-Path $desktop "Space Universe.lnk"))
  $dShortcut.TargetPath = $installedExe
  $dShortcut.WorkingDirectory = $InstallDir
  $dShortcut.Description = "Space Universe"
  $dShortcut.Save()
}

Write-Host "Done. Launch from Start Menu or: $installedExe"
