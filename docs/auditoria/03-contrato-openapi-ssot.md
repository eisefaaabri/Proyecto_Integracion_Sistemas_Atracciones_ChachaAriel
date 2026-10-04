# Informe 03 — Contrato OpenAPI, Fuente Unica de Verdad y Versionado

**Objeto:** `contracts/atracciones-openapi.yaml` (872 lineas, 23 648 bytes) frente a la implementacion NestJS.
**Fecha:** 2026-09-30
**Normativa:** OpenAPI Specification 3.0.3 · RFC 7807 (problem+json) · Semantic Versioning 2.0.0 · HTTP Semantics (RFC 9110)

---

## 1. Veredicto

**El contrato NO cumple su funcion de fuente unica de verdad.** No por defectos de estilo, sino porque es inutilizable como tal: tres de sus defectos hacen que un cliente que lo consuma integre contra una API que no existe, y dos de ellos son silenciosos — el cliente no recibe ningun aviso.

| Verificacion | Resultado |
|---|---|
| Sintaxis YAML valida | Si |
| Claves duplicadas | **2** (una destructiva) |
| Endpoints declarados por operacion | 14 |
| Endpoints **efectivos** tras resolver duplicados | **13** |
| Operaciones con `security` en el YAML | 11 |
| Operaciones con `security` en la doc generada | **0 / 14** |
| Divergencias contrato vs codigo | **11** |
| Politica de versionado documentada | No |
| Politica de compatibilidad hacia atras | No |
| Cumplimiento de RFC 7807 en el `Content-Type` | No |

---

## 2. Hallazgo C-05 — Claves YAML duplicadas: `GET /atracciones/{id}` desaparece del contrato

**Este es el hallazgo mas grave del repositorio y el unico que destruye informacion en silencio.**

### 2.1 Evidencia

`/atracciones/{id}` esta declarado **dos veces** en el mismo mapa `paths`:

- **Primera definicion:** lineas 160–266, con los cuatro metodos. El `get` (lineas 161–193) incluye las cabeceras `X-API-Deprecation-Date` y `Cache-Control`, y las respuestas 200 y 404.
- **Segunda definicion:** lineas 383–460, con **solo** `put`, `patch` y `delete`. **No incluye `get`.**

Ademas, dentro de la primera definicion, la clave `summary` aparece dos veces en el mismo `get` (lineas 163 y 168) con el mismo valor.

### 2.2 Verificacion con parser

Ejecutado con PyYAML sobre el archivo real:

```
DUPLICADOS: ['/atracciones/{id}']
DUPLICADOS: ['summary']
paths efectivo: 10
/atracciones/{id} metodos efectivos: ['delete', 'patch', 'put']
KeyError: 'get'
```

### 2.3 Consecuencia

**La resolucion de claves duplicadas en YAML es "la ultima gana"**, y aplica al **mapa completo**, no a las claves individuales. El segundo bloque `/atracciones/{id}` **reemplaza por completo** al primero. Resultado:

| Lo que el cliente cree | Lo que ocurre |
|---|---|
| `GET /atracciones/{id}` existe y devuelve 200 con `AtraccionResponseDto` | **El contrato no define `get` para esta ruta.** Un generador de cliente no produce el metodo. Un validador de contrato no lo comprueba. |
| `GET` devuelve las cabeceras `X-API-Deprecation-Date` y `Cache-Control` | Esas cabeceras **desaparecen del contrato**; estaban en la definicion anulada. |
| `GET` documenta la respuesta 404 | El 404 tambien desaparece. |

**Por que es peor que un error visible.** Un contrato invalido que un linter rechaza es un contrato que se arregla. Un duplicado en YAML se resuelve en silencio: el archivo es sintacticamente valido, `openapi-generator` y `swagger-parser` lo aceptan, y el unico sintoma es que un endpoint que existe en produccion no aparece en la documentacion. Un equipo integrador discovering la API unicamente por el contrato **construira un cliente incompleto** y no tendra ninguna señal de que le falta algo.

