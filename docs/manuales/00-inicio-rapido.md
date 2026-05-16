# Inicio rapido

Esta guia es para arrancar el sistema en una maquina local de prueba.

---

## Requisitos previos

| Componente | Version | Observacion |
|---|---|---|
| **Node.js** | 20+ | Para backend y frontend |
| **PostgreSQL** | 14+ (16 recomendado) | El servicio debe estar corriendo en `localhost:5432` |
| **PowerShell** | 5.1+ | Viene con Windows 10/11 |

> Si no tienes Postgres: [descargalo aqui](https://www.postgresql.org/download/windows/) y durante la instalacion anota la contrasena del usuario `postgres`.

---

## Paso 1 — Setup de la base de datos

Desde la raiz del repositorio:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\dev-setup.ps1
```

El script:

1. Te pide la contrasena del usuario `postgres` **una sola vez**.
2. Crea el usuario `sh_user` con password `sh_pass`.
3. Crea la base `sh_db`.
4. Aplica las 14 migraciones SQL.
5. Aplica los 6 seeds (admin inicial + plantillas).

Al final imprime el correo del admin inicial y un **token de set-password** que necesitaras para crear su contrasena.

---

## Paso 2 — Arrancar el sistema

```powershell
powershell -ExecutionPolicy Bypass -File scripts\dev-up.ps1
```

Abre dos ventanas de PowerShell:

- **Backend** en `http://localhost:3002`
- **Frontend** en `http://localhost:5173/sh/`

Verifica que el backend responde:

```powershell
Invoke-RestMethod http://localhost:3002/api/health
```

Debe devolver `status: "ok"`.

---

## Paso 3 — Crear contrasena del admin

Abre `http://localhost:5173/sh/set-password/<TOKEN>` (reemplaza `<TOKEN>` con el que imprimio el script de setup).

Define tu contrasena y entra al sistema.

---

## Paso 4 — Primer recorrido recomendado

1. **Configurar tasa BCV** → menu lateral **Pagos > Configuracion** → ingresa la tasa Bs/USD del dia.
2. **Datos del hotel para Pago Movil** → misma pantalla, abajo → banco, RIF, telefono receptor.
3. **Crear tipos de habitacion y habitaciones** → menu **Habitaciones > Tipos y tarifas** y **Habitaciones > Panel**.
4. **Crear un huesped y una reserva de prueba** → menu **Huespedes** y **Reservas**.
5. **Probar el atajo de pago** → presiona la tecla **P** en cualquier pantalla → registra un pago.

---

## Manuales por rol

- [01 — Recepcion](01-recepcion.md)
- [02 — Limpieza](02-limpieza.md)
- [03 — Contabilidad](03-contabilidad.md)
- [04 — Admin / Superadmin](04-admin-superadmin.md)

---

## Solucion de problemas

### "Error en variables de entorno"
El backend no encuentra el `.env`. Verifica que existe `backend\.env` (lo crea el setup automaticamente).

### "ECONNREFUSED 127.0.0.1:5432"
Postgres no esta corriendo. Reinicialo desde **Services** (`services.msc` > `postgresql-x64-16`).

### "auth password failed for user postgres"
La contrasena que diste al script no es correcta. Vuelve a ejecutar `dev-setup.ps1`.

### "auth password failed for user sh_user"
Verifica que `backend\.env` tenga `DATABASE_URL=postgres://sh_user:sh_pass@localhost:5432/sh_db`. Si cambiaste el password de `sh_user`, actualiza el `.env` con el nuevo.

### El frontend dice "Failed to fetch"
El backend no esta corriendo o esta en otro puerto. Revisa la ventana del backend.

### Puerto 3002 o 5173 ocupado
Edita `backend\.env` (`PORT=3003`) o `frontend\vite.config.ts` (`server.port`).

---

## Resetear todo

```powershell
# Borrar la base y empezar de cero (cuidado, pierdes datos)
$env:PGPASSWORD = '<tu_pass_postgres>'
& 'C:\Program Files\PostgreSQL\16\bin\psql.exe' -U postgres -h localhost -c 'DROP DATABASE sh_db;'
Remove-Item Env:PGPASSWORD
powershell -ExecutionPolicy Bypass -File scripts\dev-setup.ps1
```
