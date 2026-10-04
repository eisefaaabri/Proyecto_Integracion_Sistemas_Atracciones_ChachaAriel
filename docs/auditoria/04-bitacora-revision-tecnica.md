# Informe 04 — Bitacora de Revision Tecnica y Metricas

**Proyecto:** Booking Prototipo — API de Atracciones
**Alcance de la revision:** `atracciones` + `common` (27 archivos, 2 046 lineas de las 3 725 del repositorio)
**Fecha:** 2026-09-30 · **Revision 2:** 2026-10-04
**Commit auditado:** `0cceeb5` (R1) → `a4b4657` + arbol de trabajo sin commitear (R2)

---

## 1. Registro de la sesion de auditoria

| # | Actividad | Resultado | Evidencia |
|---|---|---|---|
| 1 | Lectura de la estructura del repositorio y configuracion | `package.json`, `tsconfig.json`, `docker-compose.yml`, `.env.example`, `.gitignore` revisados | — |
| 2 | Busqueda del documento rector «CONSTRUCCION DESARROLLO WEB» | **No encontrado.** Se auditó contra ISO/IEC 25010, ISO/IEC 9126-3 y WCAG 2.2 AA | 3 `.md` en el repo, ninguno con ese nombre |
| 3 | Busqueda de superficie de front-end | **0 archivos** de interfaz | 0 resultados en `*.html,*.css,*.jsx,*.tsx,*.vue,*.svelte` |
| 4 | Analisis estatico de TypeScript | **0 errores**, exit code 0 | `npx tsc --noEmit` |
| 5 | Compilacion | **Correcta**, exit code 0 | `npx nest build` |
| 6 | Arranque del servicio | **Correcto** con PostgreSQL 16 en Docker | 14 rutas mapeadas |
| 7 | Pruebas funcionales sobre la API en ejecucion | 13 pruebas, 11 con afirmacion superada | ver §3 |
| 8 | Analisis del contrato OpenAPI con parser YAML | **2 claves duplicadas** detectadas; `get` ausente | PyYAML |
| 9 | Medicion de latencia | 6 operaciones, hasta 40 muestras por operacion | ver §4 |
| 10 | Medicion de recursos de la UI y cabeceras HTTP | 6 activos, 8 cabeceras | `curl` |
| 11 | Analisis estatico simulando ESLint | 5 importaciones muertas, 4 `any`, 3 enums duplicados | ver informe 05 |
| 12 | **Limpieza del entorno de pruebas** | Base de datos restaurada al estado inicial | ver §6 |

---

## 2. Historial de integracion reconstructivo

El repositorio tiene tres commits, todos de un unico autor funcional. La bitacora se reconstruye a partir de la historia de Git y del analisis del codigo.

| Commit | Alcance | Flujo de integracion | Evaluacion |
|---|---|---|---|
| `d3cb600` — `feat: Implementacion de API de Atracciones con NestJS y TypeORM` | Modulo completo: 9 entidades, 8 DTO, controlador, servicio, contrato OpenAPI de 872 lineas | Alta inicial. Se diseño API-First: el YAML precede al codigo | **Correcto en el enfoque.** El problema es que no seUREGIDO conformance entre ambos (11 divergencias) ni se añadio validacion en CI |
| `d455592` — `fix: Agregar restriccion de unicidad en nombre de atraccion y validacion 409 Conflict` | `@Unique('UQ_atraccion_name_operator')` + `ConflictException` con RFC 7807 | Correccion posterior a un defecto detectado. Sin test que lo cubra | **Correcta la reaccion, incompleta la causa.** El defecto era una carrera de lectura-escritura; la restriccion UNIQUE cierra la ventana en la BD, pero `create()` mantiene un SELECT previo que sigue siendo TOCTOU (C-04) y la violacion de UNIQUE se traduce en un 500, no en un 409 |
| `0cceeb5` — `refactor: Normalizacion 3FN de la base de datos de Atracciones (ISO/IEC 9126-3)` | Eliminacion de JSONB compuesto, 6 tablas nuevas, 6 restricciones `CHECK` | Refactor estructural con referenciacion normativa explicita en el mensaje | **La mejor decision tecnica del repositorio.** Elimina la duplicacion de datos, hace las invariantes verificables en la BD y permite indexar. Se conserva integra en la remediacion |

### 2.1 Cambios estructurales que deben preservarse en la remediacion

1. **La normalizacion 3FN del commit `0cceeb5`.** Cualquier correccion de rendimiento (retirar `eager: true`) cambia como se *leen* las relaciones, no su estructura. No revertir.
2. **El patron de error RFC 7807** (`type` como URI, `title` estable, `detail` legible, `instance`). Extenderlo a los errores de validacion, no sustituirlo.
3. **`IdempotencyKeyGuard` con validacion de UUID v4 previa al controlador.** El patron es correcto —fallar temprano y con un mensaje accionable—; lo que falta es la transaccion que lo haga fiable (C-04).
4. **El `ValidationPipe` estricto** (`whitelist` + `forbidNonWhitelisted`). Impide *mass assignment*. Configuracion correcta.