**Contraccion de la segunda definicion, por si se conserva:** si el autorudio deliberadamente reescribio el bloque, el `get` desaparecido es entonces un olvido distinto — pero el resultado observable es el mismo y la correccion es la misma.

### 2.4 Correccion

Eliminar por completo el segundo bloque (lineas 383–460) y fusionar en la primera definicion las respuestas 404 que aporta el segundo (`put`, `patch`, `delete` ya los tiene la primera; el segundo no aporta respuestas nuevas excepto el 404 de `put`, que la primera tambien declara). La primera definicion (160–266) es la completa y la correcta.

**Y anadir la red de seguridad que hizo falta para detectar esto:**

```jsonc
// package.json
{
  "scripts": {
    "lint":        "eslint \"{src,apps,libs,test}/**/*.ts\" --fix",
    "lint:api":    "spectral lint contracts/atracciones-openapi.yaml",
    "lint:api:fix":"spectral fix contracts/atracciones-openapi.yaml",
    "validate:api":"openapi-generator validate contracts/atracciones-openapi.yaml"
  }
}
```

`@stoplight/spectral-cli` con la regla **`no-dupe-keys`** activa en el preset `oas`. Sin esa regla, nada en la cadena de herramientas detecta el problema: no hay linter de contratos en el repositorio.

---

## 3. Divergencias entre contrato e implementacion

Tabla de conformance. «Verificacion» indica como se obtuvo la evidencia.

| # | Contrato declara | El codigo hace | Ubicacion | Verificacion |
|---|---|---|---|---|
| D-01 | `security: OAuth2Security` en 11 operaciones | **Cero** autenticacion o autorizacion; ningun guard de auth en el proyecto | `src/main.ts:11`; `atracciones.controller.ts` | **Empirica:** `POST /atracciones` devolvio **201** sin token; la doc generada tiene `security` en **0 de 14** operaciones |
| D-02 | `GET /atracciones?limit=&offset=` | `PaginationQueryDto` expone `page` y `limit`; `offset` no existe | `atracciones-openapi.yaml:107-117` vs `common/dto/pagination-query.dto.ts` | por inspeccion |
| D-03 | `PaginatedAtraccionResponse` | `findAll()` devuelve `{data, meta}` **sin `_links`**, y el DTO lo marca obligatorio | `common/dto/paginated-response.dto.ts:17` | **Empirica:** respuesta real sin la propiedad |
| D-04 | Errores en `application/problem+json` | Respuestas en `application/json`; sin filtro global de excepciones | `src/main.ts` | **Empirica:** `Content-Type: application/json; charset=utf-8` |
| D-05 | `ProblemDetails` con `type`/`title`/`status`/`detail`/`instance` | El `ValidationPipe` devuelve `{statusCode, message[], error}`: esquema distinto | `src/main.ts:13-22` | por inspeccion |
| D-06 | `UpdateAtraccionRequest` (objeto vacio, sin propiedades) | `PartialType(CreateAtraccionDto)`: 13 campos opcionales | `atracciones-openapi.yaml:744-746` | por inspeccion |
| D-07 | Scopes `attractions:read/book/write/webhooks` | `attractions:read/book/write/cancel` (`main.ts:45`); `attractions:cancel` **no existe** en el YAML y `attractions:webhooks` **no existe** en el codigo | `atracciones-openapi.yaml:515-519` vs `src/main.ts:41-46` | por inspeccion |
| D-08 | `/atracciones/details` devuelve detalles «en los idiomas solicitados» | `dto.languages` se recibe y **se ignora por completo** | `atracciones.service.ts:122-132` | por inspeccion |
| D-09 | `SearchAtraccionesRequest.cities` (obligatorio) | Se valida y **se ignora**; no hay ninguna condicion sobre `cities` | `atracciones.service.ts:46-120` | **Empirica:** `cities:[999999,888888]` devolvio `total_results: 2` |
| D-10 | `SearchAtraccionesRequest.dates` (obligatorio) | Se valida y **se ignora**; no hay filtro por fecha | idem | **Empirica:** `dates: 1900-01-01` devolvio resultados |
| D-11 | `SearchAtraccionesRequest.currency` (obligatorio) | Se valida y **se ignora**; no hay conversion de moneda | idem | por inspeccion |

