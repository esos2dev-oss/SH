# Prompt de inicio — Sistema Hotelero (SH)

> Copia y pega este bloque en la primera conversacion del proyecto.

---

Vamos a empezar a desarrollar **Sistema Hotelero**, un ERP/PMS hotelero. Antes de escribir codigo necesito que hagas el trabajo de planificacion. Sigue estos pasos en orden:

## 1. Lee la propuesta tecnica

Archivo obligatorio:

- `c:/Users/molin/Downloads/Proyectos P/SH/Propuesta_SistemaHotelero_Buggin_v3.pdf`

Esta propuesta define alcance funcional, fases, stack sugerido y modulos. Es la **fuente de verdad** del producto.

Si `Read` no puede abrir el PDF directamente, extrae el texto con:
```powershell
python -c "import sys; sys.stdout.reconfigure(encoding='utf-8'); from pypdf import PdfReader; r = PdfReader(r'c:/Users/molin/Downloads/Proyectos P/SH/Propuesta_SistemaHotelero_Buggin_v3.pdf'); [print(f'\n=== PAGE {i+1} ===\n', p.extract_text()) for i,p in enumerate(r.pages)]" > _pdf.txt
```

## 2. Estudia el CRM existente como referencia arquitectonica

Tengo otro proyecto del mismo tipo del que quiero **reutilizar patrones, convenciones y estructura de carpetas**:

- `c:/Users/molin/Downloads/Proyectos T/CRM/`

Lee primero estos archivos (en este orden):

1. `CRM/README.md` — vision general y stack
2. `CRM/CLAUDE.md` — convenciones de codigo, estructura modular, reglas de negocio
3. `CRM/docs/01-esquema-base-datos.md` — patron de schema PostgreSQL
4. `CRM/docs/02-estructura-proyecto.md` — arquitectura modular detallada
5. `CRM/docs/03-api-endpoints.md` — formato de endpoints REST
6. `CRM/docs/05-arquitectura-frontend.md` — layouts y patrones React

Mira tambien la estructura real de `CRM/backend/src/modules/` y `CRM/frontend/src/modules/` para entender como se organiza un modulo completo (routes / controller / service / model / validation).

**Importante:** el CRM es referencia, no plantilla a copiar. El Sistema Hotelero tiene dominio distinto (habitaciones, reservas, check-in, ERP contable). Toma de el: stack, convenciones, estructura modular, formato de respuesta API, manejo de auth/roles, patron de migraciones SQL.

## 3. Resuelve decisiones tecnicas pendientes

La propuesta menciona "BaaS gestionado" en algunos lados y stack tradicional en otros. Antes de planificar, decidi y documenta:

- **Backend:** ¿Node.js + Express + PostgreSQL crudo (igual que el CRM) o Supabase/BaaS gestionado (como sugiere la propuesta)?
- **TypeScript:** la propuesta dice TS estricto end-to-end. El CRM usa JS. Para SH usaremos **TypeScript** (alineado con la propuesta).
- **Auth + RLS:** si vamos con Postgres directo, RLS se implementa con politicas SQL nativas; si vamos Supabase, viene incluido.
- **Hosting:** VPS KVM1 €18/mes (mismo proveedor que el CRM esta bien, o lo que recomiendes).

Hazme una pregunta corta sobre la decision Backend (Node+Express vs Supabase) si no la tengo clara, antes de seguir.

## 4. Entregables de esta primera sesion (NO codees todavia)

Crea estos archivos en `c:/Users/molin/Downloads/Proyectos P/SH/`:

1. **`README.md`** — vision general, stack final decidido, modulos, equipo, como correr local
2. **`CLAUDE.md`** — convenciones de codigo (heredadas/adaptadas del CRM), reglas de negocio criticas
3. **`docs/00-vision-producto.md`** — resumen del PDF en mis palabras: que es, para quien, alcance, lo que NO incluye
4. **`docs/01-esquema-base-datos.md`** — schema completo PostgreSQL: habitaciones, tipos de habitacion, reservas/alquileres, clientes, check-ins, ingresos, egresos, comprobantes, usuarios, roles, campañas email, promociones, audit log
5. **`docs/02-estructura-proyecto.md`** — arquitectura modular: lista de modulos backend y frontend con su responsabilidad
6. **`docs/03-api-endpoints.md`** — endpoints REST por modulo (sin implementar)
7. **`docs/04-plan-fases.md`** — plan estructurado fase a fase basado en las 5 fases del PDF (Discovery, Setup, Nucleo Operativo, ERP+Marketing, QA+Deploy), con tareas concretas, criterios de aceptacion y orden de implementacion
8. **`docs/05-decisiones-tecnicas.md`** — registro de decisiones (ADR ligero): por que TS, por que el backend elegido, por que tal libreria de email, etc.

## 5. Modulos minimos esperados (del PDF)

- **Habitaciones:** tipos, tarifas, capacidad, estado (libre/ocupada/limpieza/mantenimiento), ocupacion en tiempo real
- **Reservas/Alquileres:** por dia/semana/mes, calculo automatico, descuentos por temporada
- **Clientes (CRM lite):** datos, identificacion, historial de estancias, segmentacion
- **Check-in digital:** flujo de registro al ingreso
- **ERP — Ingresos/Egresos:** categorias, comprobantes adjuntos (imagen/PDF), conciliacion
- **Reportes financieros:** diarios/semanales/mensuales, export CSV/PDF
- **Email Marketing:** campañas por evento (bienvenida, post-estancia, recuperacion), plantillas, metricas basicas
- **Promociones/Descuentos:** codigos, vigencias, reglas
- **Multiusuario + Roles:** admin, recepcion, limpieza, contabilidad
- **Audit log:** quien hizo que y cuando

## 6. Reglas para esta sesion

- Idioma codigo: ingles para variables/funciones, español para comentarios y docs
- Commits en español con prefijo (`feat:`, `fix:`, `docs:`, etc.)
- Sin emojis salvo que yo los pida
- No instales dependencias ni inicialices npm/git en esta sesion — solo planificacion y docs
- Si una decision no esta clara, preguntame con opciones concretas (no en abstracto)

## 7. Cierra la sesion con

Un resumen corto de:
- Stack final decidido
- Lista de archivos creados
- Que se hace en la siguiente sesion (probablemente: `git init`, scaffolding inicial backend+frontend siguiendo `docs/02-estructura-proyecto.md`)

---

**Empieza por el paso 1.**