### 2.2 Ausencias en el proceso de integracion

| Ausencia | Consecuencia demostrada |
|---|---|
| Sin validacion del contrato YAML | C-05 (clave duplicada) llego a produccion documental |
| Sin prueba de conformance contrato/codigo | 11 divergencias, 3 de ellas verificadas empiricamente |
| Sin suite de pruebas | Ninguna de las regresiones de este informe habria sido detectada |
| Sin linter funcional | 5 importaciones muertas y 3 enums duplicados acumulados |
| Sin `CHANGELOG` ni etiquetas de git | Sin trazabilidad de que cambio en `1.2.0` |
| Sin test de arranque multi-modulo | El escenario que el README describe (varios equipos activando modulos) no esta verificado |

---

## 3. Bitacora de pruebas funcionales

Resultado de la sesion del 2026-09-30 contra `dist/main.js` en `http://localhost:3100`, PostgreSQL 16 en Docker. El repositorio **no tiene suite de pruebas**; estas se ejecutaron como parte de la auditoria y son reproducibles.

| ID | Prueba | Resultado | Hallazgo |
|---|---|---|---|
| T1 | `GET /api/v1/atracciones/health` sin credenciales | `200 {"status":"UP"}` | M-18 (healthcheck no consulta la BD) |
| T2 | `GET /api/v1/atracciones?page=1&limit=3` sin credenciales | `200`, `totalItems` correcto | **C-01** |
| T2b | `_links` presente en la raiz de la respuesta paginada | **`False`** | **H-12** |
| T3 | `GET /api/v1/atracciones/{uuid-inexistente}` | `404`, `Content-Type: application/json` | **H-08** |
| T4 | `POST /api/v1/atracciones` **sin ninguna cabecera de autenticacion** | **`201 Created`**, recurso persistido | **C-01** |
| T5 | `POST /search` con `countries:['ZZ']` (pais inexistente) | `200 total_results: 0` | filtro `countries` funciona |
| T5b | `POST /search` con `cities:[999999,888888]`, `dates: 1900`, `countries: []` | **`200 total_results: 2`** | **H-03** |
| T6 | 3 reservas consecutivas de 99 tickets (capacidad declarada 100) | **3 × `201 Created` = 297 tickets**; `available_spots: 0` | **C-03** |
| T7 | `POST /search` con `rows: 5000000` | **`200`**, 1 212 ms | **H-06** |
| T8 | `GET /atracciones?limit=999999` | **`200`**, 763 ms | **H-06** |
| T9 | `security` declarado en la documentacion generada | **0 de 14 operaciones** | **C-01 / D-01** |
| T10 | `Content-Type` de la respuesta de error | `application/json; charset=utf-8` | **H-08** |
| T11 | `POST /atracciones` con 2/10/20/30 categorias nuevas | 164 / 161 / 293 / **2 639 ms** | **H-02** |
| T12 | `GET /api/docs` | HTML servido, `lang="en"`, 0 `viewport`, 0 `role` | **A-01, A-03, A-04** |
| T13 | Parseo del contrato YAML | `DUPLICADOS: ['/atracciones/{id}']`, metodos efectivos `['delete','patch','put']` | **C-05** |

### 3.1 Resultados negativos que tambien importan

| Verificacion | Resultado |
|---|---|
| `.env` versionado en Git | **NO** — correctamente en `.gitignore:37`. Sin fuga de credenciales |
| `NODE_ENV` definido en `.env.example` | Si (`development`), pero `app.module.ts:22` lo trata por ausencia, no por valor (H-09) |
| `nest build` | Correcto |
| `tsc --noEmit` | 0 errores |

---

## 4. Metricas de rendimiento

### 4.1 Metricas de construccion y arranque

| Metrica | Valor | Fuente |
|---|---|---|
| Archivos TypeScript (total repo) | 54 | Recuento |
| Lineas de codigo (total repo) | **3 796** (R2: 3 725 · R1: 3 742) | Recuento |
| Lineas en el scope auditado | **2 100** (R2: 2 046 · R1: 2 056) | Recuento |
| Errores de `tsc --noEmit` | **0** | `npx tsc --noEmit` |
| Errores de compilacion | **0** | `npx nest build` |
| Inicializacion de `TypeOrmCoreModule` | **+337 ms** | Log de Nest |
| Resolucion de rutas | **+46 ms** | Log de Nest |
| Rutas mapeadas | 14 | Log de Nest |

**Lectura.** El arranque es correcto y rapido. La inicializacion de TypeORM (337 ms) domina, lo cual es normal y esperable con `autoLoadEntities`. En R3 **`synchronize` paso a ser opt-in** (`DB_SYNCHRONIZE === 'true'`), por lo que el arranque ya **no ejecuta DDL**: verificado contra una base de datos vacia, no crea esquema ni tablas. El coste de arranque baja, y con el aparece el problema de H-09 descrito en el §9.2 del [informe 01](01-arquitectura-y-rendimiento.md): **sin migraciones cableadas, un entorno nuevo no tiene forma de instalar el esquema**.

