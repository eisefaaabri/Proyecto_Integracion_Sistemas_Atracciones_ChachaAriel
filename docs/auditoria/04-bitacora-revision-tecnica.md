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
| Archivos TypeScript (total repo) | 52 | Recuento |
| Lineas de codigo (total repo) | **3 725** (R1: 3 742) | Recuento |
| Lineas en el scope auditado | **2 046** (R1: 2 056) | Recuento |
| Errores de `tsc --noEmit` | **0** | `npx tsc --noEmit` |
| Errores de compilacion | **0** | `npx nest build` |
| Inicializacion de `TypeOrmCoreModule` | **+337 ms** | Log de Nest |
| Resolucion de rutas | **+46 ms** | Log de Nest |
| Rutas mapeadas | 14 | Log de Nest |

**Lectura.** El arranque es correcto y rapido. La inicializacion de TypeORM (337 ms) domina, lo cual es normal y esperable con `autoLoadEntities` y `synchronize` activo. **`synchronize: true` en desarrollo implica DDL en cada arranque**, y con 9 entidades y 6 tablas pivote y `CHECK`, la ejecucion de migraciones es un coste recurrente que en produccion debe ser sustituido por migraciones versionadas (H-09).

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
| `swagger-ui-init.js` | **44 666** | 43,6 | 50 KB | — |
| `swagger-ui.css` | 152 071 | 148,5 | 100 KB | 1,5× |
| `favicon` ×2 | 1 293 | 1,2 | — | — |
| HTML shell | 3 126 | 3,1 | — | — |
| **TOTAL** | **1 884 202** | **1 840,0** | **225 KB** | **8,2×** |
| CSS total | | 148,5 | 100 KB | 1,5× |
| JS total | | 1 687,2 | 200 KB | 8,4× |

**Cifras de la R2** (2026-10-04, remedicion): solo cambia `swagger-ui-init.js` (45 218 → **44 666 B**), que embebe el documento OpenAPI; el resto de activos es identico y el ratio se mantiene en 8,2×.

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
| Cabeceras de seguridad ausentes | **6** | `curl -D -` |
| Hallazgos totales | **46** (5 criticos, 13 altos, 20 medios, 8 bajos) | Consolidado de los 4 informes |

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

| Severidad | R1 | R2 | Total |
|---|---:|---:|---:|
| Criticos | 5 | 0 | **5** |
| Altos | 13 | +1 (H-14) | **14** |
| Medios | 20 | +3 (M-21, M-22, M-23) | **23** |
| Bajos | 8 | 0 | **8** |
| **Total** | **46** | **+4** | **50** |

**Ninguno de los 46 hallazgos de la Revisión 1 se ha cerrado.** Los 5 críticos permanecen abiertos y verificados.