### 3.1 D-09 / D-10: el hallazgo con mayor impacto de negocio

Tres de los cinco campos obligatorios de la busqueda **no producen ningun efecto**. Un cliente que busca «atracciones en Quito del 12 al 14 de marzo para 2 adultos» recibe `200 OK` con un listado que no esta filtrado por ciudad ni por fecha, y **nada en la respuesta indica que el filtro se aplico**.

Verificacion empirica registrada en la bitacora:

```
peticion: { currency:"XXX", cities:[999999,888888], countries:[],
            dates:{start_date:"1900-01-01", end_date:"1900-01-02"},
            rows:50, sort:{by:"most_popular"} }
respuesta: { metadata: { total_results: 2 }, ... }
```

Con un filtro de ciudad inexistente y un rango de fechas de 125 anos atras, el servidor devuelve 2 resultados. El unico filtro que si funciona es `countries` (implementado en `atracciones.service.ts:58-62`).

**Clasificacion.** Es un fallo de integridad de datos entrantes, no una simple funcionalidad pendiente: el sistema **afirma** un comportamiento que no tiene. Un buscador de viajes construido sobre esto mostrara al usuario disponibilidad que no existe.

**Decision requerida del equipo** (no es una correccion mecanica, es una eleccion de producto):
- **(a) Implementar** los tres filtros. Es lo que el contrato ya promete.
- **(b) Reducir el contrato** a lo que el sistema hace, marcando `cities`, `dates` y `currency` como opcionales y documentando la no soportencia.
- **(c) Rechazar** los filtros no soportados con `422 Unprocessable Entity` y un mensaje explicito.

Mientras no se decida, la opcion (c) es la mas segura: convierte un error silencioso en un error visible. La (b) es la honesta si el soporte no se va a implementar, y evita que un cliente se INTEGR[e] contra una promesa falsa.

---

## 4. RFC 7807 — cumplimiento parcial

El contrato declara `application/problem+json` en las tres respuestas reutilizables (`ProblemDetails400`, `ProblemDetails404`, `ProblemDetails409`, lineas 522–540) y construye objetos con la forma correcta de RFC 7807 en el codigo:

```ts
// atracciones.service.ts:229-236
throw new NotFoundException({
  type: 'https://api.booking-hub.com/errors/not-found',
  title: 'Atraccion no encontrada',
  status: 404,
  detail: `No se encontro una atraccion con el ID: ${id}`,
  instance: `/api/v1/atracciones/${id}`,
});
```

**Esto esta bien hecho y es reconocible como la mejor practica del repositorio**: `type` como URI de referencia del tipo de problema, `title` estable y apta para traduccion, `detail` legible por humanos, `instance` con la URI concreta. ✅

**Pero el cumplimiento es parcial por dos motivos:**

1. **El `Content-Type` no coincide.** Sin un filtro `@Catch()` global que fije `content-type`, NestJS serializa como `application/json`. Verificado empiricamente: `Content-Type: application/json; charset=utf-8`. Un cliente que enrute por `content-type` —como es lo correcto— **no reconocera ningun error de esta API**.
2. **Los errores de validacion no cumplen el esquema.** El `ValidationPipe` produce `{statusCode, message[], error}`. Un cliente que desserialice `ProblemDetails` obtendra `type`, `title`, `status` y `detail` como `undefined` en todos los 400 de validacion, que son los mas frecuentes.

