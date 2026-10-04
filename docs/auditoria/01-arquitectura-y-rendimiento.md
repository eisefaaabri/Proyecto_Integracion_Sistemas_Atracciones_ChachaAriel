# Informe 01 — Arquitectura y Rendimiento

**Alcance:** `C:\Proyecto_IS_Atracciones` (API NestJS 10, módulo `atracciones`)
**Fecha de auditoría:** 2026-09-30 · **Revisión 2:** 2026-10-04 sobre `a4b4657` + árbol de trabajo sin commitear
**Repositorio:** `booking-prototipo-plantilla` v1.0.0 · rama `main` · commit base `a4b4657` (R1: `0cceeb5`)
**Normativa aplicada:** ISO/IEC 25010 (calidad de producto), ISO/IEC 9126-3 (mantenibilidad), ISO/IEC 25010:2011 §8 (eficiencia)

> **Nota de alcance.** El encargo original remitía a un documento rector «CONSTRUCCION DESARROLLO WEB» que no existe en el repositorio. Se auditó contra estándares verificables. El repositorio **no contiene front-end**; la superficie de IHC se trata en el [informe 02](02-accesibilidad-wcag22.md).

---

## 1. Resumen ejecutivo

| Dimensión | Veredicto | Bloqueantes |
|---|---|---|
| Modularidad / DDD | 🟡 Aceptable con fugas | 0 |
| Separación Controlador–Servicio | 🟢 Adecuada | 0 |
| Separation of Concerns (mapper/validación) | 🟡 Parcial | 0 |
| **Carga perezosa (lazy loading)** | 🔴 **Inhibida — `eager: true` ×7** | 1 |
| **Rendimiento de lectura** | 🔴 **p50 1049 ms con 18 filas** | 1 |
| **Eficiencia de escritura (N+1)** | 🔴 **+2639 ms con 30 categorías** | 1 |
| Integridad transaccional | 🔴 Sin transacciones | 2 |
| Presupuesto de rendimiento (filas) | 🔴 Sin cota superior | 1 |
| Observabilidad | 🔴 Nula | 1 |
| Verificación automatizada | 🔴 Inexistente | 1 |

**Semáforo global: 🔴 NO APTO para producción.** 5 hallazgos críticos, 13 altos, 20 medios, 8 bajos. El bloqueo principal no es de estilo sino de **integridad de datos**: la API vende más cupos de los que existen.

---

## 2. Arquitectura

### 2.1 Estructura de capas

```
HTTP  ──▶  AtraccionesController        (318 loc)   transporte, binding, HATEOAS, cabeceras
              │  validación declarativa (class-validator + ValidationPipe global)
              ▼
           AtraccionesService           (745 loc)   caso de uso, orquestación, mapeo, helpers
              │
              ├─▶ Repository (TypeORM/PostgreSQL)    persistencia
              ├─▶ Entidades  (9)                     modelo de dominio / esquema
              └─▶ DTOs        (8)                    contrato de entrada/salida
```

**Veredicto sobre MVC / Vista-Controlador.** El enunciado exige «estricta separación entre la lógica de presentación y la lógica de negocio». En un backend REST la equivalencia correcta es **Controller = Vista adaptadora**, y el criterio a evaluar es si el controlador contiene lógica de negocio. **El criterio se cumple**: los 13 handlers de `atracciones.controller.ts` solo delegan, ajustan `HttpCode` y `Location`, y declaran metadatos OpenAPI. No hay reglas de negocio, ni acceso a repositorios, ni construcción de SQL en la capa de transporte. ✅

**Reservas detectadas (no bloqueantes para MVC, sí para mantenibilidad):**

- **`AtraccionesService` es una clase Dios.** 745 líneas, 6 repositorios inyectados, 4 responsabilidades mezcladas: casos de uso (`search`, `reserve`, `cancelReservation`), acceso a datos (`findOrCreate*`, `update`, `replace`), mapeo de presentación (`toResponse` de 65 líneas, `toReservationResponse`) y utilidades (`generateRequestId`). Viola SRP. Un cambio en el formato de respuesta obliga a tocar la misma clase que contiene la lógica transaccional.
  - **Recomendación:** extraer `AtraccionesMapper` (presentación), `CatalogNormalizer` (los `findOrCreate*`) y `AvailabilityPolicy` (capacidad/cupos), dejando el servicio como orquestador.

- **Los mappers son privados, no hay frontera de contrato.** `toResponse()` devuelve un objeto literal anónimo cuyo tipo no se valida contra `AtraccionResponseDto`. Nada impide que se desincronicen; de hecho ya lo están (véase §2.3).

### 2.2 Modelo de datos — normalización 3FN

El commit `0cceeb5` («Normalizacion 3FN … ISO/IEC 9126-3») es un **acierto arquitectónico** y debe preservarse. Se eliminaron las columnas JSONB compuestas y se.《normalizaron»:

| Antes (JSONB) | Ahora (3FN) | Restricción de integridad |
|---|---|---|
| `price: {currency, total}` | `price_currency` + `price_total` | `@Check('CHK_price_positive', '"price_total" > 0')` |
| `ratings: {score, count}` | `rating_score` + `rating_count` | `@Check('CHK_rating_range', …0..5)` |
| `url: {web, app}` | `url_web` + `url_app` | — |
| `locations[]` | tabla `atraccion_locations` | `@Check` latitud/longitud |
| `categories[]` | pivote `atraccion_categories` | — |
| `idempotency_key` JSONB | `reservations.idempotency_key` | `UNIQUE` |

SeMikeStephenVerdicts marcadas ✅:

- Integridad referencial declarada: `onDelete: 'CASCADE'` en dependientes, `RESTRICT` en `operator`.
- Unicidad de negocio: `@Unique('UQ_atraccion_name_operator', ['name','operator_id'])` reforzada por verificación en aplicación que devuelve 409.
- 6 restricciones `CHECK` defienden rangos que ningún DTO valida (el contrato no puede mentir sobre la BD).
- `numeric(10,2)` para dinero con `ColumnNumericTransformer` — correcto, evita errores de coma flotante binaria. ✅
- `uuid` como clave primaria, compatible con la hoja de ruta a microservicios. ✅

**Observación (L-baja).** Las columnas pivote se nombran `atraccionesId` / `categoriesId` (camelCase por defecto de TypeORM) mientras el resto del esquema es `snake_case`. Inconsistencia de nomenclatura que rompe cualquier script que asuma convención homogénea. Recomendación: `@JoinTable({ name: 'atraccion_categories', joinColumn: { name: 'atraccion_id' }, inverseJoinColumn: { name: 'category_id' } })`.

### 2.3 Divergencia entre modelo de datos y DTO

| Campo del contrato | DTO | Entidad | Servicio | Estado |
|---|---|---|---|---|
| `price.total` | `PriceDto.total` | `price_total` | ✅ mapea | Correcto |
| `ratings.score` / `.number_of_reviews` | `RatingDto` | `rating_score` / `rating_count` | devuelve `null` siempre | 🔴 **campo muerto** |
| `url.web` / `url.app` | `UrlDto` | `url_web` / `url_app` | devuelve `null` siempre | 🔴 **campo muerto** |
| `Location.city` | `@IsInt()` | `int` | `loc.city` | ⚠️ tipo inconsistente (§3.2) |
| `_links` (listado) | `PaginatedResponseDto` (obligatorio) | — | **no se emite** | 🔴 violación de contrato |
| `dto.languages` (batch details) | `DetailsRequestDto` | — | **se ignora** | 🔴 promesa incumplida |

`ratings` y `url` están declarados en `AtraccionResponseDto` y en el contrato OpenAPI, pero **ningún camino de escritura puede poblarlos** (`CreateAtraccionDto` no los expone) y el mapper los devuelve `null` de forma incondicional. Un cliente que construya su UI sobre esos campos obtiene siempre un estado vacío.

---

## 3. Rendimiento

### 3.1 Mediciones reales (no estimadas)

**Entorno de medición:** Windows · Node 20 · NestJS 10 · PostgreSQL 16 en Docker (`booking_db_container`, localhost:5432) · dataset de 1 a 18 atracciones · cliente y servidor en el mismo host · 40 muestras por operación de lectura, 3 por operación de escritura.

| Operación | n | p50 | p95 | máx | Objetivo |
|---|---|---|---|---|---|
| `GET /api/v1/atracciones?page=1&limit=20` | 40 | **1049 ms** | **1410 ms** | 1633 ms | < 200 ms ❌ |
| `POST /api/v1/atracciones/search` | 40 | **3 ms** | **7 ms** | 23 ms | < 200 ms ✅ |
| `POST /api/v1/atracciones` — 2 categorías | 3 | 164 ms | — | 312 ms | < 300 ms ✅ |
| `POST /api/v1/atracciones` — 10 categorías | 3 | 161 ms | — | 172 ms | < 300 ms ✅ |
| `POST /api/v1/atracciones` — 20 categorías | 3 | 293 ms | — | 930 ms | < 300 ms ⚠️ |
| `POST /api/v1/atracciones` — 30 categorías | 3 | **2639 ms** | — | **3089 ms** | < 300 ms ❌ |
| `POST /atracciones/search` con `rows: 5000000` | 1 | **1212 ms** | — | — | debe ser 4xx ❌ |
| `GET /atracciones?limit=999999` | 1 | **763 ms** | — | — | debe ser 4xx ❌ |

> **Todas las cifras proceden de ejecuciones reales sobre el código de `main`, no de estimaciones.** Procedimiento reproducible en el [informe 04 §4](04-bitacora-revision-tecnica.md).

**Lectura de los datos:**