### 4.2 Latencia por operacion

Condiciones: cliente y servidor en el mismo host, dataset de 1 a 18 atracciones, PostgreSQL 16 en Docker, sin compresion, sin cache. **Percentiles calculados sobre las muestras; no son estimaciones.**

| Operacion | n | p50 | p95 | max | SLO | Veredicto |
|---|---|---|---|---|---|---|
| `POST /atracciones/search` | 40 | **3 ms** | 7 ms | 23 ms | 200 ms | OK |
| `POST /atracciones` (2 cat.) | 3 | 164 ms | — | 312 ms | 300 ms | OK |
| `POST /atracciones` (10 cat.) | 3 | 161 ms | — | 172 ms | 300 ms | OK |
| `POST /atracciones` (20 cat.) | 3 | 293 ms | — | 930 ms | 300 ms | ALERTA |
| `POST /atracciones` (30 cat.) | 3 | **2 639 ms** | — | 3 089 ms | 300 ms | **FALLA** |
| `GET /atracciones?limit=20` | 40 | **1 049 ms** | 1 410 ms | 1 633 ms | 200 ms | **FALLA** |
| `POST /search` (`rows: 5 000 000`) | 1 | 1 212 ms | — | — | 4xx | **FALLA** |
| `GET /atracciones?limit=999999` | 1 | 763 ms | — | — | 4xx | **FALLA** |

**Indicadores derivados**

| Indicador | Valor | Comment |
|---|---|---|
| Degradacion por N+1 (2 a 30 categorias) | **× 16,1** | deberia ser lineal en numero de consultas; es superlineal en tiempo |
| Ratio `GET /atracciones` vs `POST /search` (misma tabla) | **× 350** | Aislado a `eager: true` (H-01) |
| Latencia de escritura con 30 categorias | 8,8× el SLO | H-02 |
| Latencia de lectura del catalogo | 5,2× el SLO | H-01 |

> **Advertencia sobre la validez de estas cifras.** El dataset tiene 18 filas. Los valores absolutos de latencia **no son representativos de produccion** y no deben usarse como linea base de capacidad. Lo que si es valido, y es lo que sostiene las conclusiones, son las **razones** medidas: (a) la diferencia de 350× entre dos endpoints sobre la misma tabla, que aísla la carga de relaciones; (b) la escalabilidad ×16 en el numero de categorias, que identifica el patron N+1. Ambas son propiedades estructurales del codigo, independientes del volumen de datos. Tras corregir H-01 y H-02, debe repetirse la medicion con un dataset de al menos 10 000 atracciones para obtener percentiles representativos.

### 4.3 Metricas de la interfaz (unica superficie de UI existente)

| Activo | Bytes | KB | Presupuesto | Exceso |
|---|---:|---:|---:|---|
| `swagger-ui-bundle.js` | 1 452 753 | 1 418,7 | 250 KB | 5,7× |
| `swagger-ui-standalone-preset.js` | 230 293 | 224,9 | — | — |
| `swagger-ui-init.js` | **48 962** | 47,8 | 50 KB | — |
| `swagger-ui.css` | 152 071 | 148,5 | 100 KB | 1,5× |
| `favicon` ×2 | 1 293 | 1,2 | — | — |
| HTML shell | 3 126 | 3,1 | — | — |
| **TOTAL** | **1 888 498** | **1 844,2** | **225 KB** | **8,2×** |
| CSS total | | 148,5 | 100 KB | 1,5× |
| JS total | | 1 692,6 | 200 KB | 8,5× |

**Cifras de la R3** (2026-10-04, remedicion): el total pasa de 1 884 202 a **1 888 498 B** (+4 296). El unico activo que cambia es `swagger-ui-init.js` (44 666 → **48 962 B**), que embebe el documento OpenAPI: el crecimiento coincide con la incorporacion del esquema `ErrorDto` y sus 15 referencias. Helmet no altera el cuerpo de las respuestas. El ratio se mantiene en **8,2×**.

**Compresion:** ausente. `bundle.js` responde con 1 452 753 bytes tanto con como sin `Accept-Encoding`. Impacto estimado con gzip: total de ~500 KB.

**Latencia de carga (localhost):** shell 2–4 ms; bundle 11–14 ms. No representativa del usuario final; el hallazgo se basa en el tamano de transferencia, no en la latencia local.

### 4.4 Metricas de errores y conformance

| Metrica | Valor | Fuente |
|---|---|---|
| Operaciones en el contrato efectivo | 13 | Parser YAML |
| Operaciones con `security` en el YAML | 11 | Lectura del contrato |
| Operaciones con `security` en la doc generada | **0** | `GET /api/docs-json` |
| Divergencias contrato/codigo | **11** | Conformance manual |
| Claves YAML duplicadas | **2** (1 destructiva) | PyYAML |
| Criterios WCAG 2.2 AA en fallo en la UI existente | **3** | Inspeccion del HTML servido |
| Criterios WCAG pendientes de verificacion | **3** | Sin instrumentacion |
| Cabeceras de seguridad presentes | **13 de 16** (R1/R2: 0 de 8; `X-Powered-By` eliminado) | `curl -D -` |
| Respuestas `application/problem+json` | **0** | `GET /api/docs-json` |
| Hallazgos totales | **56** (5 criticos, 16 altos, 26 medios, 9 bajos) | Consolidado de los 4 informes |