**Correccion.** Filtro global de excepciones que (a) fije `application/problem+json` para toda respuesta >= 400, (b) traduzca la salida del `ValidationPipe` al esquema `ProblemDetails` aggregating los mensajes en `detail`, y (c) emita un `request_id` en `detail` o en una extension para correlación con los logs. Ademas, declarar en el contrato las respuestas **401** y **403**, hoy ausentes pese a que el contrato exige OAuth2 (D-01).

---

## 5. Politica de versionado (SemVer) — hoy inexistente

### 5.1 Estado actual

| Elemento | Estado | Evidencia |
|---|---|---|
| Version en el contrato | `1.2.0` (linea 18) | unica declaracion |
| Version en el codigo | `1.2.0` | `src/main.ts:34`, `.setVersion('1.2.0')` — **coincide**, lo cual es meritorio |
| Version en la URL | `api/v1` | `src/main.ts:9`, `setGlobalPrefix('api/v1')` — **coincide** |
| Endpoint de version | **No existe** | grep: ninguna ruta de version |
| `CHANGELOG.md` | **No existe** | no hay historial de cambios documentado |
| Git tags | **No hay** | `git tag` sin salida |
| Politica escrita | **No existe** | ninguna documentacion la declara |
| Cabecera `Deprecation` / `Sunset` | **Mal aplicada** | ver 5.3 |

> La version esta declarada de forma **coherente en tres sitios**, lo cual es el principio correcto. Lo que falta es todo lo demas: no hay forma de consultar que version se sirve, ni registro de que cambio entre versiones, ni politica que diga que se puede romper.

### 5.2 Versionado dual por URL — decision a confirmar

La API usa `api/v1` en la ruta. Con SemVer, conviene fijar por escrito cual de las dos estrategias se usa, porque **no son compatibles entre si** para un mismo consumidor:

| Estrategia | SemVer | Implicacion |
|---|---|---|
| Solo ruta (`/v1/atracciones`) | MAJOR fijo, MINOR y PATCH **no observables** | El cliente no puede descubrir mejoras compatibles. Es la practica mayoritaria en APIs publicas, y es aceptable, pero **debe declararse explicitamente** para que el consumidor no espere SemVer completo. |
| Ruta + cabecera (`Sunset`, `Deprecation`, version en respuesta) | SemVer completo observable | Requiere mas gobierno, pero permite deprecaciones finas. |

**Recomendacion para este repositorio.** Dado que el README anuncia «preparada para una futura migracion a Microservicios y Apollo Federation», y que la hoja de ruta es de varios equipos, se recomienda la **opcion mas simple que no mienta**: mantener `api/v1`, declarar en el `info.description` que la version vive en la ruta, y usar las cabeceras `Deprecation` y `Sunset` (RFC 8594) para signalling de fin de vida. Es exactamente lo que ya se intenta hacer, pero mal (5.3).

### 5.3 Hallazgo H-10 — Cabecera de deprecacion en endpoints vivos

```ts
// atracciones.controller.ts:159 y :195
@Header('X-API-Deprecation-Date', '2027-12-31')
```

Se aplica a `GET /atracciones` y a `GET /atracciones/{id}`: los dos endpoints **vivos y principales** del catalogo.

**Por que es un problema y no un detalle.** `Deprecation` y `Sunset` son señales de machine legibles. Un gateway API, un cliente generado o un script de monitorizacion que las lea conclusion que `GET /atracciones` esta siendo retirado en 2027-12-31. Eso puede provocar que un equipo **deje de invertir en el endpoint principal** o que un generador de cliente lo marque como obsoleto y lo omita. El contrato YAML ademas documenta esas cabeceras en la definicion de `get` que —por C-05— **quedo anulada**, de modo que hoy el codigo y el contrato estan en desorden respecto a la deprecacion.

No hay ninguna justificacion visible para marcar como deprecado lo que no lo esta. **Correccion:** eliminar ambas cabeceras hasta que exista una deprecacion real, o documentar la decision si la hay.