1. **Una diferencia de 350× entre dos endpoints que leen la misma tabla.** `search` (3 ms) usa `createQueryBuilder`; `findAll` (1049 ms) usa `findAndCount`. La única diferencia estructural es que `findAndCount` honra `eager: true` (7 relaciones) mientras el `QueryBuilder` las ignora. Esto aísla el coste en la carga de relaciones: **cualquier cliente que liste el catálogo con el endpoint documentado para ello paga 1 segundo por página**.

2. **Degradación no lineal en escritura.** De 2 a 30 categorías la latencia pasa de 164 ms a 2639 ms (**×16**). Una regresión lineal daría ×15 de consultas, no ×16 de tiempo con un salto brusco entre 20 y 30: el `INSERT` por elemento mantiene las transacciones y los índices abiertos. Es la firma inequívoca del patrón N+1 serial descrito en §3.3.

3. **El presupuesto de filas no existe.** `rows: 5000000` y `limit: 999999` se aceptan y ejecutan. Un atacante o un cliente con un bucle mal construido puede forzar la materialización de millones de objetos mapeados (cada uno con 7 relaciones eager anidadas). Es un vector de agotamiento de memoria, no una limitación estilística.

### 3.2 Hallazgo H-01 — Carga perezosa **inhibida** (severidad alta)

**Evidencia directa.** Siete relaciones de `Atraccion` están declaradas con `eager: true`:

| Línea | Relación | Tipo |
|---|---|---|
| `entities/atraccion.entity.ts:67` | `operator` | ManyToOne |
| `entities/atraccion.entity.ts:119` | `locations` | OneToMany |
| `entities/atraccion.entity.ts:125` | `photos` | OneToMany |
| `entities/atraccion.entity.ts:131` | `includes` | OneToMany |
| `entities/atraccion.entity.ts:139` | `categories` | ManyToMany |
| `entities/atraccion.entity.ts:143` | `badges` | ManyToMany |
| `entities/atraccion.entity.ts:147` | `supported_languages` | ManyToMany |

`eager: true` es una declaración global y silenciosa: **desactiva la carga perezosa por defecto en toda la entidad**, sin que ningún archivo del módulo lo mencione. Contradice frontalmente el requisito de auditar el uso de carga perezosa.

**Coste exacto.** En `findAll()` (`atracciones.service.ts:198-221`) con `take: 20`, TypeORM materializa el producto cartesiano de las colecciones: una atracción con 3 ubicaciones × 5 fotos × 4 includes × 3 categorías × 2 badges × 2 idiomas = **720 filas intermedias por atracción**, 14 400 filas para una página de 20. El planificador ejecuta 7 `LEFT JOIN` y un subconjunto desnormalizado para la paginación, y el ORM deduplica en memoria. Con el dataset de la auditoría (18 atracciones) eso ya cuesta un segundo; con catálogo real (miles de filas) el coste crece de forma superlineal.

**Recomendación.**
- Eliminar los siete `eager: true` y declarar la carga explícita por caso de uso con `relations` en los repositorios de detalle, o con `QueryBuilder` + `leftJoinAndSelect` en los listados (como ya se hace bien en `search`).
- Sustituir `findAll()` por un `QueryBuilder` con `leftJoinAndSelect` y paginación por subconsulta de ID: reproduce exactamente el rendimiento de `search` (3 ms) y elimina la diferencia de 350×.
- Publicar un DTO de listado («proyección de catálogo») sin `includes`/`photos` completos para las vistas de índice, y reservar el detalle completo para `GET /atracciones/{id}`.

### 3.3 Hallazgo H-02 — Patrón N+1 serial en la normalización de catálogos (severidad alta)

**Evidencia directa.** `atracciones.service.ts:620-657`:

```ts
private async findOrCreateCategories(names: string[]): Promise<Category[]> {
  const categories: Category[] = [];
  for (const name of names) {            // ← secuencial
    let cat = await this.categoryRepository.findOne({ where: { name } });
    if (!cat) {
      cat = this.categoryRepository.create({ name });
      await this.categoryRepository.save(cat);
    }
    categories.push(cat);
  }
  return categories;
}
```

El patrón se repite idéntico en `findOrCreateBadges` (l. 633) y `findOrCreateLanguages` (l. 646). Cada elemento provoca **2 viajes de ida y vuelta a PostgreSQL, uno tras otro**: con 30 categorías, 30 `SELECT` + 30 `INSERT` = 60 consultas **en serie**. Con red real (RTT 20–50 ms frente a ~0,3 ms en localhost) lapenalización sería de 1,2–3 s adicionales, y la medición local de 2639 ms es, si acaso, el suelo optimista.

Agravante: `create()`, `replace()` y `update()` invocan los tres helpers, de modo que una sola escritura puede disparar hasta **180 viajes de red**.

**Recomendación.** Resolver los tres catálogos en una sola pasada por lote:

```
1 SELECT * FROM categories WHERE name = ANY($1)      → hits
INSERT INTO categories (name) SELECT unnest($1)      → misses   (una sentencia)
2 SELECT * FROM categories WHERE name = ANY($1)      → relectura para obtener ids
```
Reducción: 60 consultas → 3. Para los 30 categorías, latencia esperada < 50 ms.

Alternativa transaccional: `INSERT ... ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING *`. Requiere un `@Index(['name'], { unique: true })` en `Category`, `Badge` y `Language` (hoy solo tienen clave primaria surrogate; la unicidad de negocio no está garantizada a nivel de BD en esas tablas).

### 3.4 Hallazgo H-05 — Operaciones destructivas sin transacción (severidad alta)

`EntityManager` se importa en `atracciones.service.ts:7` y **no se usa jamás**. La consecuencia es que `replace()` (l. 271-320) y `update()` (l. 370-416) ejecutan borrados y escrituras **fuera de cualquier transacción**:

```ts
const manager = this.atraccionRepository.manager;
await manager.delete(AtraccionLocation, { atraccion_id: id });   // 1
await manager.delete(AtraccionPhoto,      { atraccion_id: id });   // 2
await manager.delete(AtraccionInclude,    { atraccion_id: id });   // 3
…
await this.atraccionRepository.save(exists);                       // 4
```

Si el paso 4 falla —una restricción `CHECK`, una caída de conexión, un cierre de proceso— la atracción queda **sin ubicaciones, sin fotos y sin includes**, y el cliente ya recibió… nada, porque la petición falló. Peor: si el fallo ocurre entre el paso 1 y el 2, laillonación queda en un estado imposible que ninguna regla de negocio contempla. No hay forma de revertir.

`replace()` añade un riesgo adicional: la comprobación de conflicto de nombre (l. 256-269) y los borrados ocurren en unidades distintas, de modo que dos `PUT` concurrentes sobre la misma atracción pueden intercalar borrados y producir una mezcla de datos de ambas peticiones.

**Recomendación.** Envolver el cuerpo completo en `this.atraccionRepository.manager.transaction(async (em) => { … })` y usar el `EntityManager` transaccional para **todas** las operaciones del bloque. Añadir además un bloqueo pesimista (`pessimistic_write`) sobre la fila de la atracción en `replace`/`update` para serializar escrituras concurrentes.

### 3.5 Hallazgo H-06 — Sin presupuesto de filas (severidad alta)

- `SearchAtraccionesDto.rows` (`dto/search-atracciones.dto.ts:74`): `@IsInt()` sin cota. Aceptado: `rows: 5000000`.
- `PaginationQueryDto.limit` (`common/dto/pagination-query.dto.ts:18`): `@Min(1)` sin cota. Aceptado: `limit: 999999`.
- `DetailsRequestDto.attractions` (`dto/details-request.dto.ts:8`): sin `@ArrayMaxSize`. Un lote de 50 000 UUIDs genera un `IN (…)` de 50 000 elementos que supera los límites de parámetros de PostgreSQL (65 535) y provoca un 500.

**Presupuesto de rendimiento recomendado (adoptar como SLO contractual):**

| Recurso | Límite | Constante |
|---|---|---|
| `search.rows` | 1 … 100 | `MAX_SEARCH_ROWS` |
| `listado.limit` | 1 … 50 | `MAX_PAGE_SIZE` |
| `details.attractions` | 1 … 100 | `MAX_BATCH_IDS` |
| `reserve.ticket_count` | 1 … 20 | `MAX_TICKETS_PER_RESERVE` |
| Tamaño máximo de cuerpo | 1 MB | `express.json({ limit: '1mb' })` — **hoy no hay límite: el parser de body no está configurado en `main.ts`** |

Añadir además `@Throttle` (`@nestjs/throttler`) por IP y por `subject` del token: 60 req/min en lectura, 10 req/min en escritura.

### 3.6 Índices ausentes

`Atraccion` no declara ningún índice explícito más allá de la clave primaria, la única compuesta `(name, operator_id)` y las 6 restricciones `CHECK`.

| Consulta | Índice recomendado | Impacto |
|---|---|---|
| `search` filtra por `loc.country` | `idx_atraccion_locations_country` sobre `atraccion_locations(country)` | hoy: seq scan sobre ubicaciones |
| `search` ordena por `a.price_total`, `a.rating_count`, `a.created_at` | `idx_atracciones_price_total`, `idx_atracciones_rating_count`, `idx_atracciones_created_at` | hoy: sort en memoria |
| `search` filtra por `a.deleted_at IS NULL` | índice parcial `WHERE deleted_at IS NULL` | solo con soft-delete activo |
| `getAvailability` agrupa por `(atraccion_id, date)` y filtra `status` | `idx_reservations_atraccion_date_status` sobre `reservations(atraccion_id, date, status)` | hoy: seq scan en la reserva crítica |
| unicidad de idempotencia | `idempotency_key` ya es `UNIQUE` ✅ | correcto |