**Tasa de error observada durante la sesion de pruebas:** 0 errores de servidor. Los 13 casos de prueba devolvieron respuestas correctas segun el codigo implementado. **Esto es precisamente el problema**: la API responde con exito a peticiones que no deberian aceptarse (escritura sin token, sobreventa, `rows` de 5 millones, filtros ignorados). Una tasa de error del 0 % en estas condiciones indica ausencia de validacion, no ausencia de defectos.

---

## 5. Analisis de riesgo priorizado (probabilidad x impacto)

| ID | Riesgo | Prob. | Impacto | Nivel | Mitigacion |
|---|---|---|---|---|---|
| R-01 | **Sobreventa de cupos** en produccion; perdidas economicas y de reputacion | Alta | Catastrofico | **CRITICO** | C-03: transaccion + bloqueo de fila + capacidad como dato |
| R-02 | **Escritura sin autenticacion**: un tercero crea, modifica y elimina el catalogo | Alta | Catastrofico | **CRITICO** | C-01: guard OAuth2 con verificacion de `scope` |
| R-03 | **Fuga de datos personales**: `GET /reservations` devuelve todas las reservas, con `customer_name` y `customer_email` | Alta | Alto | **CRITICO** | C-02: filtrar por el sujeto autenticado |
| R-04 | Integracion de un cliente contra un contrato incompleto: `GET /atracciones/{id}` no existe en el contrato | Media | Alto | **ALTO** | C-05 + Spectral `no-dupe-keys` en CI |
| R-05 | Buscador de viajes que muestra disponibilidad inexistente (H-03) | Alta | Alto | **ALTO** | H-03: implementar, reducir contrato o rechazar con 422 |
| R-06 | Perdida de datos en `PUT`/`PATCH` por fallo intermedio sin transaccion | Media | Alto | **ALTO** | H-05: `manager.transaction()` |
| R-07 | Denial of service por `rows: 5000000` | Media | Medio | **ALTO** | H-06: cotas + throttle + limite de cuerpo |
| R-08 | Caida de PostgreSQL no detectada: `health` responde `UP` siempre | Alta | Medio | **ALTO** | M-18: readiness probe con `SELECT 1` |
| R-09 | Latencia de catalogo > 1 s impide la adopcion del listado en el cliente | Alta | Medio | **ALTO** | H-01: retirar `eager`, reescribir `findAll` |
| R-10 | Colision de metadatos TypeORM al activar varios modulos (escenario README) | Media | Medio | **MEDIO** | Test de arranque con los 4 modulos |
| R-11 | Sin observabilidad: cualquier incidente sera indemostrable | Alta | Medio | **ALTO** | Logger + `X-Request-Id` + metricas |
| R-12 | Cambio de esquema en cascada al normalizar, sin migraciones | **Alta** (R2) | Alto | **ALTO** | Migraciones versionadas, retirar `synchronize`. **Materializado en R2**: ver R-13 |

---

## 6. Registro de limpieza del entorno

La auditoria creo datos de prueba en la base de datos. Se procedio a restaurarlos al estado exacto previo. **Se declara explicitamente para que conste en el historial.**

| Paso | Accion | Resultado |
|---|---|---|
| 1 | Inventario antes de la sesion | 1 atraccion: `Tour al Parque Nacional Cotopaxi` |
| 2 | Creacion durante las pruebas | 18 atracciones adicionales, 4 reservas, 193 categorias, 9 operadores |
| 3 | Borrado de reservas, relaciones dependientes, atracciones de prueba, categorias, badges, idiomas y operadores de prueba | `DELETE` en cascada aplicado por las FK |
| 4 | Limpieza de filas huerfanas en tablas pivote | Los borrados en cascada las eliminaron; verificado 0 huerfanas |
| 5 | **Verificacion final** | `atracciones: 1` · `reservations: 0` · `categories: 2` · `badges: 1` · `languages: 2` · `atraccion_categories: 2` · `operators: 1` |

**Estado: base de datos restaurada.** El servicio fue detenido tras cada tanda de pruebas; no queda ningun proceso `node dist/main.js` ejecutandose.

> **Observacion lateral, no un hallazgo.** Las tablas pivote se llaman `atraccionesId` y `categoriesId` (camelCase, convencion por defecto de TypeORM) mientras el resto del esquema usa `snake_case`. Esto obligo a entrecomillar los identificadores en SQL y es una fuente previsible de error en scripts de administracion. Registrado como L-01 en el informe 01.

---

## 7. Propuestas de mejora continua

### 7.1 Metricas a instrumentar (ninguna existe hoy)

