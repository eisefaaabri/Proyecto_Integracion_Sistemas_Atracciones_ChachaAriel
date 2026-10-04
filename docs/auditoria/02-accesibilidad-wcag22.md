# Informe 02 — Auditoria de Interaccion Humano-Computador y Accesibilidad

**Alcance:** la unica interfaz de usuario existente en el repositorio, mas la especificacion de requisitos de accesibilidad que el contrato OpenAPI impone al front-end pendiente.
**Fecha:** 2026-09-30
**Normativa:** WCAG 2.2 nivel AA (W3C Recommendation, octubre 2023) · EN 301 549:2022 · ISO 9241-210:2019
**Metodo:** inspeccion del HTML servido, medicion real de recursos, verificacion de cabeceras HTTP. Todas las cifras proceden de peticiones HTTP reales, no de estimaciones.

---

## 1. Alcance y limitacion estructural

El repositorio **no contiene front-end**. Verificado:

```
Busqueda de *.html *.css *.scss *.jsx *.tsx *.vue *.svelte
(excluyendo node_modules y dist)  ->  0 resultados
```

La unica superficie de IHC es la documentacion interactiva generada por `SwaggerModule.setup('api/docs', ...)` en `src/main.ts:53`, servida por el propio backend.

**Consecuencia metodologica.** Auditar "diseno responsivo mobile-first con tres breakpoints", "principios Gestalt" o "semantica WAI-ARIA" sobre una pagina que no existe seria inventar hallazgos. Este informe hace dos cosas y solo dos:

- **Parte A** — audita la interfaz que **si existe** (`/api/docs`) contra WCAG 2.2 AA, con evidencia medida sobre el HTML realmente servido.
- **Parte B** — audita el **contrato OpenAPI como especificacion de interfaz**: los requisitos de accesibilidad, responsividad y Gestalt que se derivan de los datos y los estados que la API produce, formulados como criterios de aceptacion verificables para el equipo que construya el front-end.

Se declara explicitamente que parte del encargo es **no auditable hoy** y se registra como pendiente, nunca como aprobado: WCAG 1.4.10 Reflow, 2.5.8 Target Size, 3.2.6 Consistent Help, 3.3.7 Redundant Entry, 3.3.8 Accessible Authentication y el bloque de principios Gestalt, todos requieren una interfaz construida por el equipo cliente.

---

# PARTE A — Auditoria de la interfaz existente (`/api/docs`)

## A.1 Resultado por criterio de exito

| SC | Criterio | Nivel | Veredicto | Evidencia medida |
|---|---|---|---|---|
| 3.1.1 | Language of Page | A | FAIL | `<html lang="en">` con contenido 100 % en espanol |
| 2.4.1 | Bypass Blocks | A | FAIL | 0 enlaces de salto; el shell es un unico `<div>` |
| 1.4.10 | Reflow | AA | FAIL | `meta viewport` aparece **0 veces** en los 3 126 B del HTML |
| 2.4.2 | Page Titled | A | PARCIAL | `<title>Swagger UI</title>` — generico, no identifica la API |
| 1.3.1 | Info and Relationships | A | PARCIAL | `role=` 0, `aria-*` 0, `<main>` 0 en el shell servido |
| 1.4.3 | Contrast (Minimum) | AA | PENDIENTE | CSS de terceros; requiere medicion con herramienta |
| 2.1.1 | Keyboard | A | PENDIENTE | requiere recorrido real; no automatizable aqui |
| 4.1.3 | Status Messages | AA | PENDIENTE | lo construye el JS en runtime |

**Balance Parte A:** 3 FAIL, 2 PARCIAL, 3 PENDIENTES de verificacion manual. Ningun criterio se declara aprobado sin comprobacion.

## A.2 A-01 — `lang="en"` en una pagina en espanol · WCAG 3.1.1 (A) · CRITICA