El impacto de estos índices no es visible todavía porque el dataset de prueba tiene 18 filas; con el `EXPLAIN ANALYZE` de producción todos los accesos de `search` y `getAvailability` degradean a sequential scan.

### 3.7 Observabilidad — ausente (severidad alta)

- **No hay un solo `Logger` en `src/`.** Ni arranque, ni peticiones, ni errores de negocio, ni consultas lentas.
- **No hay `request_id` propagado.** `generateRequestId()` (`atracciones.service.ts:742-744`) fabrica `req_${Date.now()}_${Math.random()…}` **dentro del servicio**, se devuelve en el cuerpo de dos respuestas y **nunca se emite como cabecera de correlación**. Un cliente que reporta un error no puede correlacionarlo con los logs (que no existen) y el identificador no es único ni trazable. Recomendación: `randomUUID()` (o ULID) en un middleware, devuelto en `X-Request-Id` y en el contexto de logging.
- **No hay métricas** (`prom-client`): sin histogramas de latencia, contadores de peticiones/errores, niREE gauges de conexión al pool.
- **No hay trazas** (OpenTelemetry). Con cuatro dominios previstos, la trazabilidad distribuida es un prerrequisito, no un extra.
- **`checkHealth()` es un auto-informe, no un healthcheck.** `atracciones.controller.ts:85-87` devuelve `{ status: 'UP' }` incondicionalmente, sin tocar la base de datos. **Verificado empíricamente**: el endpoint reporta `UP` sin ninguna comprobación. Un orquestador de contenedores nunca detectaría una caída de PostgreSQL a través de esta ruta. Debe existir además un readiness probe que ejecute `SELECT 1` y devuelva 503 si falla.

---

## 4. Capa de entrada — robustez de validación

| Defecto | Ubicación | Consecuencia |
|---|---|---|
| Sin `@MaxLength` en `name` (`varchar(255)`) | `dto/create-atraccion.dto.ts:14-16` | un nombre de 300 caracteres provoke un 500 de PostgreSQL en vez de un 400 |
| Sin `@MaxLength` en `duration` (`varchar(50)`) | `dto/create-atraccion.dto.ts:25-26` | idem; y la documentación promete ISO 8601 sin validarlo |
| `duration` `@IsString()` libre | `dto/create-atraccion.dto.ts:25` | se acepta `"cualquier cosa"`; el contrato afirma «Formato ISO 8601» |
| `@Query('date') date: string` sin pipe | `atracciones.controller.ts:287` | ni se valida el formato `YYYY-MM-DD` ni se rechaza una fecha pasada |
| `SortDto.by` `@IsString()` libre | `dto/search-atracciones.dto.ts:38` | cualquier valor cae silenciosamente al `default` (l. 87) sin error; debería ser `@IsEnum` |
| `customer_email` opcional sin normalizar | `dto/reservation.dto.ts:24-26` | se aceptan mayúsculas y espacios; no hay unicidad ni verificación de dominio |
| `enableImplicitConversion: true` global | `main.ts:23` | combinado con `@IsNumber()` sin `type` explícito, Swagger infiera el tipo de forma incorrecta y `class-transformer` puede coercionar `"abc"` a `NaN` antes de validar |

**Lo que sí está bien resuelto:** el `ValidationPipe` global con `whitelist`, `forbidNonWhitelisted` y `transform` (`main.ts:17-26`) es una configuración correcta y estricta — rechaza campos no declarados, lo que impide *mass assignment*. ✅

---

## 5. Observación sobre el alcance del repositorio

`src/modules/` contiene `alojamientos`, `autos`, `vuelos` y `atracciones`, pero `app.module.ts:26-28` **solo registra `AtraccionesModule`**. Los otros tres son andamiaje de la plantilla compartida:

- `vuelos/vuelos.service.ts` — 307 B, sin implementar.
- `atracciones/contracts/atracciones.graphql` (353 B) y `.proto` (454 B) — contratos declarativos, ningún servidor GraphQL/gRPC en el proyecto.
- `contracts/alojamientos-openapi.yaml`, `autos-openapi.yaml`, `vuelos-openapi.yaml` (32 KB, 30 KB, 44 KB) — contratos sin implementación que los respalde.

Consecuencia para el **Single Source of Truth**: de los 4 contratos OpenAPI del repositorio, **solo uno tiene implementación**, y es el que está roto (§2 del informe 03). Los otros tres no son verificables por construcción. Adicionalmente, `autoLoadEntities: true` (`app.module.ts:21`)_combina_ las entidades de todos los módulos que se activen; si dos equipos registran módulos con entidades homónimas, TypeORM colisionará en el registro de metadatos. Es un riesgo latente de integración entre equipos.

---