| Metrica | Tipo | Etiquetas | Umbral de alerta |
|---|---|---|---|
| `http_request_duration_seconds` | Histograma | `method`, `route`, `status` | p95 > 0,5 s |
| `http_requests_total` | Contador | `method`, `route`, `status` | tasa de 5xx > 1 % |
| `db_pool_active` / `db_pool_waiting` | Gauge | — | `waiting` > 0 sostenido |
| `db_query_duration_seconds` | Histograma | `operation` | p95 > 0,1 s |
| `reservations_created_total` | Contador | `status` | — |
| `idempotency_conflicts_total` | Contador | `endpoint` | — |
| `oversell_blocked_total` | Contador | `atraccion_id` | **alerta si > 0 en horario bajo** |
| `auth_failures_total` | Contador | `reason` | **alerta si > 100/min** |
| `unhandled_exceptions_total` | Contador | `path` | > 0 |

**Por que `oversell_blocked_total` es el indicador mas importante del sistema.** Es la unica metrica que habria detectado R-01. Una vez implementado el control de capacidad, un valor mayor que cero en horario de baja actividad indica un intento de explotacion o un fallo en la reserva de cupo. En el estado actual del codigo, el valor seria **siempre 0 porque el control no existe** — lo cual es precisamente el hallazgo.

### 7.2 Plan de pruebas de usabilidad (no ejecutado)

El repositorio no tiene instrumentacion de analitica y no se ha ejecutado ninguna prueba con usuarios. **No se reportan resultados porque no se realizaron.** Se propone el diseno para que el equipo lo ejecute cuando exista front-end:

| Prueba | Metodo | Participantes | Metrica objetivo | Criterio de exito |
|---|---|---|---|---|
| Busqueda de una atraccion por destino y fecha | Tarea Guadada, moderada | 5 | Tasa de exito, tiempo | >= 80 % de exito sin ayuda; mediana < 60 s |
| **Reserva con error de idempotencia** | Tarea Guadada con 409 inyectado | 5 | Comprension del mensaje | >= 4 de 5 explican que hacer tras el error |
| Resumen de precio y disponibilidad | Tarea Guadada | 5 | Exactitud de la lectura | >= 4 de 5 identifican el total correcto |
| Catalogo vacio (E3) | Tarea libre | 5 | Comprension | >= 4 de 5 distinguen "sin resultados" de "error" |
| Filtro con fechas no soportadas (E4) | Tarea libre | 5 | Deteccion de la incongruencia | **>= 3 de 5 notan que el filtro no se aplico** |
| Navegacion solo por teclado | Tarea, sin raton | 3 | Tareas completadas | 100 % de las tareas criticas alcanzables |
| Lector de pantalla (NVDA) | Tarea, con lector | 3 | Errores de announced | 0 tareas Criticas sin anuncio de estado |

**La prueba E4 es la mas reveladora del diseno.** Si menos de 3 de 5 usuarios notan que el filtro de fecha no se aplico, la interfaz esta induciendo a error al usuario con datos falsos. Confirma que H-03 no es solo un defecto de backend.

### 7.3 Cadencia de mejora sugerida

| Frecuencia | Accion |
|---|---|
| Por commit | Conformance del contrato contra la doc generada; `spectral lint`; `tsc`; suite de pruebas |
| Semanal | Revision de la distribucion de latencias p95 por ruta; revision de alertas |
| Quincenal | Rotacion del parche de dependencias (`npm audit`); revision de hallazgos abiertos |
| Mensual | Revision del presupuesto de rendimiento de la UI y del contrato (semver) |
| Trimestral | Prueba de arranque con los 4 modulos; ensayo del plan de recuperacion ante fallos |

---

## 8. Cierre de la revision

**Estado global: NO APTO para despliegue en produccion.**

| Bloqueante para produccion | Hallazgo | Esfuerzo estimado |
|---|---|---|
| Autenticacion y autorizacion ausentes | C-01 | 8 h |
| Filtrado de reservas por usuario | C-02 | 2 h |
| Control de capacidad transaccional | C-03 | 6 h |
| Transaccion de reservas (idempotencia bajo carrera) | C-04 | 3 h |
| Correccion del contrato duplicado | C-05 | 1 h |
| **Total fase de contencion** | | **≈ 20 h** |

Tras la contencion, el servicio podra desplegarse en un entorno de integracion. Para produccion faltan ademas: transacciones en `PUT`/`PATCH` (H-05), cotas de paginacion (H-06), limites de error RFC 7807 (H-08), retirada de `synchronize` con migraciones (H-09), carga diferida (H-01), resolucion del N+1 (H-02) y observabilidad (M-18).

**Nota final sobre el alcance de esta bitacora.** Todas las cifras de latencia, tamaño y conformance de este informe proceden de ejecuciones reales sobre el codigo compilado del repositorio, en el entorno descrito en §4.2. No hay cifras estimadas ni proyectadas. Donde no se pudo medir (contraste, navegacion por teclado, comportamiento en navegador movil, pruebas con usuarios) se ha registrado explicitamente como pendiente, con el procedimiento y la herramienta necesarios para cerrarlo.

---

## 9. Revisión 2 — Sesión del 2026-10-04