### 5.4 Politica de compatibilidad hacia atras — a adoptar

Se propone el siguiente texto normativo, para incorporar a `info.description` del contrato y al `README.md`:

#### Alcance de la versioning
- La version MAJOR vive en la ruta: `/api/v{n}`. La MINOR y la PATCH **no se exponen en la ruta**.
- El campo `info.version` registra la version de la especificacion, con SemVer completo, y se mantiene sincronizado con el codigo.
- Al alcanzar `v2`, `v1` se mantiene operativa durante un minimo de **6 meses** tras la publicacion de `v2`, comunicado con las cabeceras `Deprecation` y `Sunset` (RFC 8594) con **antelacion minima de 90 dias**.

#### Que cambios son compatibles (no requieren incremento de version)
- Anadir un endpoint nuevo.
- Anadir una propiedad **opcional** a un esquema de respuesta, con un valor por defecto sensato.
- Anadir un parametro de consulta opcional con valor por defecto equivalente al comportamiento anterior.
- Anadir un valor a un `enum`, siempre que el cliente trate lo desconocido de forma segura.
- Relajar una validacion de entrada.
- Anadir una cabecera de respuesta.

#### Que cambios son INcompatibles (requieren incremento de MAJOR)
- Eliminar o renombrar un endpoint, un parametro, una cabecera o una propiedad.
- Hacer obligatoria una propiedad que antes era opcional, o anadir un campo `required`.
- Cambiar el tipo de un campo, o su formato (`string` -> `integer`).
- Cambiar el codigo de estado de exito de una operacion existente.
- Reducir la generosidad de una validacion existente.
- Cambiar el significado de un valor existente de un `enum`.
- Cambiar el esquema o el `Content-Type` de una respuesta de error.
- Eliminar un valor de un `enum` en la peticion.

> **Nota sobre `enum` en respuestas.** Anadir un valor a un `enum` de **respuesta** se clasifica como compatible solo si el contrato lo declara y el cliente lo trata como texto abierto. En la practica esto casi nunca se cumple: lo mas seguro es asumir que cualquier cambio de `enum` es incompatible y documentarlo como tal.

#### Politica de deprecacion
1. Anuncio: cabecera `Deprecation: true` + `Sunset: <fecha HTTP>` en la respuesta, mas la entrada correspondiente en el `CHANGELOG.md`.
2. Periodo de aviso: **minimo 90 dias** entre el anuncio y la retirada.
3. La documentacion del endpoint deprecado se marca como tal en el `description` de la operacion, no solo en la cabecera: hay clientes que no la leen.
4. Retirada: incremento de MAJOR, nunca eliminacion silenciosa.

#### Entregables obligatorios del proceso
- `CHANGELOG.md` en formato Keep a Changelog, actualizado en cada cambio.
- Etiquetas de git por version (`v1.2.0`), hoy inexistentes.
- Validacion automatica del contrato en CI: sintaxis, reglas Spectral, y **conformance contra la especificacion generada por NestJS** (ver 6.2).

---

## 6. Propuesta de correccion del contrato

### 6.1 Fragmento OpenAPI corregido para `/atracciones/{id}`

Sustituye a **las dos** definiciones actuales (lineas 160–266 y 383–460) por una unica. Es un parche documental, no codigo de construccion.

