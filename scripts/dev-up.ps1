# =============================================================================
# Arranca backend + frontend en modo dev en dos ventanas separadas.
# Uso (desde la raiz):
#   powershell -ExecutionPolicy Bypass -File scripts/dev-up.ps1
# =============================================================================

$root = (Resolve-Path .).Path

Write-Host "Sistema Hotelero - Dev up" -ForegroundColor Cyan
Write-Host ""
Write-Host "Backend en  : http://localhost:3002" -ForegroundColor White
Write-Host "Frontend en : http://localhost:5173/sh/" -ForegroundColor White
Write-Host ""

Start-Process powershell -ArgumentList @(
    '-NoExit', '-Command',
    "Set-Location '$root\backend'; Write-Host '== BACKEND ==' -ForegroundColor Cyan; npm run dev"
)

Start-Sleep -Seconds 2

Start-Process powershell -ArgumentList @(
    '-NoExit', '-Command',
    "Set-Location '$root\frontend'; Write-Host '== FRONTEND ==' -ForegroundColor Cyan; npm run dev"
)

Write-Host "Servidores arrancando en ventanas separadas." -ForegroundColor Green
Write-Host "Cierralas con Ctrl+C cuando termines." -ForegroundColor Yellow
