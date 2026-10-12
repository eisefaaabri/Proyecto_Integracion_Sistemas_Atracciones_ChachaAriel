# Auditoría técnica de la API — Booking Prototipo (Dominio Atracciones)

- **Objeto auditado:** API REST NestJS 10 + TypeORM 0.3 + PostgreSQL del dominio Atracciones y Autenticación.
- **Raíz del proyecto:** `C:\Proyecto_IS_Atracciones`
- **Fecha:** 2026-10-12
- **Método:** revisión estática de código, contratos OpenAPI, configuración/despliegue y análisis estático (`build` + ESLint, modo no destructivo).
- **Alcance de escritura:** auditoría **solo lectura**. No se modificó ningún archivo fuente. La compilación genera `dist/` (ignorado por git).
- **Nota:** se eliminaron las auditorías previas de la API (`docs/auditoria/*`), recuperables desde git (`git checkout -- docs/auditoria`).

---

## 1. Resumen ejecutivo

La API está bien estructurada para un prototipo académico: separación por módulos (`auth`, `atracciones`), validación global de entrada, HATEOAS esbozado, transacciones con bloqueo pesimista para evitar sobreventa, idempotencia a nivel de base de datos en reservas, migraciones consolidadas y RBAC (`JwtAuthGuard` + `RolesGuard`). **`nest build` compila sin errores.**

Sin embargo, existen riesgos relevantes de **seguridad por configuración por defecto**, **funcionalidad incompleta** en endpoints clave del contrato, **desalineación entre el contrato OpenAPI y la implementación**, y **ausencia total de pruebas automatizadas y de lint limpio**.

Resumen por severidad:

| Severidad | N.º |
|-----------|----:|
| Crítico | 1 |
| Alto | 4 |
| Medio | 9 |
| Bajo | 9 |

**Conclusión:** no es apto para producción tal cual. Para una entrega de curso es defendible, pero deben resolverse al menos el hallazgo crítico (C-01), los altos (A-01…A-04) y los medios de contrato/transacción (M-02, M-03, M-04).

---

## 2. Hallazgos

### 2.1 Críticos

#### C-01 — Secreto JWT por defecto conocido ("fallback") permite falsificar tokens (incluido ADMIN)
Cuando `JWT_SECRET` no está definido y `NODE_ENV !== "production"`, el sistema usa el literal `"fallback_secret_for_dev_only_123"`. El `.env.example` entrega un valor placeholder y el `Dockerfile` fija `NODE_ENV=production`, pero cualquier despliegue que olvide definir `NODE_ENV=production` (o que corra fuera de Docker) firma y valida tokens con un secreto público. Con él se puede forjar un JWT con `rol: "ADMIN"` y `sub` arbitrario, obteniendo acceso total a la gestión de catálogo y usuarios.

- Evidencia: `src/modules/auth/auth.module.ts:20-28` y `src/modules/auth/jwt.strategy.ts:9-16`.
- Recomendación: exigir `JWT_SECRET` **siempre** (fallar el arranque si falta), sin valor por defecto. Usar un secreto largo y aleatorio (≥ 32 bytes) inyectado por entorno; nunca un placeholder en `.env.example`; rotar el secreto si ya se desplegó con el valor por defecto.

### 2.2 Altos

#### A-01 — `POST /atracciones/search` ignora todos los filtros, orden y moneda del contrato
El DTO de búsqueda define `currency`, `cities`, `countries`, `dates`, `filters`, `sort` y `next_page`, pero el servicio solo usa `rows` y hace `findAndCount({ take: rows })`. Se descartan silenciosamente filtros obligatorios del contrato (fechas, ciudades, países, rating, orden), devolviendo resultados incorrectos sin error. Es un incumplimiento funcional del contrato, no solo una omisión cosmética.

- Evidencia: `src/modules/atracciones/atracciones.service.ts:139-151` frente a `src/modules/atracciones/dto/search-atracciones.dto.ts:64-111`.
- Recomendación: implementar el filtrado/orden en el QueryBuilder o, si está fuera de alcance, devolver `501/400` explícito en lugar de ignorar entradas; actualizar el contrato si el alcance cambia.

#### A-02 — CORS con origen comodín y `credentials: true` en desarrollo (y riesgo de mala configuración)
Si `FRONTEND_URL` no está definida, `frontendUrl` pasa a `"*"` con `credentials: true`. El paquete `cors` responde `Access-Control-Allow-Origin: *`, lo que (a) los navegadores rechazan cuando hay credenciales y (b) es una política laxa para el entorno desplegado si alguien olvida la variable. Además no se restringe `allowedHeaders`/`exposedHeaders`.

