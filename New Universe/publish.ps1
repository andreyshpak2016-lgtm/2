# Публикация новой версии «New Universe»:
#   прогонка -> коммит -> тег vX.Y.Z -> push ветки и тега в origin.
#
# Использование:
#   .\publish.ps1 -Message "описание изменений"              # патч +1 автоматически
#   .\publish.ps1 -Message "описание" -Version 1.1.0         # версия вручную
param(
    [Parameter(Mandatory = $true)][string]$Message,
    [string]$Version = ''
)

$ErrorActionPreference = 'Stop'
$env:GIT_TERMINAL_PROMPT = '0'   # не вешаемся на запрос пароля в неинтерактивном режиме

$Git  = 'C:\Program Files\Git\cmd\git.exe'
$Root = $PSScriptRoot                        # ...\New Universe
$Repo = Split-Path $Root -Parent             # корень репозитория
$Path = Split-Path $Root -Leaf               # 'New Universe'

Write-Host "=== 1/4 Прогонка ===" -ForegroundColor Cyan
& (Join-Path $Root 'run-checks.ps1')
if ($LASTEXITCODE -ne 0) { throw 'Прогонка не пройдена — публикация отменена' }

Write-Host "=== 2/4 Версия ===" -ForegroundColor Cyan
if (-not $Version) {
    $latest = & $Git -C $Repo tag --list |
        Where-Object { $_ -match '^v\d+\.\d+\.\d+$' } |
        Sort-Object { [version]($_ -replace '^v', '') } |
        Select-Object -Last 1
    if ($latest) {
        $v = [version]($latest -replace '^v', '')
        $Version = '{0}.{1}.{2}' -f $v.Major, $v.Minor, $v.Build + 1
    } else {
        $Version = '1.0.0'
    }
}
$Tag = "v$Version"
Write-Host "Версия: $Tag"

# Фиксируем версию в файле VERSION
$Version | Set-Content -Encoding UTF8 (Join-Path $Root 'VERSION')

Write-Host "=== 3/4 Коммит ===" -ForegroundColor Cyan
& $Git -C $Repo add -A -- $Path
& $Git -C $Repo diff --cached --quiet
if ($LASTEXITCODE -eq 0) { throw 'Нет изменений для коммита — версия не публикуется' }
& $Git -C $Repo commit -m "${Tag}: $Message" | Out-Host

Write-Host "=== 4/4 Публикация в git (origin) ===" -ForegroundColor Cyan
& $Git -C $Repo tag -a $Tag -m $Message
if (-not (Get-Command timeout -ErrorAction SilentlyContinue)) {
    # push может занять время
}
$push = & $Git -C $Repo push origin HEAD 2>&1
if ($LASTEXITCODE -ne 0) { throw "Push ветки не удался: $($push -join ' ')" }
$pushTag = & $Git -C $Repo push origin $Tag 2>&1
if ($LASTEXITCODE -ne 0) { throw "Push тега $Tag не удался: $($pushTag -join ' ')" }

Write-Host ""
Write-Host "Готово: $Tag опубликована в origin" -ForegroundColor Green
& $Git -C $Repo log --oneline -1 | Out-Host