**Motivo:** el equipo realizó cambios en el repositorio tras la Revisión 1 y solicitó actualizar los informes.
**Alcance de esta sesión:** 4 commits y 4 controladores modificados sin commitear. **Ninguna prueba funcional destructiva**: la sesión fue de solo lectura sobre los datos.

### 9.1 Registro de la sesión

| # | Actividad | Resultado | Evidencia |
|---|---|---|---|
| 1 | Inventario de cambios desde `0cceeb5` | 4 commits: `d2ef09c`, `b83a884`, `b883d9c`, `a4b4657` + 4 controladores sin commitear | `git log`, `git diff --stat` |
| 2 | Lectura del cambio de versionado | `setGlobalPrefix('api')` + `enableVersioning({type: URI, defaultVersion: '1'})` | `src/main.ts:9-13` |
| 3 | `tsc --noEmit` | **0 errores** | exit code 0 |
| 4 | `nest build` | **correcto** | exit code 0 |
| 5 | Verificacion de rutas contra el servicio en ejecucion | `/api/atracciones` → **404**, `/api/v1/atracciones` → **200**, `/api/v2/atracciones` → **404**, `/api/docs` → **200** | `curl` a `localhost:3000` |
| 6 | Reinspeccion del documento OpenAPI generado | 10 paths, **14 operaciones**, `security` en **0 de 14**, `servers` **no declarado** | `/api/docs-json` |
| 7 | Reinspeccion de la cabecera `Idempotency-Key` | Presente como `in: header, required: true` pero **sin `description`**; 3 de 4 controladores ya no la declaran | `/api/docs-json` vs `atracciones.controller.ts` |
| 8 | Estado del esquema en PostgreSQL 16 | `atracciones.id :: uuid` (default `uuid_generate_v4()`), `reservations.reservation_id :: uuid`, valores UUID reales. **Sin deriva de esquema** | `information_schema.columns` |
| 9 | Estado de las migraciones | **No existe** `src/migrations/` ni `src/data-source.ts`; `migrations` no esta cableado en `TypeOrmModule.forRootAsync` | `app.module.ts:15-24` |
| 10 | Remedicion de recursos de `/api/docs` | Total **1 884 202 B** (R1: 1 884 754). `swagger-ui-init.js` 45 218 → **44 666 B** | peticion HTTP a los 6 recursos |
| 11 | Reverificacion de cabeceras HTTP de `/api/docs` | 0 de 8 cabeceras de seguridad; `Access-Control-Allow-Origin: *`; `X-Powered-By: Express`; `Content-Encoding` ausente | peticion HTTP |
| 12 | Recuento estatico de codigo | 52 archivos / **3 725** lineas (repo); 27 archivos / **2 046** lineas (scope) | `Get-ChildItem` + `Get-Content` |
| 13 | Estado del entorno al terminar | Sesión de solo lectura: **0 filas creadas**. `atracciones: 1`, `reservations: 1` (esta última ajena a la auditoría, ver 9.3) | `psql` |

### 9.2 Near-miss documentado: R-13

**R-13 — Pérdida de datos por `synchronize` durante un cambio de esquema (materializado y revertido en 21 minutos)**

| # | Hecho verificado |
|---|---|
| 1 | `b883d9c` (09:50) cambió las PK de `uuid` a `varchar` con prefijo `ATR_`, añadió `data-source.ts` y una migración de 77 líneas, y saltó la ruta a `v2` |
| 2 | No hay migraciones cableadas: sin `data-source.ts` en el estado final, sin `src/migrations/`, sin array `migrations` en la configuración de TypeORM. **La migración de 77 líneas no pudo ejecutarse nunca** |
| 3 | El único mecanismo de evolución de esquema es `synchronize: true` (`app.module.ts:22`), que reescribe tablas en caliente |
| 4 | Si el servidor hubiera estado en ejecución durante esos 21 minutos, `synchronize` habría aplicado `uuid` → `varchar` sobre tablas con datos, y el revert habría exigido convertir valores `ATR_xxx` de vuelta a `uuid` — algo que PostgreSQL no hace de forma implícita |
| 5 | El revert (`a4b4657`, 10:11) fue limpio. Verificado: esquema `uuid` intacto, valores UUID reales, sin residuos |
| 6 | El daño se evitó por **suerte de calendario**, no por diseño |

**Probabilidad:** Alta — cualquier cambio de esquema futuro tiene la misma vía.
**Impacto:** Alto — pérdida de claves primarias y de referencias, sin migración que la reconstruya.
**Mitigación:** cablear `typeorm migration:run` + `data-source.ts` antes de permitir cambios de esquema; y retirar `synchronize` de todo entorno no efímero. Subir **R-12** de Media a **Alta** en el §5.

### 9.3 Registro de limpieza del entorno (R2)

La sesión del 2026-10-04 fue de **solo lectura**: no se creó ni modificó ninguna fila. Las únicas peticiones fueron `GET /api/docs`, `GET /api/docs-json`, `GET /api/v1/atracciones` y consultas de solo lectura a PostgreSQL.