- Evidencia: `src/main.ts:22-35`, `.env.example:12-13`.
- Recomendación: en ausencia de `FRONTEND_URL`, no emitir CORS comodín con credenciales; restringir métodos y cabeceras de forma explícita y considerar `credentials:false` si no se usan cookies.

#### A-03 — Lint no pasa (468 errores) → el control de calidad de CI fallaría
`npm run lint` (ESLint + `plugin:prettier/recommended`) reporta **468 errores**, todos `prettier/prettier` por finales de línea CRLF (`␍`) y formato. El script incluye `--fix`, que enmascara el problema modificando archivos; un pipeline con `--max-warnings=0` o sin `--fix` falla.

- Evidencia: ejecución `npx eslint "src/**/*.ts"` → `468 problems (468 errors)`. Config: `.eslintrc.js:9-10`.
- Recomendación: normalizar finales de línea (`LF`) mediante `.gitattributes` (`* text=auto eol=lf`) + `prettier --write` una vez; añadir CI que ejecute `lint` sin `--fix`.

#### A-04 — Ausencia total de pruebas automatizadas
No hay archivos `*.spec.ts`, `*.e2e-spec.ts`, ni script `test` en `package.json`; Jest no es dependencia. No existe verificación automatizada de los flujos críticos (registro/login, reserva con idempotencia, sobreventa de cupos, pago, RBAC).

- Evidencia: `git ls-files` no devuelve archivos `spec|test`; `package.json:8-20` no define `test`.
- Recomendación: añadir al menos pruebas e2e de los flujos transaccionales y de autorización; integrarlas en CI.

### 2.3 Medios

#### M-01 — Borrado duro pese a soft-delete, con riesgo de 500 por FK `RESTRICT`
La entidad `Atraccion` declara `@DeleteDateColumn` y la migración crea `deleted_at`, lo que sugiere borrado lógico; pero `remove()` usa `repository.remove()` (DELETE físico) y `detalles_reserva.atraccion_id` tiene `ON DELETE RESTRICT`. Eliminar una atracción con reservas produce una violación de FK no controlada → **500** genérico, y el borrado lógico nunca se usa.

- Evidencia: `src/modules/atracciones/atracciones.service.ts:134-137`; `src/modules/atracciones/entities/atraccion.entity.ts:59-60`; `src/modules/atracciones/entities/detalle-reserva.entity.ts:34-37`.
- Recomendación: usar `softRemove`/`softDelete` para respetar el borrado lógico, o mapear la violación de FK (código `23503`) a `409 Conflict` con mensaje claro.

#### M-02 — Contrato OpenAPI desalineado con la implementación (rutas y multimedia)
El `contrato-apis-ecuatravel-openapi.yaml` declara `servers: /api/v2` y rutas `/users/me/wishlist/{atraccionId}` y `/reservations/{reservationId}/pay`, pero el controlador es `@Controller("atracciones")`, por lo que las rutas reales son `/api/v2/atracciones/users/me/wishlist/...` y `/api/v2/atracciones/reservations/{reservationId}/pay`. Además, el contrato define `/atracciones/{id}/photos` como `multipart/form-data` con `format: binary`, mientras la implementación espera JSON `{ "url": ... }`.

- Evidencia: `contracts/contrato-apis-ecuatravel-openapi.yaml:11-13, 234-240, 252, 294`; `src/modules/atracciones/atracciones.controller.ts:55, 468-474, 483, 497, 514`; `src/modules/atracciones/dto/photo-upload.dto.ts:4-8`.
- Recomendación: corregir el contrato (o el prefijo del controlador) para que exista una única fuente de verdad; alinear el endpoint de fotos (multipart real o documentar JSON). Hay dos OpenAPI (`contracts/atracciones-openapi.yaml` y `contrato-apis-ecuatravel-openapi.yaml`): consolidarlos o declarar explícitamente su alcance.

#### M-03 — Idempotencia incompleta en cancelación y carrera en reserva
`POST reservations/{id}/cancel` exige `Idempotency-Key` (guard) y la pasa al servicio, pero `cancelReservation(...)` **nunca la usa** (no persiste ni consulta). En `reserve`, la comprobación de idempotencia ocurre antes de cualquier bloqueo; ante dos peticiones simultáneas con la misma clave, la segunda choca con el índice único y devuelve `409` en lugar de **reproducir** la reserva original (idempotencia estricta).