```yaml
  /atracciones/{id}:
    parameters:
      - $ref: '#/components/parameters/AtraccionId'
    get:
      tags: [Atracciones - Catálogo]
      summary: Obtener el detalle de una atracción
      description: |
        Devuelve la representación completa de una atracción.

        Cabeceras de respuesta:
        - `Cache-Control: max-age=300` — la respuesta es cacheable 5 minutos.
      operationId: getAtraccion
      security:
        - OAuth2Security: [attractions:read]
      responses:
        '200':
          description: Detalle de la atracción.
          headers:
            Cache-Control:
              schema: { type: string }
              description: Directivas de caché.
          content:
            application/json:
              schema: { $ref: '#/components/schemas/AtraccionResponse' }
        '400': { $ref: '#/components/responses/ProblemDetails400' }
        '404': { $ref: '#/components/responses/ProblemDetails404' }
    put:
      tags: [Atracciones - Catálogo]
      summary: Reemplazar datos completos de una atracción
      operationId: replaceAtraccion
      security:
        - OAuth2Security: [attractions:write]
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/CreateAtraccionRequest' }
      responses:
        '204': { description: Reemplazo exitoso sin contenido de respuesta. }
        '400': { $ref: '#/components/responses/ProblemDetails400' }
        '404': { $ref: '#/components/responses/ProblemDetails404' }
    patch:
      tags: [Atracciones - Catálogo]
      summary: Actualizar parcialmente una atracción
      operationId: updateAtraccion
      security:
        - OAuth2Security: [attractions:write]
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/UpdateAtraccionRequest' }
      responses:
        '200':
          description: Actualización exitosa.
          content:
            application/json:
              schema: { $ref: '#/components/schemas/AtraccionResponse' }
        '400': { $ref: '#/components/responses/ProblemDetails400' }
        '404': { $ref: '#/components/responses/ProblemDetails404' }
    delete:
      tags: [Atracciones - Catálogo]
      summary: Eliminar una atracción
      operationId: deleteAtraccion
      security:
        - OAuth2Security: [attractions:write]
      responses:
        '204': { description: Eliminación exitosa sin contenido. }
        '404': { $ref: '#/components/responses/ProblemDetails404' }
```

**Cambios respecto al original:** se eliminan las cabeceras de deprecacion (H-10); se anaden `operationId` estables en las 4 operaciones —imprescindible para que los generadores de cliente produzcan nombres coherentes, y actualmente **ninguna operacion del contrato tiene `operationId`**, lo que hace que los nombres generados dependan del generador; se eliminan las declaraciones `summary` duplicadas; se centraliza el parametro `id` en `components/parameters`.

### 6.2 Correcciones estructurales complementarias

| Correccion | Detalle |
|---|---|
| `operationId` en las 14 operaciones | hoy ninguna lo tiene; los nombres de metodo generados varian entre herramientas |
| Scopes unificados | dejar `attractions:read/book/write/cancel` en el YAML **y** en `src/main.ts`; eliminar `attractions:webhooks` o implementar webhooks |
| `UpdateAtraccionRequest` real | replicar `PartialType(CreateAtraccionDto)`: 13 propiedades opcionales |
| Anadir `401` y `403` a todas las operaciones con `security` | hoy el contrato exige OAuth2 pero nunca documenta el fallo de autenticacion |
| Anadir `rateLimit` / `429` | coherente con la recomendacion de throttling del informe 01 |
| `servers` con URLs por entorno | hoy solo `url: /api/v1`; anadir staging y produccion |
| Parametros reutilizables | `components/parameters` para `AtraccionId`, `ReservationId`, `IdempotencyKeyHeader`, `PageParams` — hoy el parametro `id` se repite 6 veces con el mismo bloque |
| `ProblemDetails` con `request_id` | extension para correlacion con los logs, coherente con la observabilidad pendiente |

### 6.3 Conformance automatizado — el control que falta

El patron correcto para API-First es que **el YAML sea la fuente** y el codigo se derive o se verifique contra el. Este repositorio hace lo contrario: hay un YAML escrito a mano y decoradores `@ApiProperty` escritos a mano, y nada comprueba que coincidan. De ahi las 11 divergencias.

Dos niveles, ambos baratos:

**Nivel 1 — el contrato manda (recomendado).** Generar los DTOs y los controladores desde el YAML con `openapi-generator` / `@asteasolutions/zod-to-openapi`, y validar en CI que el `openapi.json` producido por NestJS es **identico** al YAML. Si divergen, la CI falla.