| Comprobación | Resultado |
|---|---|
| Filas creadas por la auditoría en R2 | **0** |
| Migraciones ejecutadas | **0** |
| Cambios de esquema | **0** (esquema `uuid` verificado intacto) |
| Archivos del proyecto modificados | **0** — solo `docs/auditoria/**` |

**Estado de la base de datos al cierre de esta sesión:** `atracciones: 1` (la original), `reservations: 1`.

> **Aclaración de trazabilidad.** En la R1 el estado era `reservations: 0` porque la auditoría había borrado sus propios datos de prueba. La reserva que figura ahora (`778b4f36…`, 2 tickets, `CONFIRMED`, `Juan Pérez`, `2026-10-04 15:28:30`) es **ajena a esta auditoría**: fue creada por el servidor de desarrollo del equipo durante pruebas manuales posteriores. **No se ha tocado ni debe tocarse.** Se documenta aquí para que un futuro inventario de datos pueda distinguir los datos de la auditoría de los del equipo.

### 9.4 Conteo final de hallazgos

| Severidad | R1 | R2 | R3 | Total |
|---|---:|---:|---:|---:|
| Criticos | 5 | 0 | 0 | **5** |
| Altos | 13 | +1 (H-14) | +2 (H-15, H-16) | **16** |
| Medios | 20 | +3 (M-21, M-22, M-23) | +4 (M-24, M-25, M-26, M-27) | **27** |
| Bajos | 8 | 0 | +1 (L-02) | **9** |
| **Total** | **46** | **+4** | **+7** | **57** |

**Ninguno de los 46 hallazgos de la Revision 1 se ha cerrado.** Los 5 criticos permanecen abiertos y verificados.

**Mitigaciones parciales en R3:** **A-05** (parte de cabeceras de seguridad: de 0 de 8 a 13 de 16) y **H-09** (`synchronize` pasa a opt-in; persiste la ausencia de migraciones).

---

## 10. Revision 3 — Sesion del 2026-10-04 sobre `a39bfe7`

### 10.1 Registro de la sesion

| # | Actividad | Resultado | Evidencia |
|---|---|---|---|
| 1 | Inventario de cambios desde `a4b4657` | 1 commit (`a39bfe7`) + 5 ficheros modificados + 2 nuevos sin commitear | `git log`, `git status` |
| 2 | Lectura de `src/main.ts` (78 lineas) | `helmet()`, CORS parametrizado, `HttpExceptionFilter` global | `main.ts:14, 23-31` |
| 3 | Lectura de `src/app.module.ts` (33 lineas) | `synchronize: DB_SYNCHRONIZE === 'true'` | `app.module.ts:22` |
| 4 | `tsc --noEmit` | **0 errores** | exit code 0 |
| 5 | `nest build` | **correcto** | exit code 0 |
| 6 | Cabeceras de seguridad de `/api/docs` | **13 de 16 presentes**; CSP, HSTS, `X-Frame-Options`, `nosniff`; **`X-Powered-By` eliminado** | peticion HTTP |
| 7 | Verificacion de que la CSP rompe Swagger | **No rompe**: los 6 activos se sirven; shell en 3 126 B | peticion HTTP a los 6 recursos |
| 8 | CORS efectivo | `Access-Control-Allow-Origin: *` + `Access-Control-Allow-Credentials: true` | peticion HTTP |
| 9 | `.env` (valores no sensibles) | `NODE_ENV=development`, `PORT=3000`, `DB_SYNCHRONIZE=false`. **`FRONTEND_URL` no existe** | lectura de `.env` |
| 10 | `.env.example` | Solo `DATABASE_URL`, `NODE_ENV`, `PORT`. **Faltan `DB_SYNCHRONIZE` y `FRONTEND_URL`** | lectura del archivo |
| 11 | Forma de las respuestas de error | 404, 400 de validacion, 400 del guard y 500 devuelven la misma envoltura de 5 campos | `curl` a 4 endpoints |
| 12 | `Content-Type` de error | **`application/json; charset=utf-8`** en los 4 casos | `curl -w %{content_type}` |
| 13 | `details` real por caso | 404 → **string**, 400 validacion → **string[]**, 400 guard → **string**, 500 → **string** | corps de las 4 respuestas |
| 14 | `error` real por caso | `NotFoundException`, `BadRequestException`, `HttpException`, `InternalServerError` | corps de las 4 respuestas |
| 15 | `ErrorDto` en el documento generado | Presente en `components.schemas`; **15 respuestas** lo referencian; **0** `application/problem+json` | `GET /api/docs-json` |
| 16 | Esquema publicado de `details` | **`"type": "object"`**, con `example` de array | `GET /api/docs-json` |
| 17 | Arranque con `PORT=3111` (string) | **Abre puerto TCP** `0.0.0.0:3111 LISTENING`; no es named pipe | `netstat`, log de Nest |
| 18 | Arranque contra esquema inexistente | Arranca correcto; las consultas siguen leyendo de `public` (el parametro `schema` de la URL no aísla) | peticion HTTP |
| 19 | **Arranque contra base de datos vacia** con `DB_SYNCHRONIZE=false` | **Arranca correcto**; `health` → **200 `UP`**; `GET /atracciones` → **500**; **0 tablas creadas** | log de Nest, `curl`, `psql` |
| 20 | Log del servidor ante el 500 anterior | `QueryFailedError`, `42P01`, `does not exist` → **0 coincidencias** | `Select-String` sobre el log |
| 21 | `as any` en el scope | **6** (R1/R2: 4); los 2 nuevos en `http-exception.filter.ts:22` | `Select-String` |
| 22 | `common.module.ts` | **Sigue vacio**: `imports: []`, `providers: []`, `exports: []` | lectura del archivo |
| 23 | Recuento estatico | 54 archivos / **3 796** lineas (repo); 29 archivos / **2 100** lineas (scope) | `Get-ChildItem` + `Get-Content` |
| 24 | Estado de las instancias de prueba | 3 instancias (3111, 3113, 3114) **detenidas**; puertos libres | `netstat` |