**Evidencia.** HTML servido en `http://localhost:3100/api/docs` (3 126 bytes, integro):

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Swagger UI</title>
```

El contenido real esta en espanol: `"API de Atracciones Turisticas"`, `"Busqueda de atracciones con filtros complejos"`, `"Crear una reserva de la atraccion"`, `"Historial de reservas del usuario"`, `"Reserva no encontrada"`, `"Atraccion duplicada"`.

**Impacto concreto.** Un lector de pantalla con sintesis de voz selecciona la pronunciacion a partir del atributo `lang`. Al encontrar `lang="en"`, leera el espanol con fonetica inglesa: "Busqueda de atracciones" se pronunciara de forma incorrecta. El criterio 3.1.1 exige que el idioma por defecto sea programable; esta presente pero **es incorrecto**.

**Agravante de arquitectura.** El idioma erroneo esta en la raiz del documento, no en contenido traducible. Ninguna cantidad de trabajo de i18n en el front-end lo corrige, porque es el backend sirviendo esta pagina.

**Correccion.** `SwaggerModule.setup()` no expone opcion para `lang`. Requiere servir un shell HTML propio con `lang="es"`, o un middleware que reescriba el atributo en la respuesta de `/api/docs`. Es preferible el shell propio: resuelve tambien A-02 y A-03 en el mismo cambio.

## A.3 A-02 — Titulo no descriptivo · WCAG 2.4.2 (A) · MEDIA

`<title>Swagger UI</title>`. Con seis pestanas abiertas (Alojamientos, Autos, Atracciones, Vuelos, Gateway, otra), la pestana es indistinguible. El criterio se cumple tecnicamente pero sin valor funcional.

**Correccion (una linea).** Opcion `customSiteTitle` de `SwaggerModule.setup`:
`'API de Atracciones Turisticas — Booking Marketplace'`.

## A.4 A-03 — Sin `viewport`: Reflow fallido · WCAG 1.4.10 (AA) · CRITICA

**Evidencia.** `name="viewport"` aparece **0 veces** en el HTML servido. Sin esta etiqueta, los navegadores moviles usan un *layout viewport* de ~980 px y aplican *zoom-out* automatico: el texto se renderiza a una fraccion de su tamano nominal y el usuario debe hacer pinza-zoom para leerlo.

El criterio 1.4.10 exige que el contenido se adapte a un ancho de **320 CSS px** sin desplazamiento horizontal bidireccional. Sin `viewport`, la pagina se renderiza siempre a ~980 px de ancho de diseno: **el criterio no puede cumplirse en ningun movil**.

**Por que no se detecta en la revision habitual.** En escritorio (1 280 px) la pagina fluye correctamente y el fallo es invisible. Es un fallo exclusivo de movil, y la revision de escritorio es la que se hace por defecto.

**Impacto.** Para un usuario con baja vision que navega desde el movil, la documentacion de la API —el unico manual de integracion disponible— es inutilizable sin zoom. Y se acumula con A-06: descarga 1,8 MB, renderiza a 980 px y luego hace zoom.

**Correccion.** Inyectar `<meta name="viewport" content="width=device-width, initial-scale=1">` en el shell. Para un comportamiento *mobile-first* real, anadir despues los tres puntos de ruptura del apartado B.4 via `customCss`.

## A.5 A-04 — Sin bloques de derivacion · WCAG 2.4.1 (A) · CRITICA

**Evidencia.** El documento servido contiene, como estructura semantica, exactamente **un** elemento de contenido:

```html
<div id="swagger-ui"></div>
```

Recuento sobre el HTML servido:

| Elemento | Ocurrencias |
|---|---:|
| `role=` | **0** |
| `aria-*` | **0** |
| `<main>` | **0** |
| `<nav>` | **0** |
| `<header>` / `<footer>` | **0** |
| enlace de salto | **0** |

El arbol de accesibilidad lo construye `swagger-ui-bundle.js` en tiempo de ejecucion.

**Limite de esta evidencia (declarado).** Este hallazgo se apoya en la inspeccion estatica del HTML servido y en el comportamiento documentado de la libreria, **no** en un recorrido automatizado del DOM ya construido. Para una afirmacion categorica haria falta ejecutar `document.querySelectorAll('[role], main, nav, header')` tras el arranque y un recorrido con NVDA/JAWS/VoiceOver. Se registra por tanto como hallazgo confirmado por inspeccion, con verificacion manual pendiente.

**Impacto.** Un usuario de teclado o lector de pantalla que abre `/api/docs` aterriza al inicio de una pagina de 14 operaciones desplegables con formularios JSON. Para alcanzar la tercera debe recorrer numerosos elementos de navegacion en cada visita, y el contenido cambia con cada commit del contrato.

**Correccion.** (1) Enlace de salto visible al enfocar, `href="#swagger-ui"`, como primer elemento del `body`. (2) Envolver el contenido en `<main>`. Ambas requieren el shell propio de A-01.

## A.6 A-05 — Cabeceras de seguridad ausentes · CRITICA

Verificado con `curl -D -` sobre la respuesta de `/api/docs`:

| Cabecera | Estado | Implicacion |
|---|---|---|
| `Content-Security-Policy` | AUSENTE | Sin `frame-ancestors` la pagina puede embeberse en un `<iframe>` de terceros: vector de **clickjacking** sobre una herramienta de desarrollo. |
| `X-Content-Type-Options` | AUSENTE | Sin `nosniff` el navegador puede interpretar mal un recurso. |
| `X-Frame-Options` | AUSENTE | Refuerza el clickjacking. |
| `Strict-Transport-Security` | AUSENTE | Sin HSTS, la primera visita admite *downgrade* a HTTP. |
| `Referrer-Policy` | AUSENTE | Fuga de la URL de documentacion a terceros. |
| `Permissions-Policy` | AUSENTE | Sin restriccion de APIs de navegador. |
| `X-Powered-By: Express` | PRESENTE | Divulga la pila tecnologica. |
| `Access-Control-Allow-Origin: *` | PRESENTE | `app.enableCors()` sin restriccion de origen (`src/main.ts:11`). |

**Causa raiz:** `src/main.ts` no instancia `helmet` ni `compression`, y el repositorio no declara ninguno de los dos en `dependencies`.

**Correccion.** `app.use(helmet())` con CSP explicito (el de helmet rompe Swagger UI por su `unsafe-inline` en estilos; usar `styleSrc: ["'self'", "'unsafe-inline'"]`), y `app.enableCors({ origin: <lista explicita>, credentials: true })`.

## A.7 A-06 — Presupuesto de rendimiento de la interfaz: excedido 8,2x · CRITICA

**Medicion real** de los recursos de `/api/docs`:

| Activo | Bytes | KB | Presupuesto | Estado |
|---|---:|---:|---:|---|
| `swagger-ui-bundle.js` | 1 452 753 | **1 418,7** | 250 KB | FAIL **5,7x** |
| `swagger-ui-standalone-preset.js` | 230 293 | 224,9 | — | precargado |
| `swagger-ui-init.js` | 45 218 | 44,2 | 50 KB | OK |
| `swagger-ui.css` | 152 071 | **148,5** | 100 KB | FAIL 1,5x |
| `favicon-16/32.png` | 1 293 | 1,2 | — | OK |
| HTML shell | 3 126 | 3,1 | — | OK |
| **TOTAL** | **1 884 754** | **1 840,6** | **225 KB** | **FAIL 8,2x** |
| Total CSS | | 148,5 | 100 KB | FAIL |
| Total JS | | **1 687,8** | 200 KB | **FAIL 8,4x** |

**Compresion: ausente.** Verificado con peticion condicional:

```
bundle.js  sin  Accept-Encoding : 1 452 753 bytes (1 418,7 KB)
bundle.js  con  Accept-Encoding : 1 452 753 bytes (1 418,7 KB)   -> identico
```

`src/main.ts` no usa `compression()`. Con gzip, el bundle pasaria a ~380 KB y el total a ~500 KB.

**Latencia de carga (localhost, 5 muestras):** HTML shell 2–4 ms; `swagger-ui-bundle.js` 11–14 ms.

> **Lectura honesta de estas cifras.** En localhost la carga es inmediata y un Lighthouse ejecutado aqui daria nota alta. Eso **no invalida el hallazgo**: el presupuesto se define por tamano de transferencia, no por latencia en el servidor. 1,8 MB sin comprimir es un coste real en red movil, y se suma a A-03 (el movil descarga 1,8 MB, renderiza a 980 px y luego el usuario hace zoom). Los dos fallos se refuerzan mutuamente. La latencia local se incluye por completitud, con la advertencia de que no es representativa del usuario final.

**Correccion, por impacto sobre lineas de codigo:**
1. `app.use(compression())` — reduce 1,8 MB a ~500 KB. Mayor impacto por linea.
2. Servir la documentacion **solo fuera de produccion**. En produccion, publicar el contrato como artefacto estatico enlazado. Una documentacion interactiva de 1,8 MB no necesita estar expuesta en el despliegue publico.
3. Incorporar el presupuesto como comprobacion automatica de CI (apartado C.4).

## A.8 A-07 — Navegacion por teclado y contraste: pendiente de verificacion manual

No verificado. No hay infraestructura de pruebas ni herramienta `axe`/`pa11y` instalada, y los controles de Swagger UI (campos de cabecera, selector de servidor, boton "Try it out", desplegables de esquema) se renderizan en runtime. Se registra como **pendiente**, no como aprobado.

---

# PARTE B — El contrato como especificacion de interfaz

Los puntos siguientes no son hallazgos sobre codigo existente: son **criterios de aceptacion** para el front-end que consumira esta API, derivados de los estados que la API produce realmente y que hoy no estan documentados en ninguna parte.

## B.1 Inventario de estados de UI que la API produce

| # | Estado de UI | Origen en la API | Endpoint |
|---|---|---|---|
| E1 | Listado paginado con metadatos | `meta.{totalItems,itemCount,itemsPerPage,totalPages,currentPage}` | `GET /atracciones` |
| E2 | Busqueda con filtro y total | `metadata.{total_results,next_page}` | `POST /atracciones/search` |
| E3 | Resultado vacio | `metadata.total_results: 0` | ambos |
| E4 | **Filtro no soportado**: 200 con datos que NO corresponden a la consulta | `cities`, `dates`, `currency` se ignoran | `POST /atracciones/search` |
| E5 | Recurso no localizado | 404 RFC 7807 | todos |
| E6 | Duplicado | 409 `"Atraccion duplicada"` | `POST /atracciones` |
| E7 | Conflicto de idempotencia | 409 `"Idempotency-Key ya fue procesada"` | reservas |
| E8 | Cabecera obligatoria ausente | 400 `"Idempotency-Key header is required"` | reservas |
| E9 | Cabecera con formato invalido | 400 `"Invalid Idempotency-Key format"` | reservas |
| E10 | Sin cupos | `available_spots: 0` | availability |
| E11 | Atributo sin valor | `ratings: null`, `url: null` | detalle |
| E12 | **Sobreventa**: cupos agotados y reserva aceptada | `available_spots: 0` mientras `reserve` devuelve 201 | reservas |

> **E4 y E12 son tambien hallazgos de IHC, no solo de backend.** La UI no puede proteger al usuario de un servidor que devuelve 200 con resultados incorrectos (E4) ni de uno que vende mas de lo que tiene (E12). Son el argumento de por que corregir H-03 y C-03 es tambien un requisito de interaccion, no solo de negocio.

## B.2 Requisitos de accesibilidad derivados de los errores

**Problema de diseno heredado.** El `ValidationPipe` de NestJS devuelve `{ statusCode, message, error }` con `message` como **array de cadenas**, mientras que los errores de negocio usan un objeto RFC 7807 con `title` y `detail`. El cliente recibe **dos formatos de error distintos en la misma API**. La UI necesita dos reglas de renderizado, y cualquier regla mal aplicada en una de ellas deja al usuario sin mensaje: fallo de 3.3.1 en tiempo de ejecucion.

| Criterio | Nivel | Requisito derivado |
|---|---|---|
| **3.3.1** Error Identification | A | Cada 4xx/5xx se renderiza con `title` **y** `detail` como texto visible. El mensaje debe estar en el flujo del documento, no solo en color ni en un aviso efimero. |
| **3.3.2** Labels or Instructions | A | Los campos `required` del contrato llevan etiqueta persistente. El texto de formato (p. ej. "UUID v4") debe ser visible, no solo `placeholder`: el placeholder desaparece al escribir y no es etiqueta. |
| **3.3.3** Error Suggestion | AA | `detail` de 409 ofrece la accion correctiva. El 409 de idempotencia **ya lo hace bien**: incluye la clave en conflicto. Conservar ese patron en los demas. |
| **3.3.7** Redundant Entry | A | Al reenviar tras un 400, los datos capturados se conservan. Exige cache de estado de formulario en el cliente. |
| **3.3.8** Accessible Authentication | A | Si el flujo OAuth2 se materializa en la UI, no debe exigir transcribir un codigo mentalmente, ni usar CAPTCHA, ni *recognition* como unico factor. |
| **4.1.3** Status Messages | AA | "Reserva creada", "copiado al portapapeles" y los resultados de filtro se anuncian en `aria-live="polite"` sin mover el foco. Relevante para E8/E9: la validacion de `Idempotency-Key` ocurre en el guard, **antes** de alcanzar el controlador, asi que el cliente solo puede conocerla si el backend la emite como cuerpo de error legible. |

## B.3 Requisitos de accesibilidad derivados de los datos

| Criterio | Nivel | Requisito derivado |
|---|---|---|
| **1.1.1** Non-text Content | A | `photos[].url` requiere `alt` en el cliente. El contrato **no aporta texto alternativo**, por lo que el front-end debe generarlo a partir de `name` y `locations[0].city`, y marcar como decorativas las fotos duplicadas. Sin esto, un listado de 20 atracciones expone 20 imagenes sin descripcion. |
| **1.3.1** Info and Relationships | A | Estructurar el detalle de una atraccion como lista de definicion semantica, no como tabla visual: `price`, `duration`, `product_type`, `operator`, `locations`, `includes`, `ratings` y `url` son pares etiqueta-valor. |
| **1.4.1** Use of Color | A | `badges[]` (por ejemplo "best_seller") y `free_cancellation: true` no deben comunicarse solo por color o icono. Llevar texto. |
| **1.4.3** Contrast (Minimum) | AA | Los valores de `price.total` y `available_spots` se renderizan sobre fondos de tarjeta: verificar ratio de al menos 4,5:1 en los tres temas. |
| **1.4.11** Non-text Contrast | AA | Bordes de los inputs de filtro y de los botones: al menos 3:1 frente al fondo adyacente. |
| **2.5.8** Target Size (Minimum) | AA | **Nuevo en WCAG 2.2.** Los controles de filtro, paginacion y accion de reservar deben medir al menos 24x24 CSS px. Relevante porque el catalogo esta pensado para navegacion movil. |
| **3.2.2** On Input | A | No disparar peticiones ni reordenaciones automaticas al escribir en un filtro. El apartado B.4 exige debounce. |
| **4.1.2** Name, Role, Value | A | Los desplegables de `product_type`, `sort.by` y los toggles de idioma deben exponer rol, nombre y valor accesibles. `sort.by` es un enum en el contrato: no exponerlo como texto libre. |

## B.4 Diseno responsivo: mentalidad mobile-first y puntos de ruptura

**Estado: no implementable todavia.** No hay CSS de aplicacion. Se entrega como especificacion.

Los puntos de ruptura se eligen **mobile-first**, es decir, declarando primero el estilo base para el viewport mas estrecho y anadiendo progresivamente. En un catalogo turistico el patron de uso dominante es el movil en destino, lo que refuerza esa eleccion.

| # | Punto de ruptura | Dispositivo objetivo | Regla de composicion | Comportamiento esperado |
|---|---|---|---|---|
| BP1 | **base, 320–599 px** (sin `min-width`) | movil pequeno | una columna; ficha en lista compacta; filtros en `<details>` plegable; paginacion por botones y no por selector | sin desplazamiento horizontal a 320 px (1.4.10) |
| BP2 | **`min-width: 600px`** | movil grande / tableta vertical | dos columnas; filtros en panel lateral persistente; resultados a 2 columnas | el filtro permanece visible al desplazar los resultados |
| BP3 | **`min-width: 1024px`** | tableta horizontal / portatil | tres zonas: filtros (240px) + resultados (fluido) + resumen de precio y disponibilidad fijo | el resumen de disponibilidad no se desplaza al hacer scroll |
| BP4 | **`min-width: 1440px`** | escritorio | contenido centrado con ancho maximo; rejilla de 3–4 columnas | se evita la linea de texto de mas de 80 caracteres |

**Reglas transversales**
- Declarar los puntos de ruptura con `min-width` (mobile-first), nunca con `max-width`.
- Anadir `<meta name="viewport" content="width=device-width, initial-scale=1">` (tambien corrige A-03).
- Sin anchos fijos superiores a 320 px en ningun elemento. Las tablas de datos pasan a desplazamiento horizontal contenido en un contenedor con `tabindex="0"`, `role="region"` y nombre accesible, para que sea alcanzable por teclado (2.1.1) y no quede fuera del orden de tabulacion.
- Objetivos tactiles de al menos 44x44 px (recomendacion de plataforma, por encima del minimo 2.5.8 de 24x24).
- Respetar `prefers-reduced-motion` (2.3.3, AAA, y de coste nulo) y `prefers-color-scheme` para el contraste de 1.4.3.

**Nota sobre la financiacion del coste.** A-03 y esta especificacion comparten causa raiz: el shell de la pagina de documentacion lo genera una libreria de terceros y no admite un `meta viewport`. Resolverlo beneficia a las dos superficies a la vez.

## B.5 Principios Gestalt aplicables a este catalogo

**Estado: especificacion, no verificacion.** Se enumeran los principios que un catalogo de atracciones debe cumplir y como se comprueban.

| Principio | Aplicacion concreta | Criterio de comprobacion |
|---|---|---|
| **Ley de Proximidad** | Agrupar cada atomo de informacion (precio, duracion, valoracion) en un bloque contiguo, separado del siguiente por mas espacio que el interno. No intercalar metadatos de la atraccion A con los de la B. | Revision de mockup: el espacio entre tarjetas es al menos el doble del espacio entre campos de una tarjeta. |
| **Ley de Common Fate** | Reservar una transicion de movimiento unica para el exito de una reserva, de modo que movimiento y significado queden asociados. | La reserva creada es el unico elemento con animacion. Si el resto de la interfaz es estatica, la asociacion se refuerza. |
| **Ley de Semejanza** | Estilo identico para elementos de la misma clase: todos los botones primarios con la misma forma; todas las insignias con la misma pastilla. | Auditoria de tokens de diseno; ningun componente de accion varia de otro sin motivo semantico. |
| **Ley de Figura y Fondo** | El contenido debe destacar del fondo: ficha blanca sobre fondo gris, no texto gris claro sobre blanco. Vinculado a 1.4.3. | Medicion automatica de contraste con axe. |
| **Ley de Closure** | El estado "sin cupos" (E10) debe leerse como bloque cerrado y comprensible, no como un campo vacio. Icono mas texto "Agotado", no solo un `0`. | El usuario identifica el agotamiento sin leer texto. |
| **Espacio en blanco** | El catalogo tiene 16 campos por ficha (`AtraccionResponseDto`). Mostrarlos todos a la vez satura la memoria de trabajo. **Recomendacion: mostrar 5 o 6 en la ficha y el resto bajo "ver detalle"**, usando el espacio en blanco como mecanismo de jerarquia. | Revision de usabilidad: el usuario identifica nombre, precio, valoracion y disponibilidad sin desplazar. |
| **Orden de lectura (escanabilidad)** | Titulo de ficha, imagen, nombre, precio, valoracion y accion primaria. Este orden debe reflejarse tanto visualmente como en el orden del DOM, para que coincidan con la lectura de lector de pantalla. | El orden del DOM coincide con el orden visual; incumplirlo rompe 1.3.2 Meaningful Sequence. |

**Relacion Gestalt–WCAG.** La Ley de Proximidad y el espacio en blanco no son solo estetica: reducen la carga cognitiva y, al ordenar el DOM en el mismo orden visual, hacen posible el cumplimiento de 1.3.2 (Meaningful Sequence, A). Tratar Gestalt y accesibilidad como el mismo trabajo, y no como dos, es lo que evita la division habitual entre "diseno" y "accesibilidad".

---

# PARTE C — Criterios de proceso

## C.1 Lo que esta auditoria todavia NO puede afirmar

Se declara para evitar falsa confianza:

- **Reflow real a 320 px** (1.4.10): no verificado en navegador. Requiere Playwright o Chrome DevTools con el DOM construido.
- **Contraste** (1.4.3, 1.4.11): no medido. Requiere axe-core sobre la pagina renderizada.
- **Navegacion solo por teclado** (2.1.1, 2.1.2): no verificada. Requiere recorrido manual o automatizado.
- **Arbol de accesibilidad en runtime** (1.3.1, 2.4.1): A-04 se apoya en el HTML servido, no en el DOM montado.
- **Zoom al 400 %** (1.4.4 Resize Text, 1.4.10): no verificados.
- **Todos los criterios de la Parte B**: no existen todavia porque no hay interfaz.
- **Pruebas de usabilidad**: no se han realizado. El repositorio no tiene instrumentacion de analitica, y no procede inventar resultados de pruebas con usuarios que no se han ejecutado. Ver las propuestas de mejora continua del [informe 04](04-bitacora-revision-tecnica.md).

## C.2 Matriz de verificacion automatizable

Cada criterio debe pasar de manual a automatizado con una herramienta concreta.

| Criterio | Herramienta | Integracion | Bloquea entrega |
|---|---|---|---|
| 1.1.1, 1.4.3, 1.4.11, 2.5.8 | axe-core / @axe-core/playwright | `expect(results).toHaveNoViolations()` | si |
| 1.3.1, 2.4.1, 4.1.2 | axe-core mas revision del arbol | `page.accessibility.snapshot()` | si |
| 3.1.1 | asercion sobre `document.documentElement.lang` | `expect(lang).toBe('es')` | si |
| 2.4.2 | asercion sobre `document.title` | `expect(title).toContain('Atracciones')` | si |
| 1.4.10 | Playwright con viewport 320x640 | `expect(scrollWidth).toBeLessThanOrEqual(320)` | si |
| 1.4.4 | Playwright con zoom al 400 % | asercion de ausencia de desplazamiento horizontal | si |
| Presupuesto de recursos | Lighthouse CI | `assert size <= 225KB` | si |
| A-05 cabeceras | test de contrato HTTP | asercion de presencia de CSP, HSTS y nosniff | si |

## C.3 Procedimiento de evaluacion manual (una sesion, ~2 h)

Cuando exista front-end, esta sesion es obligatoria y no automatizable:

1. Recorrido **solo con teclado** de la ficha de detalle y del flujo de reserva, sin tocar el raton. Registrar cada trampa de foco y cada operacion no alcanzable.
2. Recorrido con **NVDA** (Windows) o **VoiceOver** (macOS/iOS): verificar que las etiquetas de los campos de precio, disponibilidad e idioma son correctas; que el error 409 se anuncia; que el resultado de un filtro se anuncia.
3. **Lighthouse** en modo movil emulado: auditar las cuatro categorias (rendimiento, accesibilidad, buenas practicas, SEO).
4. **Escala de grises**: desaturar la interfaz y comprobar que la informacion sigue siendo identificable. Valida 1.4.1 Use of Color.
5. Zoom al 200 % y al 400 %: comprobar Reflow.
6. Contraste con axe sobre las tres variantes de color.

## C.4 Presupuesto de rendimiento como contrato de construccion

Los limites deben verificarse en CI, no confiar en la revision:

| Activo | Limite | Valor actual |
|---|---|---|
| CSS total | **<= 100 KB** sin comprimir | 148,5 KB |
| JS total | **<= 200 KB** sin comprimir | 1 687,8 KB |
| JS total con `compression()` activo | <= 200 KB transferidos | sin medir (compresion ausente) |
| Transferencia total inicial | <= 225 KB | 1 840,6 KB |
| LCP | <= 2,5 s (movil emulado, CPU 4x) | sin medir |
| CLS | <= 0,1 | sin medir |
| INP | <= 200 ms | sin medir |
| Imagen de ficha | <= 100 KB en WebP o AVIF | sin gobernar |

**Nota sobre la ultima fila.** El contrato acepta `photos[].url` sin restriccion de tamano ni de formato. Una ficha con 5 fotos de 2 MB son 10 MB por pantalla, y ninguna regla del lado del cliente lo evita. Anadir al contrato `photos[].{width,height,srcset}` no es solo una mejora de rendimiento: es lo que permite reservar espacio y cumplir 1.4.10 y el umbral de CLS.

## C.5 Trazabilidad de hallazgos de IHC

| ID | Severidad | Hallazgo | Criterio WCAG | Evidencia |
|---|---|---|---|---|
| A-01 | Critica | `lang="en"` en pagina en espanol | 3.1.1 (A) | HTML servido |
| A-02 | Media | Titulo generico | 2.4.2 (A) | `<title>Swagger UI</title>` |
| A-03 | Critica | Sin `meta viewport`; Reflow imposible en movil | 1.4.10 (AA) | 0 ocurrencias en 3 126 B |
| A-04 | Critica | Sin bloques de derivacion ni landmarks | 2.4.1 (A), 1.3.1 (A) | `role=`/`aria-*`/`<main>` = 0 |
| A-05 | Critica | 6 cabeceras de seguridad ausentes; CORS abierto | — (seguridad) | `curl -D -` |
| A-06 | Critica | Presupuesto excedido 8,2x; sin compresion | — (rendimiento) | 1 884 754 B medidos |
| A-07 | Pendiente | Contraste y teclado sin verificar | 1.4.3, 2.1.1 | sin instrumentacion |