**Nivel 2 — conformance por comparacion.** Script en CI que diffree el `document` de `SwaggerModule.createDocument` contra `contracts/atracciones-openapi.yaml` y falle ante cualquier diferencia de rutas, metodos, codigos de estado, esquemas o `security`. Es menos ambicioso, pero convierte las 11 divergencias detectadas hoy en un fallo de construccion permanente.

Ademas: `no-dupe-keys` de Spectral, que habria detectado C-05 en el momento del commit.

---

## 7. Los otros tres contratos

| Contrato | Peso | Implementacion | Verificable |
|---|---:|---|---|
| `contracts/atracciones-openapi.yaml` | 23,6 KB | Si | Parcialmente — y esta roto (C-05) |
| `contracts/autos-openapi.yaml` | 30,8 KB | No (`AutosModule` no registrado) | **No** |
| `contracts/alojamientos-openapi.yaml` | 32,6 KB | No (`AlojamientosModule` no registrado) | **No** |
| `contracts/vuelos-openapi.yaml` | 44,7 KB | Parcial: `vuelos.service.ts` tiene 307 B, sin implementar | **No** |

**Riesgo para la integracion entre equipos.** El README instruye a «descomentar UNICAMENTE el modulo asignado a tu equipo». Si dos equipos cumplen a la vez, `app.module.ts` acaba con varios modulos y `autoLoadEntities: true` (`src/main.ts:21`) registra las entidades de todos ellos. Si dos de esos modulos definen entidades con nombres de tabla homonimos, TypeORM falla en el arranque con un error de metadatos duplicados; si los nombres coinciden pero los esquemas difieren, el fallo es mas dificil de diagnosticar. **No hay ningun test de arranque con los cuatro modulos activos**, precisamente el escenario que el README describe.

Recomendacion: un test de integracion que registre los cuatro modulos simultaneamente y verifique que el arranque es limpio. Es la prueba mas barata que evita el peor incidente de integracion posible.

---

## 8. Trazabilidad

| ID | Severidad | Hallazgo | Ubicacion | Verificacion |
|---|---|---|---|---|
| C-01 | Critica | Sin autenticacion pese a OAuth2 declarado | `src/main.ts:11` | **Empirica:** POST → 201 sin token; `security` 0/14 |
| C-05 | Critica | Claves YAML duplicadas; `GET /{id}` ausente | `atracciones-openapi.yaml:160, 383` | **Empirica:** parser → `['delete','patch','put']` |
| D-01 | Critica | `security` en 0 de 14 operaciones generadas | idem | **Empirica** |
| D-02 | Alta | Paginacion `offset` vs `page` | yaml:107-117 | por inspeccion |
| D-03 | Alta | `_links` obligatorio y ausente | `paginated-response.dto.ts:17` | **Empirica** |
| D-04 | Alta | `Content-Type` incorrecto para errores | `src/main.ts` | **Empirica** |
| D-05 | Alta | Errores de validacion fuera de `ProblemDetails` | `src/main.ts:13-22` | por inspeccion |
| D-06 | Alta | `UpdateAtraccionRequest` vacio | yaml:744-746 | por inspeccion |
| D-07 | Alta | Scopes divergentes entre YAML y codigo | yaml:515-519 | por inspeccion |
| D-08 | Alta | `dto.languages` ignorado | `service:122-132` | por inspeccion |
| D-09 | Alta | `cities` ignorado | `service:46-120` | **Empirica** |
| D-10 | Alta | `dates` ignorado | `service:46-120` | **Empirica** |
| D-11 | Alta | `currency` ignorado | `service:46-120` | por inspeccion |
| H-10 | Alta | Cabecera de deprecacion en endpoints vivos | `controller:159, 195` | por inspeccion |
| M-15 | Media | Ninguna operacion tiene `operationId` | yaml (global) | por inspeccion |
| M-16 | Media | Sin politica SemVer ni CHANGELOG | repo | por inspeccion |