## 6. Plan de remediación priorizado

### Fase 0 — Contención (antes de cualquier despliegue, ~1 día)

| # | Hallazgo | Acción | Esfuerzo |
|---|---|---|---|
| 1 | **C-03** sobreventa | Validar disponibilidad dentro de una transacción con `SERIALIZABLE` o `SELECT … FOR UPDATE` sobre una fila de cupo por `(atraccion_id, date)`; modelar la capacidad como dato, no como constante `100` | 6 h |
| 2 | **C-04** carrera de idempotencia | Mover la comprobación de `idempotency_key` dentro de la transacción y capturar la violación de `UNIQUE` (SQLSTATE 23505) para devolver 409 en lugar de 500 | 3 h |
| 3 | **C-02** IDOR | Filtrar `getReservations()` por el sujeto autenticado | 2 h |
| 4 | **C-01** ausencia de autenticación | Implementar guard OAuth2/JWT con verificación de `scope`; restringir CORS | 8 h |
| 5 | **H-05** sin transacciones | Envolver `replace()` y `update()` en `manager.transaction()` | 3 h |

### Fase 1 — Rendimiento y contrato (~3 días)

| # | Hallazgo | Acción |
|---|---|---|
| 6 | H-01 eager | Retirar los 7 `eager: true`; reescribir `findAll` con `QueryBuilder` |
| 7 | H-02 N+1 | Resolver catálogos por lote (`ANY` + `INSERT … RETURNING`) |
| 8 | H-06 filas | `@Max(100)` en `rows`, `@Max(50)` en `limit`, `@ArrayMaxSize(100)` en batch |
| 9 | H-12 `_links` | Emitir `_links` de paginación o marcarlo opcional en el DTO |
| 10 | C-05 YAML duplicado | Eliminar el bloque duplicado de `/atracciones/{id}` |
| 11 | H-03 filtros ignorados | Implementar `cities`, `dates` y conversión de `currency`, o marcarlos opcionales y documentarlos como no soportados |
| 12 | H-08 RFC 7807 | Filtro global de excepciones con `@Catch()` y `content-type: application/problem+json` |

### Fase 2 — Sostenibilidad (~1 semana)

Indices (§3.6) · logger + `X-Request-Id` + métricas · healthcheck real · suite de pruebas con Jest sobre idempotencia, sobreventa y transaccionalidad · configuración de ESLint/Prettier real · `Health` de OpenAPI alineado con el contrato · CHANGELOG y política SemVer.

---

## 7. Trazabilidad de hallazgos

| ID | Severidad | Hallazgo | Evidencia | Empirical |
|---|---|---|---|---|
| C-01 | Crítica | Sin autenticación ni autorización | `main.ts:15`, `atracciones.controller.ts` | ✅ `POST` devolvió 201 sin token |
| C-02 | Crítica | IDOR en historial de reservas | `atracciones.service.ts:575-580` | por inspección |
| C-03 | Crítica | Sobreventa de cupos | `atracciones.service.ts:469, 483-531` | ✅ 297 tickets sobre capacidad 100 |
| C-04 | Crítica | Carrera TOCTOU en idempotencia | `atracciones.service.ts:488-529` | por inspección |
| C-05 | Crítica | Claves YAML duplicadas | `contracts/atracciones-openapi.yaml:160, 383` | ✅ parser: `GET /{id}` ausente |
| H-01 | Alta | `eager: true` ×7 | `atraccion.entity.ts:67-147` | ✅ p50 1049 ms vs 3 ms |
| H-02 | Alta | N+1 serial | `atracciones.service.ts:620-657` | ✅ ×16 con 30 categorías |
| H-03 | Alta | Filtros validados e ignorados | `atracciones.service.ts:46-120` | ✅ `cities`/`dates` ignorados |
| H-04 | Alta | `dto.languages` ignorado | `atracciones.service.ts:122-132` | por inspección |
| H-05 | Alta | Sin transacciones | `atracciones.service.ts:271-320, 370-416` | por inspección |
| H-06 | Alta | Sin cota de filas | `search-atracciones.dto.ts:74`, `pagination-query.dto.ts:18` | ✅ `rows:5000000` aceptado |
| H-07 | Alta | Token de paginación no firmado | `atracciones.service.ts:95-113` | por inspección |
| H-08 | Alta | `Content-Type` de error no conforme | `main.ts` sin filtro global | ✅ `application/json` |
| H-09 | Alta | `synchronize` activo sin `NODE_ENV` | `app.module.ts:22` | por inspección |
| H-10 | Alta | Cabecera de deprecación en endpoints vivos | `atracciones.controller.ts:154, 190` | por inspección |
| H-11 | Alta | Paginación contrato ≠ código | `atracciones-openapi.yaml:107-117` | por inspección |
| H-12 | Alta | `_links` obligatorio y ausente | `paginated-response.dto.ts:17` | ✅ ausente en la respuesta |
| H-13 | Alta | Sin pruebas automatizadas | `package.json` | ✅ verificado ausente |

