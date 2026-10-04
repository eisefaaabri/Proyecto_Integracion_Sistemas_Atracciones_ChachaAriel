# Auditoria tecnica — Booking Prototipo / API de Atracciones

**Fecha:** 2026-09-30 · **Commit auditado:** `0cceeb5` (HEAD de `main`)
**Alcance:** `src/modules/atracciones/**` + `src/common/**` (27 archivos, 2 056 de 3 742 lineas)
**Metodo:** analisis estatico, ejecucion real del servicio compilado contra PostgreSQL 16, y analisis del contrato OpenAPI con parser YAML.

---

## Veredicto

## NO APTO PARA DESPLIEGUE EN PRODUCCION

| Severidad | Cantidad | Bloquean produccion |
|---|---:|---|
| Criticos | **5** | 5 |
| Altos | **13** | 3 |
| Medios | **20** | 0 |
| Bajos | **8** | 0 |
| **Total** | **46** | |

**Esfuerzo de contencion estimado: ≈ 20 horas.** Detalle en el §8 del [informe 04](04-bitacora-revision-tecnica.md).

---

## Documentos

| # | Documento | Contenido |
|---|---|---|
| 01 | [Arquitectura y rendimiento](01-arquitectura-y-rendimiento.md) | MVC/Vista-Controlador, capas, DDD y 3FN · carga perezosa · N+1 · transacciones · latencia medida · indices · plan de remediacion |
| 02 | [Accesibilidad WCAG 2.2 AA](02-accesibilidad-wcag22.md) | Auditoria de la unica UI existente · **contrato como especificacion de interfaz** · ARIA · mobile-first y 4 breakpoints · Gestalt · matriz de verificacion automatizable |
| 03 | [Contrato OpenAPI, SSOT y versionado](03-contrato-openapi-ssot.md) | Claves YAML duplicadas · 11 divergencias contrato/codigo · RFC 7807 · **politica SemVer y compatibilidad hacia atras** · fragmento YAML corregido |
| 04 | [Bitacora de revision tecnica](04-bitacora-revision-tecnica.md) | 13 pruebas funcionales · metricas de construccion, latencia y recursos · analisis de riesgo · propuestas de mejora continua · registro de limpieza del entorno |
| 05 | [Analisis estatico y deuda tecnica](05-analisis-estatico-lint.md) | Estado del linting · 5 importaciones muertas · 4 `any` · enums duplicados · 9 pasos de refactorizacion |

---

## Los 5 hallazgos criticos

Todos verificados empiricamente salvo donde se indica.

| ID | Hallazgo | Evidencia |
|---|---|---|
| **C-01** | **No hay autenticacion ni autorizacion.** El contrato declara OAuth2 en 11 operaciones; el codigo no tiene ni un solo guard de auth. `main.ts:11` habilita CORS abierto | `POST /atracciones` devolvio **201 Created** sin ninguna cabecera de credencial. La doc generada declara `security` en **0 de 14** operaciones |
| **C-02** | **IDOR.** `getReservations()` devuelve **todas** las reservas con `customer_name` y `customer_email`, pese a documentarse como «Historial de reservas del usuario» | `atracciones.service.ts:575-580` — sin filtro por sujeto |
| **C-03** | **Sobreventa de cupos.** La capacidad es una constante `100` (`service:469`) y `reserve()` no comprueba disponibilidad | **297 tickets vendidos** en 3 reservas de 99 sobre capacidad 100; `available_spots: 0` |
| **C-04** | **Carrera TOCTOU en la idempotencia.** SELECT y INSERT fuera de transaccion (`service:488-529`); la violacion de `UNIQUE` produce 500 en lugar de 409 | `service:483-531` — por inspeccion |
| **C-05** | **El contrato pierde un endpoint en silencio.** `/atracciones/{id}` esta declarado dos veces; la segunda no incluye `get`, y en YAML la ultima definicion reemplaza por completo a la primera | Parser: metodos efectivos `['delete','patch','put']`. **`GET /atracciones/{id}` no existe en el contrato** |

---

## Hallazgos de alto impacto con evidencia medida

| ID | Hallazgo | Metrica medida |
|---|---|---|
| H-01 | `eager: true` en **7 relaciones** (carga perezosa inhibida) | `GET /atracciones` p50 **1 049 ms** vs `POST /search` p50 **3 ms** sobre la misma tabla — ratio **×350** |
| H-02 | N+1 serial en `findOrCreateCategories/Badges/Languages` | `POST /atracciones`: 164 ms (2 cat.) → **2 639 ms** (30 cat.) — **×16** |
| H-03 | `cities`, `dates` y `currency` se validan y **se ignoran** | Peticion con `cities:[999999]` y `dates:1900` devolvio **`total_results: 2`** |
| H-06 | Sin cota de filas en `rows` ni `limit` | **`rows: 5000000` y `limit: 999999` aceptados** |
| H-08 | Errores en `application/json`, no `application/problem+json` | `Content-Type: application/json; charset=utf-8` |
| H-12 | `_links` obligatorio en el esquema y **nunca emitido** | Propiedad ausente en la respuesta real |
| A-01 | `<html lang="en">` en documentacion **100 % en espanol** | HTML servido |
| A-03 | Sin `meta viewport` → **Reflow imposible en movil** (WCAG 1.4.10 AA) | 0 ocurrencias en 3 126 B |
| A-06 | Presupuesto de la interfaz excedido **8,2×**; sin compresion | **1 884 754 B** medidos |

