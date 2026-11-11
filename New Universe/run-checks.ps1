# Прогонка: базовые проверки целостности проекта «New Universe».
# Выводит статус каждой проверки, код возврата 0 = всё OK, 1 = есть ошибки.
# По мере развития проекта сюда добавляются реальные тесты (см. tests/).
param()

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
$failures = 0

function Check($name, $condition) {
    if ($condition) {
        Write-Host "[OK]   $name" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] $name" -ForegroundColor Red
        $script:failures++
    }
}

Write-Host "=== Прогонка проекта New Universe ==="

# 1. Обязательная структура
foreach ($item in @('README.md', '.gitignore', 'src', 'assets', 'docs', 'tests')) {
    Check "структура: $item" (Test-Path (Join-Path $Root $item))
}

# 2. README заполнен
$readme = Get-Item (Join-Path $Root 'README.md') -ErrorAction SilentlyContinue
Check 'README.md содержит описание' ($null -ne $readme -and $readme.Length -ge 200)

# 3. Файлы в src не пустые (если есть)
$srcFiles = Get-ChildItem (Join-Path $Root 'src') -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -ne '.gitkeep' }
$emptySrc = @($srcFiles | Where-Object { $_.Length -eq 0 })
Check 'в src/ нет пустых файлов' ($emptySrc.Count -eq 0)

# 4. Тесты (пока нет тестовых файлов — структура tests/ на месте)
$testFiles = Get-ChildItem (Join-Path $Root 'tests') -File -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -ne '.gitkeep' }
if ($testFiles.Count -gt 0) {
    # Здесь по мере развития будут запускаться фактические тесты.
    Check "тестов: найдено файлов ($($testFiles.Count))" $true
} else {
    Write-Host "[INFO] тестовые файлы ещё не добавлены — пропускаем запуск тестов" -ForegroundColor Yellow
}

Write-Host "======================================"
if ($failures -gt 0) {
    Write-Host "Прогонка: $failures ошибок" -ForegroundColor Red
    exit 1
}
Write-Host "Прогонка: все проверки пройдены" -ForegroundColor Green
exit 0