# Auditoria tecnica — Booking Prototipo / API de Atracciones

**Revision 1:** 2026-09-30 sobre `0cceeb5` · **Revision 2:** 2026-10-04 sobre `a4b4657` + arbol de trabajo sin commitear
**Alcance:** `src/modules/atracciones/**` + `src/common/**` (27 archivos, 2 046 de 3 725 lineas)
**Metodo:** analisis estatico, ejecucion real del servicio compilado contra PostgreSQL 16, y analisis del contrato OpenAPI con parser YAML.

> **Revision 2.** Se auditaron 4 commits y 4 ficheros modificados sin commit. Resultado: **0 hallazgos cerrados, 4 nuevos** (1 alto, 3 medios). Los 5 criticos siguen abiertos sin cambios. Detalle en [Cambios desde la Revision 1](#revision-2--cambios-desde-la-revision-1). Las conclusiones de la Revision 1 no se han invalidado.

---

## Veredicto

## NO APTO PARA DESPLIEGUE EN PRODUCCION

| Severidad | Cantidad | Bloquean produccion |
|---|---:|---|
| Criticos | **5** | 5 |
| Altos | **14** | 3 |
| Medios | **23** | 0 |
| Bajos | **8** | 0 |
| **Total** | **50** | |

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
| **C-01** | **No hay autenticacion ni autorizacion.** El contrato declara OAuth2 en 11 operaciones; el codigo no tiene ni un solo guard de auth. `main.ts:15` habilita CORS abierto | `POST /atracciones` devolvio **201 Created** sin ninguna cabecera de credencial. La doc generada declara `security` en **0 de 14** operaciones |
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
| A-06 | Presupuesto de la interfaz excedido **8,2×**; sin compresion | **1 884 202 B** medidos (remedidos en R2) |
| H-14 | La cabecera obligatoria `Idempotency-Key` pasa a depender de la introspeccion de NestJS y pierde su descripcion en el contrato publicado | `@ApiHeader` eliminado en 13 declaraciones en 4 controladores (sin commit) |

---

## Revision 2 - Cambios desde la Revision 1

**Commits revisados:** `d2ef09c` (documentacion), `b83a884` (versionado nativo), `b883d9c` (`feat!` UUID→varchar + salto a v2), `a4b4657` (revert de `b883d9c`).
**Sin commit:** 4 controladores modificados (eliminacion de `@ApiHeader('Idempotency-Key')`).

### Balance

| Indicador | Resultado |
|---|---|
| Hallazgos críticos cerrados | **0 de 5** |
| Hallazgos altos cerrados | **0 de 13** |
| Hallazgos nuevos | **4** (1 alto, 3 medios) |
| Total | 46 → **50** |
| Veredicto | **Sin cambio: NO APTO PARA PRODUCCION** |

Ningun commit posterior a la auditoria toca `atracciones.service.ts`, las entidades, los DTOs ni el contrato YAML. **Los hallazgos C-01 a C-05, H-01 a H-03, H-06 y H-08 permanecen exactamente como se describieron**: el servicio sigue sin autenticacion, sin control de capacidad y sin transacciones, y las 7 relaciones siguen con `eager: true`.

### 1. M-22 · Versionado nativo de NestJS (`b83a884`) — correcto, con reservas

```diff
- app.setGlobalPrefix('api/v1');
+ app.setGlobalPrefix('api');
+ app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
```

**Verificado empiricamente:** `/api/atracciones` → **404**, `/api/v1/atracciones` → **200**, `/api/v2/atracciones` → **404**. Las URLs efectivo no cambian, luego **no hay ruptura para los clientes** y `/api/docs` sigue sirviendo en la misma ruta. El cambio es correcto y mejora la capacidad de versionado.

Tres reservas que deja abiertas:

| # | Riesgo | Detalle |
|---|---|---|
| 1 | **Doble eje de version sin SSOT** | `defaultVersion: '1'` (ruta) y `.setVersion('1.2.0')` (documento) son versiones **independientes** que nadie relaciona. El commit revertido demonstrates el peligro: iba a mover la ruta a `v2` dejando el documento en `1.2.0` |
| 2 | **Versionado declarativo sin usar** | Hay **0 anotaciones `@Version()`** en el repositorio. Todo depende del valor global por defecto: un controlador nuevo hereda `v1` sin declararlo, y nadie lo ve en el codigo |
| 3 | **`_links` acoplado a mano** | El mapper construye los enlaces con el prefijo `/api/v1/` literal (`service:707-723`). Coincide con la configuracion **por casualidad**, no por derivacion. Un cambio de `defaultVersion` los rompe en silencio, sin error de compilacion |

**Medida:** anadir `.addServer('/api/v1')` al `DocumentBuilder` (hoy el documento no declara `servers`) y derivar el prefijo de los enlaces de la configuracion de versionado en lugar de escribirlo a mano.

### 2. M-23 · `feat!` UUID→varchar con salto a v2, revertido en 21 minutos (`b883d9c` → `a4b4657`)

El commit anadio `data-source.ts`, una migracion de **77 lineas** (`1730000000000-RefactorAtraccionId.ts`), cambios en 5 entidades y el salto de `defaultVersion` a `'2'`. Se revirtio por completo **21 minutos despues**.

**Estado verificado tras el revert:** entidades con `@PrimaryGeneratedColumn('uuid')`, sin `data-source.ts`, sin directorio `src/migrations/`, y en la base de datos `atracciones.id :: uuid` con default `uuid_generate_v4()` y valores UUID reales. **El revert fue limpio.**

Lo relevante es el proceso, y es un hallazgo con evidencia:

| Observacion | Lectura |
|---|---|
| El commit se etiqueto `feat!` correctamente, pero **sin ruta de deprecacion** | Rompe el requisito de compatibilidad hacia atras del §6.2 del [informe 03](03-contrato-openapi-ssot.md): un `!` exige `X-API-Deprecation-Date` + `Sunset` + v1 en paralelo, no un salto global de prefijo |
| Se escribieron **77 lineas de migracion que nunca se ejecutaron** | Y no por decision: **las migraciones no estan cableadas**. No hay `data-source.ts` ni array `migrations` en `TypeOrmModule.forRootAsync`, luego ninguna migracion puede ejecutarse. La recomendacion H-09 sigue **enteramente pendiente** |
| El cambio de esquema dependia de `synchronize: true` | Si el servidor de desarrollo hubiera estado en ejecucion durante esos 21 minutos, `synchronize` habria convertido `uuid` → `varchar` sobre tablas reales, y el revert habria necesitado convertir cadenas `ATR_xxx` de vuelta a `uuid`, algo que PostgreSQL no hace de forma implicita. **Hubiera sido perdida de datos.** No ocurrio por suerte de calendario, no por diseno |

Este episodio es la **demostracion empirica del riesgo H-09**: el repositorio no tiene migraciones, y el unico mecanismo de evolucion de esquema es un sincronizador automatico que reescribe tablas en caliente.

### 3. Eliminacion de `@ApiHeader('Idempotency-Key')` en 4 controladores (sin commit)

13 declaraciones eliminadas (2 en `atracciones`, 3 en `alojamientos`, 3 en `autos`, 5 en `vuelos`) han dejado de declarar la cabecera.

**Verificado empiricamente — el efecto real es menor de lo que parece y peor de lo que quedaria:**

| Extremo | Efecto en el contrato publicado |
|---|---|
| `POST /atracciones/{id}/reservations` y `POST /atracciones/reservations/{id}/cancel` | NestJS **rederiva** la cabecera desde `@Headers('Idempotency-Key')`, asi que el documento sigue declarandola `in: header, required: true`. **Se pierde la descripcion** («UUID v4 para garantizar idempotencia») y el nombre pasa a `idempotency-key` en minusculas frente al `Idempotency-Key` del YAML |
| `alojamientos`, `autos`, `vuelos` | La cabecera **desaparece por completo** de su documentacion: en `vuelos.controller.ts` hay 5 lecturas de `@Headers('Idempotency-Key')` **0 guards**, y los handlers son esqueletos que devuelven `{}` sin usar el valor |

**Por que es un hallazgo (H-14) y no una simple limpieza:** el contrato publicado pasa a depender de un **detalle de implementacion de NestJS** (la introspeccion de parametros) en lugar de una declaracion explicita. Si alguien cambia la lectura de la cabecera, el documento pierde un parametro **obligatorio** sin que ninguna prueba ni el compilador lo detecten. Ademas, el YAML —que es el SSOT declarado— si la exige, con lo que la divergencia D-01 se ensancha en lugar de cerrarse.

**Medida:** restaurar `@ApiHeader` en los 2 endpoints de reserva de `atracciones` (con descripcion y `required: true`) y tratar el YAML como fuente, no la introspeccion.

### 4. M-21 · La descripcion de Swagger afirma dos cosas que el sistema no cumple

`main.ts:30-37` se publica como descripcion autoritativa del API y contiene dos afirmaciones **falsas**:

| Afirmacion publicada | Realidad verificada |
|---|---|
| «Los errores siguen el estandar RFC 7807 (application/problem+json)» | Los errores se sirven en `application/json; charset=utf-8` (**H-08**, sin cambios) |
| «Todos los endpoints transaccionales exigen la cabecera `Idempotency-Key` (UUID v4)» | No hay ninguna validacion de la cabecera en el servicio; el guard solo valida el **formato UUID** cuando se usa, y 3 endpoints la leen sin usar (**C-04**, **H-14**) |

Es el unico hallazgo **nuevo** de esta revision que no proviene de un cambio del usuario, sino de una omision: la descripcion del documento se escribio como **intencion de diseño** y se publico sin verificarla. Un lector de la documentacion recibe garantias que el codigo no cumple (hallazgo **M-21**).

### 5. Verificaciones sin cambio

| Comprobacion | R1 | R2 |
|---|---|---|
| `tsc --noEmit` | 0 errores | **0 errores** |
| `nest build` | correcto | **correcto** |
| Operaciones en la doc generada | 14 | **14** |
| Operaciones con `security` | 0 | **0** |
| CORS | `*` | **`*`** |
| Cabeceras de seguridad en `/api/docs` | 0 de 8 | **0 de 8** |
| `<html lang>` / `meta viewport` | `en` / ausente | **`en` / ausente** |
| Migraciones cableadas | no | **no** |
| Tests | 0 | **0** |

**Nota sobre las metricas de interfaz:** el total de recursos de Swagger pasa de 1 884 754 a **1 884 202 B** (−552 B). La reduccion esta en `swagger-ui-init.js` (45 218 → **44 666 B**), que embebe el documento OpenAPI: al cambiar la configuracion de versionado, el documento incrustado cambia de tamano. El ratio contra el presupuesto se mantiene en **8,2×** y ningun otro activo ha cambiado.

---

## Lo que el repositorio hace bien

Una auditoria que solo enumere defectos es incompleta. Estos elementos son acertados y **deben preservarse** en la remediacion:

1. **La normalizacion 3FN del commit `0cceeb5`.** Eliminacion de JSONB compuesto, 6 tablas nuevas, 6 restricciones `CHECK` que defienden rangos que ningun DTO valida, y `numeric(10,2)` con transformer para el dinero. Es la mejor decision tecnica del repositorio.
2. **La disciplina del contrato.** El YAML de 872 lineas precede al codigo (API-First real) y usa un **patron de error RFC 7807 bien construido**: `type` como URI, `title` estable, `detail` legible, `instance` concreto. Falta aplicarlo a los errores de validacion, pero el patron existe y es correcto.
3. **La separacion Controlador–Servicio.** Los 13 handlers no contienen logica de negocio ni acceso a datos. **El criterio MVC se cumple.** La deuda esta en el servicio, no en el transporte.
4. **El `ValidationPipe` estricto** con `whitelist` + `forbidNonWhitelisted`, que impide *mass assignment*.
5. **El versionado nativo con `enableVersioning`** introducido en `b83a884` es la decision correcta: las URLs no cambian (verificado: `/api/v1` → 200, sin version → 404) y a partir de ahora puede coexistir v1 y v2. La migracion fue limpia y el revert no dejo residuos.
6. **`tsc --noEmit` con 0 errores** sobre 2 046 lineas, con el arbol de trabajo con cambios sin commitear.
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
- Recuento estatico sobre 2 046 lineas

**Revision 2:** se repitiieron las comprobaciones contra el servicio en ejecucion (rutas, documento OpenAPI, esquema PostgreSQL, cabeceras HTTP y recursos de la interfaz) y se recunto el codigo de nuevo. No se repitieron las 13 pruebas funcionales ni las mediciones de latencia: **ningun commit toca el servicio, las entidades ni el contrato**, luego las cifras de latencia de la Revision 1 siguen siendo validas. Lo que si se verifico de nuevo esta enumerado en la tabla final de la [Revision 2](#revision-2--cambios-desde-la-revision-1).

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