- Evidencia: `src/modules/atracciones/atracciones.controller.ts:174-186`; `src/modules/atracciones/atracciones.service.ts:375-401` (ignora `idempotencyKey`) y `:229-240, 322-326`.
- Recomendación: registrar la clave de cancelación en un almacén idempotente; en `reserve`, ante colisión de clave devolver la reserva existente en lugar de 409.

#### M-04 — El JWT no revalida estado ni rol del usuario
El `JwtStrategy.validate` confía en el contenido del token sin consultar la BD. Un usuario desactivado (`estado=false`) o degradado de ADMIN conserva su acceso/rol hasta 1 h (vida del token). `RolesGuard` confía en `payload.roles`.

- Evidencia: `src/modules/auth/jwt.strategy.ts:20-35`; `src/modules/auth/roles.guard.ts:16-18`; expiración en `src/modules/auth/auth.module.ts:28`.
- Recomendación: en `validate`, cargar el usuario y comprobar `estado`; reducir la vida del token o implementar revocación/refresh.

#### M-05 — `PATCH /auth/users/:id/role`: 404 incorrecto y sin validación de rol
Al no encontrar usuario se lanza `ConflictException` (409) en vez de `NotFoundException` (404). El rol llega como parámetro primitivo `@Body("rol")` sin DTO, por lo que `class-validator` no valida: un rol arbitrario llega a la BD (enum) y produce 500.

- Evidencia: `src/modules/auth/auth.service.ts:236-248`; `src/modules/auth/auth.controller.ts:64`.
- Recomendación: usar `NotFoundException`; validar con un DTO (`@IsEnum(RolUsuario)`).

#### M-06 — Sin límite superior en paginación (`limit`) y `rows`
`PaginationQueryDto.limit` tiene `@Min(1)` pero ningún `@Max`; `search.rows` tampoco. `?limit=1000000` fuerza cargas masivas (riesgo de rendimiento/DoS).

- Evidencia: `src/common/dto/pagination-query.dto.ts:13-22`; `src/modules/atracciones/atracciones.service.ts:79, 142`.
- Recomendación: añadir `@Max(100)` (o similar) y clampear en el servicio.

#### M-07 — Errores de servidor enmascarados y posible fuga de mensajes internos
En `reserve`, cualquier excepción no prevista se convierte en `400 BadRequestException(err.message)`, exponiendo mensajes internos (p. ej. de BD) y clasificando fallos del servidor como errores del cliente. En `processPayment`, cualquier error de BD se convierte en `409 Conflict`, ocultando fallos 500 reales.

- Evidencia: `src/modules/atracciones/atracciones.service.ts:327-329` y `:633-638`.
- Recomendación: distinguir errores de dominio de errores inesperados; los últimos deben ser 500 con mensaje genérico, sin `err.message` al cliente.

#### M-08 — `findByIds` deprecado en TypeORM 0.3
`getDetailsBatch` usa `repository.findByIds(...)`, método deprecado (se eliminará en versiones futuras).

- Evidencia: `src/modules/atracciones/atracciones.service.ts:154`.
- Recomendación: migrar a `findBy({ id: In(ids) })` y validar UUIDs de entrada.

#### M-09 — HATEOAS documentado pero no implementado (`_links`)
`PaginatedResponseDto` declara `_links` (con campos obligatorios) y el controlador anota `type: PaginatedResponseDto`, pero `findAll` devuelve solo `{ data, meta }`. El contrato promete navegación que no existe.

- Evidencia: `src/common/dto/paginated-response.dto.ts:16-22`; `src/modules/atracciones/atracciones.service.ts:104-113`.
- Recomendación: generar `_links` (first/prev/next/last) o degradar los campos a opcionales y ajustar el contrato.

### 2.4 Bajos

- **B-01 — Logging con `console` en vez de `Logger` de Nest:** `src/main.ts:91`, `src/modules/atracciones/atracciones.service.ts:635`, `src/common/filters/http-exception.filter.ts:35`.
- **B-02 — Índices únicos duplicados:** `@Index({ unique: true })` + `@Column({ unique: true })` en `src/modules/auth/entities/usuario.entity.ts:23-24` y `src/modules/atracciones/entities/cliente.entity.ts:19-20` (riesgo de crear dos índices).
- **B-03 — TypeScript laxo:** `strict: false`, `noImplicitAny: false`, `strictNullChecks: false` en `tsconfig.json:15-18`, propenso a nulos no controlados.
- **B-04 — SQL logging activo:** `logging: true` en `src/data-source.ts:10`.
- **B-05 — Credenciales por defecto en compose:** `docker-compose.yml:10-11` (`postgres/postgres`). Aceptable solo en local.
- **B-06 — `deleted_at` muerto:** definido en entidad/migración pero sin uso efectivo (ver M-01).
- **B-07 — DTOs muertos:** `src/common/dto/base-response.dto.ts`, varios tipos en `src/modules/atracciones/dto/nested-types.dto.ts` no se referencian.
- **B-08 — `down()` de migración incompleto:** no elimina `atracciones` (`src/migrations/1810000000000-ConsolidatedSchema.ts:267-275`).
- **B-09 — Cabeceras de deprecación/caché genéricas y no reflejadas en Swagger:** `X-API-Deprecation-Date` y `Cache-Control` fijos en `src/modules/atracciones/atracciones.controller.ts:189-190, 245-246`; `foto_url` sin validación de URL en `create-atraccion.dto.ts:41-44`; `date` de disponibilidad sin validar (`atracciones.controller.ts:383-388`); el filtro de excepciones no fija `Content-Type: application/problem+json` pese a anunciar RFC 7807 (`src/common/filters/http-exception.filter.ts:50`).