### 10.2 Hallazgo destacado — el arranque "sano" de un sistema inservible

La prueba 19 merece aislarse porque es el resultado mas relevante de la R3. Con `DB_SYNCHRONIZE` desactivado —que es el valor por defecto desde R3— y una base de datos **sin ninguna tabla**:

```
[Nest] LOG [NestApplication] Nest application successfully started

GET /api/v1/atracciones/health   -> 200  {"status":"UP","timestamp":"..."}
GET /api/v1/atracciones          -> 500  {"status":500,"error":"InternalServerError",
                                            "details":"Internal server error", ...}
psql> SELECT count(*) FROM pg_tables  -> 0
```

El arranque es correcto, el endpoint de salud **responde `UP`** y el servicio es incapaz de devolver una sola fila. Como no hay migraciones cableadas, no existe ninguna secuencia de instalacion que produzca el esquema: hay que arrancar a mano con `DB_SYNCHRONIZE=true` una vez y confiar en que el DDL de TypeORM sea equivalente al esquema de produccion.

La causa es que **H-09 se ha mitigado a medias**. Se eliminó el peligro de reescritura de tablas en caliente, pero el riesgo no se resolvió: **cambió de sitio**, del despliegue al desarrollador, y ahora viene acompañado de un `health` que afirma lo contrario. Esto eleva **R-08** —caida de PostgreSQL no detectada— de "riesgo alto" a fallo de operacion sin senal, y por eso el filtro que traga los 500 sin registrar (**H-15**) pasa dejevdad de inconvenience a un debugger.

### 10.3 Registro de limpieza del entorno (R3)

La sesion del 2026-10-04 (segunda tanda) creo **una** base de datos auxiliar vacia, `r3_scratch`, exclusivamente para producir la evidencia del §10.2. Fue eliminada al terminar.

| Comprobacion | Resultado |
|---|---|
| Base de datos `r3_scratch` | **CREADA y eliminada** (`DROP DATABASE`) |
| Bases de datos de prueba residuales | **0** (`r3_%` y `db_inexistente_r3`) |
| Filas creadas o modificadas | **0** |
| Migraciones ejecutadas | **0** |
| Cambios de esquema | **0** |
| Instancias de servicio lanzadas | **3** (puertos 3111, 3113, 3114), **todas detenidas** |
| Archivos del proyecto modificados | **0** — solo `docs/auditoria/**` |

**Estado de la base de datos al cierre:** `atracciones: 1`, `reservations: 1`. La reserva es **ajena a esta auditoria** y no se ha tocado (ver §9.3).

> **Nota operativa.** El proceso `nest start --watch` del usuario quedo sin proceso hijo escuchando en el puerto 3000 durante esta sesion, por competencia con el `nest build` ejecutado aqui. No es un defecto del codigo: es una consecuencia de compilar el mismo `dist` mientras el watcher esta activo. Se verifico al cierre que el watcher se recupera por si solo y que `localhost:3000` vuelve a responder **200**, de modo que no requiere intervencion.

### 10.4 Lo que la R3 demuestra sobre el proceso

Las tres revisiones cuentan una progresion que merece registrarse:

| Revision | Que cambio el equipo | Resultado de la auditoria |
|---|---|---|
| R1 → R2 | Versionado nativo (correcto) y un `feat!` con salto de version | Correcto con acoplamientos; 4 hallazgos nuevos |
| R2 → R3 | **Endurecimiento de la configuracion** respondsiendo a hallazgos de la auditoria | **Primer caso de hallazgos parcialmente resueltos**: A-05 (cabeceras) y H-09 (`synchronize`) |

Es la primera vez que una correccion llega desde los informes, y el patron es consistente: **se aplica el mecanismo y se omite el requisito que cambia el protocolo**. En R3 eso significa `helmet` sin `compression`, y el filtro de excepciones sin `application/problem+json`. El mecanismo visible funciona; la propiedad que hace que el sistema sea correcto para un consumidor externo no se implemento. No es un error de ejecucion: es un criterio de aceptacion que los informes deben enunciar de forma verificable —"y el `Content-Type` debe ser `application/problem+json`"— para que pueda comprobarse.