---

## Lo que el repositorio hace bien

Una auditoria que solo enumere defectos es incompleta. Estos elementos son acertados y **deben preservarse** en la remediacion:

1. **La normalizacion 3FN del commit `0cceeb5`.** Eliminacion de JSONB compuesto, 6 tablas nuevas, 6 restricciones `CHECK` que defienden rangos que ningun DTO valida, y `numeric(10,2)` con transformer para el dinero. Es la mejor decision tecnica del repositorio.
2. **La disciplina del contrato.** El YAML de 872 lineas precede al codigo (API-First real) y usa un **patron de error RFC 7807 bien construido**: `type` como URI, `title` estable, `detail` legible, `instance` concreto. Falta aplicarlo a los errores de validacion, pero el patron existe y es correcto.
3. **La separacion Controlador–Servicio.** Los 13 handlers no contienen logica de negocio ni acceso a datos. **El criterio MVC se cumple.** La deuda esta en el servicio, no en el transporte.
4. **El `ValidationPipe` estricto** con `whitelist` + `forbidNonWhitelisted`, que impide *mass assignment*.
5. **La coherencia de la version en tres sitios**: `1.2.0` en el YAML, en `main.ts` y `api/v1` en la ruta. Es el principio correcto de la versionado.
6. **`tsc --noEmit` con 0 errores** sobre 2 056 lineas.
7. **`.env` correctamente excluido** de Git (`.gitignore:37`). Sin fuga de credenciales.
8. **`IdempotencyKeyGuard` valida el formato UUID v4 antes del controlador** — fallar temprano y con un mensaje accionable es la practica correcta; lo que falta es la transaccion que lo haga fiable (C-04).

---

## Metodo y limites de esta auditoria

### Lo que se midio de verdad

Todas las cifras provienen de ejecuciones reales sobre `dist/main.js` compilado, contra PostgreSQL 16 en Docker. **No hay cifras estimadas ni proyectadas.**

- 13 pruebas funcionales sobre la API en ejecucion
- Latencia con hasta 40 muestras por operacion de lectura
- Analisis del contrato con PyYAML
- Tamano real de los 6 recursos de la interfaz y presencia de 8 cabeceras HTTP
- Recuento estatico sobre 2 056 lineas

**Restauracion del entorno:** los datos de prueba creados en la base de datos fueron eliminados y el estado verificado (`atracciones: 1`, `reservations: 0`, `categories: 2`, `operators: 1`). Detalle en el §6 del [informe 04](04-bitacora-revision-tecnica.md).

### Lo que NO se pudo verificar (y no se afirma)

- **Latencia representativa de produccion.** El dataset tiene 18 filas. Los valores absolutos no son una linea base de capacidad. Lo que si sostiene las conclusiones son las **razones** medidas: el ratio ×350 entre dos endpoints sobre la misma tabla, y la escalabilidad ×16 en el numero de categorias. Ambas son propiedades estructurales del codigo, independientes del volumen.
- **Contraste, navegacion por teclado, Reflow real y arbol de accesibilidad en runtime.** Requieren navegador y lector de pantalla. Procedimiento y herramientas en el §C.3 del [informe 02](02-accesibilidad-wcag22.md).
- **Pruebas de usabilidad.** No se realizaron. Se propone el diseno en el §7.2 del [informe 04](04-bitacora-revision-tecnica.md), sin reportar resultados.
- **Conformidad de los otros 3 contratos OpenAPI** (`alojamientos`, `autos`, `vuelos`): no son verificables, sus modulos no estan registrados y sus servicios son esqueletos.

### Alcance de la interfaz de usuario

El repositorio **no contiene front-end** (0 archivos `.html`, `.css`, `.jsx`, `.tsx`, `.vue`, `.svelte`). La unica superficie de IHC es la documentacion interactiva generada en `/api/docs`, auditada en la Parte A del [informe 02](02-accesibilidad-wcag22.md) con evidencia medida. La Parte B del mismo informe traduce el contrato en **criterios de aceptacion WCAG 2.2 AA** para el front-end pendiente, en lugar de simular hallazgos sobre una interfaz inexistente.

### Referencia normativa aplicada

Al no localizarse el documento rector «CONSTRUCCION DESARROLLO WEB» en el repositorio, se auditó contra: **ISO/IEC 25010** (calidad de producto), **ISO/IEC 9126-3** (mantenibilidad), **ISO/IEC 25010 §8** (eficiencia), **WCAG 2.2 AA**, **EN 301 549:2022**, **ISO 9241-210:2019** (IHC), **OpenAPI 3.0.3**, **RFC 7807**, **RFC 8594** (Sunset) y **Semantic Versioning 2.0.0**.