### 2.5 Criterios que SÍ se cumplen

- **Compila:** `nest build` finaliza sin errores (genera `dist/main.js`).
- **Validación de entrada global:** `ValidationPipe` con `whitelist`, `forbidNonWhitelisted`, `transform` e `implicitConversion` (`src/main.ts:40-49`).
- **Cabeceras de seguridad:** `helmet()` aplicado (`src/main.ts:14`).
- **Contraseñas:** `bcrypt` con 10 rondas y `MaxLength(72)` (`auth.service.ts:83, 144`; `register.dto.ts:20-22`).
- **RBAC:** endpoints de admin protegidos con `JwtAuthGuard` + `RolesGuard` (`atracciones.controller.ts:201-203, 268-271, 301-303, 334-337, 465-467`; `auth.controller.ts:41-66`).
- **Autorización por propietario:** reservas y pagos verifican `cliente.usuario.id` → `ForbiddenException` (`atracciones.service.ts:367-371, 391-395, 565-569`).
- **Integridad transaccional:** `reserve`/`processPayment` en transacción + `pessimistic_write`, con suma de cupos dentro de la transacción (anti-sobreventa) (`atracciones.service.ts:224-347, 588-642`).
- **Idempotencia en reservas a nivel BD:** índice único en `reservas.idempotency_key` (`migrations/...:130-135`; `reserva.entity.ts:38-40`).
- **Esquema por migraciones:** `synchronize` desactivable (`DB_SYNCHRONIZE=false`) y `migrationsRun:true` (`app.module.ts:24-26`).
- **Manejo de errores sin fuga de stack:** respuesta 500 genérica (`http-exception.filter.ts:22-25`).
- **Throttling en autenticación:** login 5/min y registro 10/min (`auth.controller.ts:20-21, 31-32`).
- **Contratos y versión:** prefijo `/api`, versionado URI `v2`, Swagger gateado en producción (`main.ts:16-20, 53-54`).
- **Contenedor endurecido:** usuario no root en Docker (`Dockerfile:27`).

---

## 3. Evidencia concreta (archivo y elemento)

| ID | Archivo | Línea(s) | Elemento |
|----|---------|----------|----------|
| C-01 | `src/modules/auth/auth.module.ts` | 20-28 | `secret: secret \|\| "fallback_secret_for_dev_only_123"` |
| C-01 | `src/modules/auth/jwt.strategy.ts` | 9-16 | `secretOrKey: secret \|\| "fallback_secret_for_dev_only_123"` |
| A-01 | `src/modules/atracciones/atracciones.service.ts` | 139-151 | `search()` solo usa `rows`; ignora filtros |
| A-01 | `src/modules/atracciones/dto/search-atracciones.dto.ts` | 64-111 | `currency/cities/countries/dates/sort` obligatorios |
| A-02 | `src/main.ts` | 22-35 | `frontendUrl = "*"` + `credentials: true` |
| A-03 | (ESLint) | — | 468 errores `prettier/prettier` |
| A-04 | `package.json` / repo | 8-20 | sin `test` ni `*.spec.ts` |
| M-01 | `atracciones.service.ts` / `detalle-reserva.entity.ts` | 134-137 / 34-37 | `remove()` duro vs FK `RESTRICT` |
| M-02 | `contracts/contrato-apis-ecuatravel-openapi.yaml` | 11-13, 234-240, 252, 294 | rutas/multimedia vs `@Controller("atracciones")` |
| M-03 | `atracciones.service.ts` | 375-401 | `cancelReservation` ignora `idempotencyKey` |
| M-04 | `jwt.strategy.ts` | 20-35 | `validate` sin consulta a BD |
| M-05 | `auth.service.ts` / `auth.controller.ts` | 236-248 / 64 | 409 por "no encontrado"; rol sin validar |
| M-06 | `pagination-query.dto.ts` | 13-22 | `@Min(1)` sin `@Max` |
| M-07 | `atracciones.service.ts` | 327-329, 633-638 | `BadRequestException(err.message)` / 409 genérico |
| M-08 | `atracciones.service.ts` | 154 | `findByIds` deprecado |
| M-09 | `paginated-response.dto.ts` / service | 16-22 / 104-113 | `_links` declarado y no devuelto |