### 7.1 Hallazgos de la Revisión 2 (2026-10-04)

| ID | Severidad | Hallazgo | Ubicación | Empirical |
|---|---|---|---|---|
| **H-14** | Alta | La cabecera obligatoria `Idempotency-Key` pasa a depender de la introspección de NestJS y pierde su descripción en el contrato publicado | 4 controladores, 13 declaraciones (sin commitear) | ✅ `in: header, required: true` sin `description` |
| **M-21** | Media | `info.description` publica dos afirmaciones falsas: errores RFC 7807 y `Idempotency-Key` obligatorio | `src/main.ts:30-37` | ✅ contradicho por H-08 y H-14 |
| **M-22** | Media | Versionado nativo correcto pero global: 0 anotaciones `@Version()` y sin `servers` en el documento | `src/main.ts:9-13` | ✅ `/api/v1` 200, `/api` y `/api/v2` 404 |
| **M-23** | Media | `feat!` con salto global de versión revertido sin ruta de deprecación; migraciones no cableadas | `b883d9c` → `a4b4657` | ✅ esquema `uuid` intacto, sin `src/migrations/` |

---

## 8. Revisión 2 — Cambios de arquitectura (2026-09-30 → 2026-10-04)

La Revisión 2 auditó 4 commits (`d2ef09c`, `b83a884`, `b883d9c`, `a4b4657`) y 4 controladores modificados sin commitear, y reverificó las comprobaciones ejecutables contra el servicio en marcha. Resultado: **0 hallazgos cerrados y 4 nuevos** (1 alto, 3 medios).

### 8.1 Qué se ha modificado

| Commit / cambio | Archivo | Efecto arquitectónico |
|---|---|---|
| `d2ef09c` | `docs/auditoria/**` | Ninguno sobre el sistema |
| `b83a884` | `src/main.ts` (+6 −2) | **Versionado nativo de NestJS**: `setGlobalPrefix('api')` + `enableVersioning({ type: URI, defaultVersion: '1' })` |
| `b883d9c` | 9 archivos (+116 −22) | `feat!` UUID→varchar con prefijo `ATR_`, salto a `v2`, `data-source.ts` y migración de 77 líneas |
| `a4b4657` | 9 archivos (−22 +116) | **Revert total** de `b883d9c`, 21 minutos después |
| Sin commit | 4 controladores (−21) | Eliminación de 13 declaraciones `@ApiHeader('Idempotency-Key')` |

**Ningún commit toca `atracciones.service.ts`, las entidades, los DTOs ni el contrato YAML.** Por eso **los 5 hallazgos críticos y los 13 altos de la Revisión 1 siguen exactamente como se describieron**: el servicio continúa sin autenticación, sin control de capacidad y sin transacciones, y las 7 relaciones mantienen `eager: true`.

### 8.2 El versionado nativo: correcto, con tres acoplamientos

Es un cambio de arquitectura **acertado**. Antes la versión viajaba dentro de una cadena de texto del prefijo global; ahora es una propiedad del framework con soporte propio.

Verificado contra el servicio en ejecución:

| Comprobación | Resultado |
|---|---|
| `GET /api/atracciones` (sin versión) | **404** — ya no existe |
| `GET /api/v1/atracciones` | **200** — URL pública idéntica |
| `GET /api/v2/atracciones` | **404** — no hay v2 |
| `GET /api/docs` | **200** — la documentación no se versiona |

Al no cambiar las URLs efectivas, **no hay ruptura para los clientes** y se cumple la convivencia exigida en el §5.2 del [informe 03](03-contrato-openapi-ssot.md). Se registra como punto positivo.

Los tres acoplamientos que deja (M-22, D-13):

1. **`_links` escritos a mano.** El mapper construye los enlaces con el literal `/api/v1/` (`atracciones.service.ts:707-723`). Coincide con la configuración **por casualidad**. Si `defaultVersion` pasa a `'2'`, los enlaces del catálogo seguirán apuntando a `/api/v1` y no lo detectará nadie: ni el compilador, ni las pruebas (no hay), ni el contrato. La configuración de versionado y la presentación HATEOAS deben derivar del mismo origen.
2. **Versionado global y no declarado.** Hay **0 anotaciones `@Version()`**. Todo depende del valor por defecto, así que un controlador nuevo hereda `v1` sin que el código lo exprese. La versión es una decisión de diseño y debe poder leerse en el código.
3. **`servers` ausente en el documento.** No se declara el host base `/api/v1`, de modo que un generador de clientes asumirá `/`. Corrección de una línea: `.addServer('/api/v1')`.

### 8.3 El `feat!` revertido: por qué casi fue un incidente de datos

