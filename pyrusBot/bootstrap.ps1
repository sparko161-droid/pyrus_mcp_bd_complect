<#
    Подготовка чистого ПК к работе с проектом.

    Скрипт написан на PowerShell, а не на TypeScript, намеренно: он обязан
    работать там, где Node.js ещё не установлен, — то есть до того, как
    появится возможность запустить хоть что-то из npm.

    Запуск из корня проекта:

        powershell -ExecutionPolicy Bypass -File .\bootstrap.ps1

    Скрипт безопасно запускать повторно: он ничего не перезаписывает.
    Существующий .env не трогается никогда — в нём личный ключ инженера.
#>

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

$problems = @()

function Write-Step($number, $text) {
    Write-Host ""
    Write-Host "[$number] $text" -ForegroundColor Cyan
}

Write-Host "Подготовка проекта: $projectRoot"

# ─────────────────────────────────────────────────────────────────────
Write-Step 1 "Node.js"

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Host "  Node.js не найден." -ForegroundColor Yellow
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if (-not $winget) {
        $problems += "Node.js не установлен, и winget недоступен. Поставьте Node.js 20+ вручную: https://nodejs.org"
    } else {
        $answer = Read-Host "  Установить Node.js LTS через winget? [y/N]"
        if ($answer -eq 'y') {
            winget install --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
            $problems += "Node.js установлен. ПЕРЕЗАПУСТИТЕ терминал и запустите bootstrap.ps1 снова: PATH обновляется только в новых сессиях."
        } else {
            $problems += "Без Node.js 20+ дальше двигаться нельзя."
        }
    }
} else {
    $version = (& node --version).TrimStart('v')
    $major = [int]($version.Split('.')[0])
    if ($major -lt 20) {
        $problems += "Node.js $version слишком старый, нужен 20+. Обновите: winget upgrade OpenJS.NodeJS.LTS"
    } else {
        Write-Host "  Node.js $version — подходит." -ForegroundColor Green
    }
}

if ($problems.Count -gt 0) {
    Write-Host ""
    Write-Host "Остановлено:" -ForegroundColor Red
    $problems | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    exit 1
}

# ─────────────────────────────────────────────────────────────────────
Write-Step 2 "Зависимости"

npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "  npm install завершился с ошибкой." -ForegroundColor Red
    exit 1
}

$outdated = npm outdated --json 2>$null
if ($outdated -and $outdated.Trim() -ne '' -and $outdated.Trim() -ne '{}') {
    Write-Host "  Есть обновления пакетов. Посмотреть: npm outdated" -ForegroundColor Yellow
    Write-Host "  Актуальность pyrus-api проверяется в начале каждой сессии — это правило проекта." -ForegroundColor Yellow
}

# ─────────────────────────────────────────────────────────────────────
Write-Step 3 "Доступ к Pyrus"

if (Test-Path '.env') {
    Write-Host "  .env уже есть — не трогаю." -ForegroundColor Green
} else {
    Copy-Item '.env.example' '.env'
    Write-Host "  Создан .env из .env.example." -ForegroundColor Green
    Write-Host ""
    Write-Host "  ОТКРОЙТЕ .env И ВПИШИТЕ СВОИ ЗНАЧЕНИЯ:" -ForegroundColor Yellow
    Write-Host "    PYRUS_LOGIN          — ваш логин интеграции"
    Write-Host "    PYRUS_SECURITY_KEY   — ваш ключ"
    Write-Host ""
    Write-Host "  Ключ у каждого инженера свой: только так в Базе знаний виден реальный автор правки."
    Write-Host "  Значения вписывает инженер лично. Ни агент, ни этот скрипт их не запрашивают и не подставляют."
    $problems += "Заполните .env и запустите bootstrap.ps1 снова."
}

if ($problems.Count -gt 0) {
    Write-Host ""
    Write-Host "Осталось сделать вручную:" -ForegroundColor Yellow
    $problems | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
    exit 2
}

# ─────────────────────────────────────────────────────────────────────
Write-Step 4 "Проверка сборки"

npm run check
if ($LASTEXITCODE -ne 0) {
    Write-Host "  npm run check не прошёл. Работать нельзя, пока не станет зелёным." -ForegroundColor Red
    exit 1
}

# ─────────────────────────────────────────────────────────────────────
Write-Step 5 "Сверка с Базой знаний"

npm run kb:sync:dry
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "  Сверка не прошла. Частые причины:" -ForegroundColor Yellow
    Write-Host "    - неверные PYRUS_LOGIN или PYRUS_SECURITY_KEY в .env;"
    Write-Host "    - нет доступа к разделу Базы знаний;"
    Write-Host "    - недоступна сеть до api.pyrus.com."
    exit 1
}

Write-Host ""
Write-Host "Готово. Рабочее место настроено." -ForegroundColor Green
Write-Host "Начало каждой сессии: git pull, затем npm run kb:sync."