---

## 4. Recomendación de corrección por hallazgo

| ID | Corrección propuesta |
|----|----------------------|
| C-01 | Obligar `JWT_SECRET` en todos los entornos (fail-fast al arrancar). Eliminar el fallback y el placeholder del `.env.example`. Rotar secreto. |
| A-01 | Implementar `cities/countries/dates/filters/sort` en el QueryBuilder de `search`, o responder `400/501` explícito. Sincronizar con el contrato. |
| A-02 | Quitar el comodín con credenciales; definir orígenes explícitos y `allowedHeaders`. |
| A-03 | Aplicar `.gitattributes` LF + `prettier --write`; CI con `eslint` sin `--fix`. |
| A-04 | Crear suite e2e (login/registro, reserva, idempotencia, sobreventa, pago, RBAC) e integrarla en CI. |
| M-01 | Usar `softDelete`/`softRemove` o mapear FK `23503` a `409`. |
| M-02 | Unificar contrato e implementación (prefijos de wishlist/pay; fotos multipart/JSON). Consolidar los dos OpenAPI. |
| M-03 | Persistir/verificar la clave en cancelación; en reserva, devolver la original ante colisión. |
| M-04 | Revalidar `estado` (y rol) del usuario en `JwtStrategy`; considerar revocación/refresh. |
| M-05 | `NotFoundException` para usuario inexistente y DTO con `@IsEnum(RolUsuario)`. |
| M-06 | `@Max` en `limit`/`rows` y clampeo en el servicio. |
| M-07 | Diferenciar errores de dominio y de servidor; 500 genérico sin `err.message`. |
| M-08 | Sustituir `findByIds` por `findBy({ id: In(ids) })` con validación UUID. |
| M-09 | Generar `_links` o marcar los campos como opcionales. |
| B-01…B-09 | Adoptar `Logger`, consolidar índices únicos, endurecer `tsconfig`, desactivar `logging`, parametrizar credenciales, eliminar DTOs/columnas muertos, completar `down()`, marcar deprecaciones en Swagger y fijar `Content-Type` del filtro. |

---

## 5. Pruebas a repetir (verificación tras corregir)

1. **Compilación e lint:** `npm run build` (debe compilar) y `npx eslint "src/**/*.ts"` (0 errores, sin `--fix`).
2. **Secreto JWT:** arrancar sin `JWT_SECRET` en cada `NODE_ENV` → debe fallar el arranque; verificar que no existe el literal `fallback_secret_for_dev_only_123` en el código ni en `.env.example`.
3. **CORS:** con `FRONTEND_URL` definida y sin definir; comprobar `Access-Control-Allow-Origin` (no `*` con credenciales) vía petición `OPTIONS`.
4. **Búsqueda:** `POST /api/v2/atracciones/search` con `cities/countries/dates/sort` y verificar que el resultado respeta cada filtro (o error explícito).
5. **Idempotencia:** dos `POST .../reservations` simultáneos con la misma `Idempotency-Key` → misma reserva en ambas respuestas; dos cancelaciones con la misma clave → misma respuesta.
6. **Sobreventa:** reservas concurrentes que excedan `capacidad_diaria` → una `201` y el resto `409`, sin sobrepasar el cupo.
7. **Autorización:** acceso a recursos de otro usuario → `403`; sin token → `401`; rol insuficiente → `403`; token de usuario desactivado → `401`.
8. **Borrado de atracción con reservas:** `DELETE` → `204` (soft) o `409` claro, nunca `500`.
9. **Contrato:** validar ambos YAML con un linter OpenAPI y comparar rutas/payloads con los `@Controller` (foco en wishlist, pay y photos).
10. **Errores:** forzar fallo de BD en `reserve`/`processPayment` → respuesta `500` genérica sin mensajes internos ni stack.
11. **Paginación:** `GET /api/v2/atracciones?limit=1000000` → limitado por `@Max`.
12. **Formato RFC 7807:** verificar cabecera `Content-Type: application/problem+json` en respuestas de error.