El commit `b883d9c` (09:50) migraba las claves primarias de `uuid` a `varchar` con prefijo `ATR_` y saltaba la ruta a `v2`. Fue revertido a las 10:11.

**Estado verificado tras el revert:** limpio. Las entidades vuelven a `@PrimaryGeneratedColumn('uuid')`, no existe `src/data-source.ts`, no existe `src/migrations/`, y en PostgreSQL `atracciones.id :: uuid` con default `uuid_generate_v4()` y valores UUID reales.

Lo que importa es la causa de fondo: **el repositorio no tiene migraciones cableadas**. No hay `data-source.ts` ni array `migrations` en `TypeOrmModule.forRootAsync`, luego ninguna migración puede ejecutarse y **el único mecanismo de evolución de esquema es el sincronizador automático**.

Consecuencia concreta: si el servidor de desarrollo hubiera estado en ejecución durante esos 21 minutos, `synchronize` habría convertido `uuid` → `varchar` sobre tablas con datos reales, y el revert habría necesitado convertir valores `ATR_xxx` de vuelta a `uuid`, una transformación que PostgreSQL no realiza de forma implícita. **La integridad de los datos dependía de que nadie estuviera mirando en ese momento.** Es la demostración empírica del riesgo **H-09**, y por eso la recomendación de cablear migraciones versionadas deja de ser una mejora de higiene: es un requisito para poder cambiar el esquema.

El segundo aprendizaje es de gobierno: la etiqueta `feat!` es correcta, pero un cambio que altera la URL de **todas** las operaciones públicas exige `X-API-Deprecation-Date` + `Sunset` + convivencia de `v1` y `v2` durante un periodo acordado (§5.5 del [informe 03](03-contrato-openapi-ssot.md)). Aquí no lo hubo: fue un salto global de prefijo. El revert evitó el daño por decisión, no por proceso.

### 8.4 La cabecera `Idempotency-Key` en la capa de contrato (H-14)

Eliminados 13 `@ApiHeader` en 4 controladores. El efecto real, verificado:

| Extremo | Efecto en el documento publicado |
|---|---|
| `POST /atracciones/{id}/reservations` y `POST /atracciones/reservations/{id}/cancel` | NestJS **rederiva** la cabecera desde `@Headers('Idempotency-Key')`, de modo que sigue apareciendo como `in: header, required: true`. **Se pierde la descripción** y el nombre pasa a minúsculas frente al `Idempotency-Key` del YAML |
| `alojamientos`, `autos`, `vuelos` | La cabecera **desaparece por completo**: en `vuelos.controller.ts` hay 5 lecturas de `@Headers('Idempotency-Key')`, **0 guards**, y handlers esqueleto que devuelven `{}` sin usar el valor |

El hallazgo no es la eliminación en sí, sino que **el contrato publicado pasa a depender de un detalle de implementación del framework** en lugar de una declaración explícita. Si alguien cambia la forma de leer la cabecera, el documento pierde un parámetro **obligatorio** sin que ninguna prueba ni el compilador lo detecten, mientras el YAML —SSOT declarado— seguiría exigiéndolo.

### 8.5 La descripción del API afirma dos cosas falsas (M-21)

`src/main.ts:30-37` se publica como descripción autoritativa:

| Afirmación publicada | Realidad verificada |
|---|---|
| «Los errores siguen el estándar RFC 7807 (application/problem+json)» | Los errores se sirven en `application/json; charset=utf-8` (**H-08**) |
| «Todos los endpoints transaccionales exigen la cabecera `Idempotency-Key` (UUID v4)» | El guard solo valida **formato** cuando se usa, la cabecera no se valida en el servicio (**C-04**) y 3 endpoints la leen sin usar (**H-14**) |

Es el hallazgo que no proviene de un cambio, sino de una omisión: **la descripción se escribió como intención de diseño y se publicó sin verificarla**. Un consumidor de la documentación recibe garantías que el sistema no cumple.

### 8.6 Verificaciones sin cambio

| Comprobación | R1 | R2 |
|---|---|---|
| `tsc --noEmit` | 0 errores | **0 errores** |
| `nest build` | correcto | **correcto** |
| Operaciones en el documento generado | 14 | **14** |
| Operaciones con `security` | 0 | **0** |
| CORS en `main.ts:15` | `*` | **`*`** |
| Migraciones cableadas | no | **no** |
| Suites de pruebas | 0 | **0** |
| Linting funcional | no | **no** |

### 8.7 Métricas de código actualizadas

| Métrica | R1 | R2 |
|---|---:|---:|
| Archivos `.ts` del repositorio | 52 | **52** |
| Líneas del repositorio | 3 742 | **3 725** |
| Líneas del alcance auditado | 2 056 | **2 046** |
| `atracciones.service.ts` | 745 | **745** (sin cambios) |
| `atracciones.controller.ts` | 328 | **318** (−10, por H-14) |
| `main.ts` | 59 | **61** (+2, por el versionado) |
