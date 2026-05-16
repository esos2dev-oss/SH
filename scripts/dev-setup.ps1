# =============================================================================
# Setup completo de desarrollo: crea DB + user, migra, seed.
# Uso (desde la raiz del repo):
#   powershell -ExecutionPolicy Bypass -File scripts/dev-setup.ps1
#
# Pide la contrasena del usuario `postgres` UNA vez.
# =============================================================================

$ErrorActionPreference = 'Stop'

$pg = 'C:\Program Files\PostgreSQL\16\bin\psql.exe'
if (-not (Test-Path $pg)) {
    Write-Host "No se encontro psql en $pg" -ForegroundColor Red
    Write-Host "Edita esta ruta o agrega psql al PATH." -ForegroundColor Yellow
    exit 1
}

Write-Host "Sistema Hotelero - Setup de desarrollo" -ForegroundColor Cyan
Write-Host "Necesito la contrasena del usuario 'postgres' para crear sh_user y sh_db." -ForegroundColor Yellow
$pass = Read-Host -AsSecureString "Contrasena de postgres"
$pgPass = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($pass)
)
$env:PGPASSWORD = $pgPass

Write-Host ""
Write-Host "1/3 Creando rol sh_user y base sh_db..." -ForegroundColor Cyan
& $pg -U postgres -h localhost -f "backend\scripts\setup-dev.sql"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Fallo crear DB. Revisa el error arriba." -ForegroundColor Red
    Remove-Item Env:PGPASSWORD
    exit 1
}

# A partir de aqui usamos sh_pass para sh_user
$env:PGPASSWORD = 'sh_pass'

Write-Host ""
Write-Host "2/3 Aplicando migraciones..." -ForegroundColor Cyan
Push-Location backend
try {
    npm run migrate
    if ($LASTEXITCODE -ne 0) { throw "Migraciones fallaron" }

    Write-Host ""
    Write-Host "3/3 Aplicando seeds..." -ForegroundColor Cyan
    npm run seed
    if ($LASTEXITCODE -ne 0) { throw "Seeds fallaron" }
} finally {
    Pop-Location
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "Setup completo. Ahora corre:" -ForegroundColor Green
Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\dev-up.ps1" -ForegroundColor White
Write-Host ""
Write-Host "El admin inicial sale impreso arriba con su set_password_token." -ForegroundColor Yellow
