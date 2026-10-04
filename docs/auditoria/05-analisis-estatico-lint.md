# Informe 05 — Analisis Estatico y Deuda Tecnica

**Alcance:** `src/modules/atracciones/**` y `src/common/**` (27 archivos, 2 056 de las 3 742 lineas del repositorio)
**Fecha:** 2026-09-30
**Commit:** `0cceeb5`
**Metodo:** ESLint **no esta instalado ni configurado** en el repositorio. Se aplico un analisis estatico manual sobre las reglas que un perfil `typescript-eslint:recommended` + `plugin:@typescript-eslint/recommended` activaria, mas reglas de rendimiento propias de ORM.

---

## 1. Estado del linting en el repositorio

### 1.1 El script de lint esta roto

`package.json:15` declara:

```json
"lint": "eslint \"{src,apps,libs,test}/**/*.ts\" --fix"
```

Verificado en el entorno:

| Comprobacion | Resultado |
|---|---|
| Fichero `.eslintrc*` en la raiz | **No existe** |
| Fichero `eslint.config.*` (ESLint 9 flat config) | **No existe** |
| `.prettierrc` / `.prettierrc.json` | **No existe** |
| `eslint` en `devDependencies` | **No** |
| `eslint` instalado en `node_modules` | **No** |
| Directorio `test/` referenciado por el script | **No existe** |

**`npm run lint` falla.** No es un script que produzca advertencias: es un script que no se ejecuta. Cualquier pipeline de CI que lo invoque falla en el primer paso, o —peor— se ha estado ignorando en silencio porque nunca se ejecuto.

Lo mismo ocurre con **`npm run format`** (`package.json:10`): invoca `prettier`, que tampoco esta en `devDependencies`.

### 1.2 La paradoja de `tsc --noEmit`

`npx tsc --noEmit` devuelve **0 errores** sobre 2 056 lineas. Es un resultado notable y conviene entender que **no** significa que el codigo sea correcto:

- TypeScript comprueba la coherencia de tipos, no la correccion del diseno.
- Un `tsc` limpio es compatible con un patron N+1, con `eager: true` en siete relaciones, con una transaction ausente y con un contrato que declara endpoints inexistentes. **Todos los hallazgos criticos de esta auditoria son invisibles para el compilador.**
- Los unicos hallazgos que `tsc` detectaria aqui son los que **nadie** ha escrito: `@typescript-eslint/no-unused-vars` no viene activado por el compilador.

**Conclusion.** La ausencia de errores de compilacion es una condicion necesaria, no suficiente. Debe acompanarse de un linter real; hoy no existe ninguno.

---

## 2. Inventario de codigo

| Metrica | Scope auditado | Repositorio completo |
|---|---:|---:|
| Archivos `.ts` | 27 | 52 |
| Lineas | 2 056 | 3 742 |
| Archivos > 300 lineas | 2 | 4 |
| Errores de compilacion | **0** | **0** |
| Suites de pruebas | **0** | **0** |

### 2.1 Los dos archivos problematicos

| Archivo | Lineas | Observacion |
|---|---:|---|
| `atracciones.service.ts` | **745** | 6 repositorios inyectados; casos de uso, acceso a datos, mapeo y utilidades en una sola clase. Viola SRP |
| `atracciones.controller.ts` | 328 | 13 handlers, 328 lineas. Aceptable, aunque los bloques de comentarios decorativos consumen ~60 lineas |

**El archivo mas grave del repositorio por concentracion de responsabilidades** es `atracciones.service.ts`, con 745 lineas y 4 roles distintos. Contraste util: `AtraccionResponseDto` son 64 lineas y una sola responsabilidad.

---

## 3. Hallazgos por regla ESLint

### 3.1 `@typescript-eslint/no-unused-vars` — 5 casos (error)

Analisis de cada `import` frente al uso real de su simbolo en el cuerpo del archivo.

| Archivo | Simbolo importado | Linea | Observacion |
|---|---|---|---|
| `atracciones.service.ts` | `EntityManager` | **7** | **Hallazgo con consecuencias, no solo estetico** (ver §3.2) |
| `create-atraccion.dto.ts` | `IsUrl` | 2 | Importado y nunca usado |
| `create-atraccion.dto.ts` | `IsPositive` | 2 | Importado y nunca usado |
| `create-atraccion.dto.ts` | `Min` | 2 | Importado y nunca usado |
| `create-atraccion.dto.ts` | `IsNumber` | 2 | Importado y nunca usado |

`create-atraccion.dto.ts:2` importa 12 simbolos de `class-validator`; usa 8. Los 4 restantes son ruido que un linter habria detectado en el primer commit.

### 3.2 El coste oculto de `EntityManager` sin usar

```ts
// atracciones.service.ts:7
import { Repository, In, EntityManager } from 'typeorm';
```

`EntityManager` no se usa **en ninguna parte del archivo**. Y sin embargo el archivo contiene el patron mas peligroso del repositorio:

```ts
// atracciones.service.ts:271-274  (replace)
const manager = this.atraccionRepository.manager;
await manager.delete(AtraccionLocation, { atraccion_id: id });
await manager.delete(AtraccionPhoto,      { atraccion_id: id });
await manager.delete(AtraccionInclude,    { atraccion_id: id });
```

El autor **importo `EntityManager` con la intencion de transaccionar** y luego no lo hizo. Esto convierte un hallazgo de rendimiento en un hallazgo de integridad de datos: los borrados se ejecutan de forma independiente y un fallo intermedio deja la atraccion sin ubicaciones, fotos ni includes, sin posibilidad de rollback (hallazgo H-05 del informe 01).

> **Leccion de proceso.** Este es el argumento mas claro del informe a favor del linter: una importacion sin usar no es solo deuda. Es la huella de una intencion de diseno que se quedo a medio camino, y senala exactamente donde esta el defecto de integridad de datos. El coste de un `no-unused-vars` activo es una linea de codigo; el coste de no tenerlo es una perdida de datos en produccion.

### 3.3 `@typescript-eslint/no-explicit-any` — 4 casos (advertencia)

En el scope auditado (`atracciones` + `common`):

| Ubicacion | Codigo | Consecuencia |
|---|---|---|
| `atracciones.service.ts:166` | `product_type: createDto.product_type as any,` | Anula la verificacion del enum en la creacion |
| `atracciones.service.ts:287` | `exists.product_type = dto.product_type as any;` | Idem en el reemplazo |
| `atracciones.service.ts:367` | `if (dto.product_type !== undefined) atraccion.product_type = dto.product_type as any;` | Idem en la actualizacion |
| `atraccion-response.dto.ts:63` | `_links?: any;` | Tipo `any` en un DTO que alimenta el contrato OpenAPI |

**Contexto que no debe perderse.** En el repositorio completo hay **60 ocurrencias** de `any`, pero **56 estan en `alojamientos`, `autos` y `vuelos`** — modulos no registrados en `app.module.ts` y cuyos servicios son esqueletos. La calidad del codigo del modulo `atracciones` es netamente superior: 4 frente a 56. Esto confirma que el modulo activo es el trabajo real, y que los otros tres son andamiaje de plantilla.

**Sobre los tres `as any` de `product_type`.** Son un sintoma de la duplicacion de enum (§4): hay **dos** declaraciones de `ProductType` —`entities/atraccion.entity.ts:25` y `dto/create-atraccion.dto.ts:6`— con la misma forma de valores. TypeScript los considera tipos **incompatibles** (son tipos nominalmente distintos), asi que el servicio necesita `as any` para asignar uno al otro. Los tres `as any` **desaparecen** al unificar el enum en un unico modulo compartido. Es decir: eliminar 3 `any` y 1 duplicacion son la misma tarea.

### 3.4 Otras reglas — hallazgos adicionales

| Regla | Ubicacion | Hallazgo |
|---|---|---|
| `no-floating-promises` | `create-atraccion.dto.ts:2` | La linea de imports excede 200 caracteres; falla el formateo de Prettier |
| `max-lines` / complejidad | `atracciones.service.ts` | 745 lineas, 4 responsabilidades. Justifica `max-lines: 500` y la extraccion descrita en §5 |
| `no-else-return`, `prefer-const` | — | Sin hallazgos. El codigo es disciplinado en este aspecto |
| `eqeqeq` | — | Sin hallazgos; no se usa `==` en ningun punto |
| `explicit-function-return-type` | `atracciones.service.ts` | 6 metodos sin tipo de retorno explicito (`search`, `getDetailsBatch`, `create`, `findAll`, `findOne`, `update`) |
| `class-methods-use-this` | `toResponse`, `toReservationResponse`, `generateRequestId` | Metodos que no usan `this`; candidatos a funciones puras |
| `no-eval`, `no-implied-eval` | — | Sin hallazgos ✅ |

---

## 4. Hallazgos de diseno que un linter no detecta

Estos requieren analisis humano. Son los mas costosos de corregir.

### 4.1 Enums duplicados

| Enum | Declaraciones | Consecuencia |
|---|---|---|
| `ProductType` | `entities/atraccion.entity.ts:25` **y** `dto/create-atraccion.dto.ts:6` | Dos fuentes de verdad. Exige los 3 `as any` de §3.3. Si se añade un tipo de producto en un solo sitio, el sistema acepta un valor que la base de datos **rechaza con un 500** |
| `ReservationStatus` | `entities/reservation.entity.ts:14` **y** `dto/reservation.dto.ts:30` | Mismo problema. El enum de la entidad incluye `PENDING` como valor por defecto; el del DTO es una copia de mantenimiento manual |
| `ReservationStatus` (contrato) | `atracciones-openapi.yaml:859` | Tercera declaracion, en el contrato: `enum: [CONFIRMED, PENDING, CANCELLED]` |

**Tres declaraciones de `ReservationStatus` y dos de `ProductType`**, mantenidas a mano y sin ninguna verificacion de que coincidan. Correccion: un unico fichero `src/modules/atracciones/domain/enums.ts` exportado por las tres capas (entidad, DTO y, por generacion, el contrato).

### 4.2 Logica de negocio en el mapper

`toResponse()` (`atracciones.service.ts:663-728`) tiene 65 lineas y construye un objeto literal. No es un mapper: **reconstruye la estructura del contrato a mano**, incluyendo `_links` con el prefijo `/api/v1` hardcodeado (lineas 707-725). Si cambia `setGlobalPrefix` en `main.ts`, todos los enlaces del catalogo quedan rotos y nada lo detecta.

### 4.3 Anti-patron: validacion declarativa ignorada

`SearchAtraccionesDto` declara `cities` y `dates` como **obligatorios** con decoradores `@IsArray`/`@ValidateNested`, y `search()` no los usa. El DTO promises una validacion que el servicio incumple. Es el hallazgo H-03 verificado empiricamente: el servidor devuelve 200 con resultados que no corresponden a la consulta.

Es un patron mas profundo que un bug: **los DTOs se escriben a partir del contrato, y el servicio se escribe a partir de los DTOs, pero nadie verifica que el servicio implemente el contrato.** De ahi las 11 divergencias del informe 03.

### 4.4 Anti-patron: borrado_y_rescritura sin transaccion

`replace()` y `update()` implementan el mismo patron de "borra las colecciones y recrealas" en tres bloques identicos, sin transaccion (H-05). El bloque aparece **6 veces** en el archivo (`replace` 3 veces, `update` 3 veces). Duplicacion que ademas multiplica el riesgo: cada copia es un lugar donde puede olvidarse la transaccion.

### 4.5 Anti-patron: `await` en bucle

Tres ocurrencias, en `atracciones.service.ts`:

| Linea | Metodo | Consecuencia |
|---:|---|---|
| 622 | `findOrCreateCategories` | 2 viajes de red por elemento, en serie |
| 635 | `findOrCreateBadges` | idem |
| 648 | `findOrCreateLanguages` | idem |

Medido: la latencia de `POST /atracciones` pasa de 164 ms (2 categorias) a **2 639 ms** (30 categorias) — un factor **×16** que no puede explicarse por coste de CPU. Detalle y correccion en el informe 01 §3.3.

### 4.6 `CommonModule` vacio

```ts
// src/common/common.module.ts
@Module({ imports: [], providers: [], exports: [] })
export class CommonModule {}
```

Un modulo sin providers ni exports, importado tanto por `app.module.ts` como por `atracciones.module.ts`. `IdempotencyKeyGuard` **no esta registrado** en ningun sitio: funciona unicamente porque NestJS puede instanciarlo al vuelo al no tener dependencias inyectables. Es una fragilidad silenciosa: en cuanto el guard necesite un servicio (una tabla de idempotencia, un reloj, un logger), dejara de funcionar sin avisar.

**Correccion:** declarar el guard en `providers` y exportarlo desde `CommonModule`, o marcar `CommonModule` como `@Global()`.

### 4.7 Numeros magicos

| Valor | Ubicacion | Deberia ser |
|---|---|---|
| `100` (capacidad total) | `atracciones.service.ts:469` | Columna `capacity` en la entidad, o tabla de cupos por fecha |
| `['09:00','10:00',...]` | `atracciones.service.ts:475` | Configuracion del producto; hoy la disponibilidad por franja **no existe** |
| `'/api/v1/'` | `atracciones.service.ts:707, 711, 715, 719, 723` | Constante derivada de `setGlobalPrefix` |

La capacidad hardcodeada es la causa directa del hallazgo critico C-03: el sistema no tiene un concepto de cupo, tiene un numero.

---

## 5. Plan de refactorizacion

Ordenado por relacion entre esfuerzo e impacto. Cada paso es independiente de los demas.

### Paso 1 — Hacer funcional el linter (30 min)

Sin esto, nada de lo siguiente se mantiene.

```bash
npm i -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin
```

`.eslintrc.json` minimo recomendado:

```jsonc
{
  "parser": "@typescript-eslint/parser",
  "parserOptions": { "project": "./tsconfig.json" },
  "plugins": ["@typescript-eslint"],
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking"
  ],
  "rules": {
    "@typescript-eslint/no-unused-vars": "error",
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/await-thenable": "error",
    "eqeqeq": ["error", "smart"],
    "max-lines": ["warn", { "max": 500, "skipBlankLines": true }]
  }
}
```

Y cambiar `"lint": "eslint \"src/**/*.ts\""` (sin `--fix` en el primer commit: el auto-fix masivo ensucia el historial).

### Paso 2 — Reglas de ORM (30 min)

Las reglas que habrian detectado los hallazgos de rendimiento de este repositorio. No vienen por defecto en ningun preset; hay que escribirlas.

| Regla | Detecta |
|---|---|
| `no-restricted-syntax` sobre `eager: true` | Los 7 de `atraccion.entity.ts` (H-01) |
| `no-restricted-syntax` sobre `await` dentro de `for...of` | Las 3 de los helpers (H-02) |
| `require-await` en funciones que no esperan nada | Codigo asincrono inutil |

```jsonc
{
  "rules": {
    "no-restricted-syntax": [
      "error",
      { "selector": "CallExpression > ObjectLiteral > Property[key.name='eager'][value.value=true]",
        "message": "Prohibido eager: true. Carga las relaciones explicitamente por caso de uso (H-01)." },
      { "selector": "ForOfStatement > BlockStatement > ExpressionStatement > AwaitExpression",
        "message": "await dentro de for: patron N+1. Resuelve en lote con ANY + INSERT (H-02)." }
    ]
  }
}
```

### Paso 3 — Unificar los enums (1 h)

`src/modules/atracciones/domain/enums.ts` con `ProductType` y `ReservationStatus`. Importar desde entidad, DTO y servicio. **Elimina 3 `as any`, 2 declaraciones duplicadas y el riesgo de divergencia de enums.** Ademas, generar el `enum` del contrato OpenAPI a partir de la misma fuente, o validar con Spectral que coincidan.

### Paso 4 — Extraer el mapper (2 h)

`src/modules/atracciones/presenters/atraccion.presenter.ts` con `toResponse` y `toReservationResponse`, tipados contra `AtraccionResponseDto`. Beneficios:
- El servicio baja de 745 a ~600 lineas y recupera una responsabilidad.
- El tipo de retorno pasa a estar **verificado por el compilador**: si el mapper deja de emitir `_links` o cambia una clave, el error aparece en `tsc`, no en produccion.
- Los `_links` dejan de hardcodear `/api/v1` (usar la constante del prefijo global).

### Paso 5 — Extraer la normalizacion de catalogos (1 h)

`src/modules/atracciones/repositories/catalog.repository.ts` con un metodo por catalogo que resuelva en lote (`ANY` + `INSERT ... RETURNING`). **Elimina el patron N+1, las 3 reglas de lint que lo prohíben y la mayor causa de latencia del servicio.** Es el cambio de mejor relacion impacto/esfuerzo de toda la lista.

### Paso 6 — Transacciones (3 h)

`this.atraccionRepository.manager.transaction(async (em) => { ... })` en `create`, `replace`, `update`, `reserve` y `cancelReservation`. Resuelve H-05 y C-04 en el mismo trabajo, y da uso real al `EntityManager` que ya esta importado.

### Paso 7 — Retirar `eager: true` y reescribir `findAll` (3 h)

Eliminar los 7 `eager`. `findAll` pasa a `QueryBuilder` con `leftJoinAndSelect`, replicando el rendimiento de `search` (3 ms frente a 1 049 ms medidos).

### Paso 8 — `CommonModule` y guards (30 min)

Registrar `IdempotencyKeyGuard` en `providers` y `exports` de `CommonModule`. Resuelve la fragilidad de §4.6.

### Paso 9 — Suite de pruebas (1 semana)

Sin ella, los pasos 1–8 no se pueden proteger de regresiones. Cobertura minima imprescindible, en este orden:
1. Idempotencia: misma clave dos veces → mismo resultado, nunca 500.
2. Sobreventa: N reservas que superan la capacidad → exactamente `capacity` aceptadas.
3. Transaccionalidad: fallo intermedio en `replace` → estado inalterado.
4. Conformance: el `openapi.json` generado coincide con `contracts/atracciones-openapi.yaml`.
5. Conformance de enums: los enums del DTO, la entidad y el YAML son identicos.

---

## 6. Resumen de la deuda tecnica

| Categoria | Cantidad | Coste estimado |
|---|---:|---|
| Importaciones muertas | 5 | 30 min |
| `any` explicitos (scope auditado) | 4 | 1 h (resuelto por unificar enums) |
| Enums duplicados | 2 enums, 5 declaraciones | 1 h |
| Bloques de borrado+rescritura duplicados | 6 | 2 h (resuelto con transacciones) |
| `await` en bucle | 3 | 2 h |
| Metodos sin tipo de retorno explicito | 6 | 30 min |
| Metodos que no usan `this` | 3 | 30 min |
| Modulos esqueleto (`alojamientos`, `autos`, `vuelos`) | 3 | Fuera de alcance del modulo activo |
| **Total del scope auditado** | | **≈ 2 dias** |

**Prioridad por valor, no por volumen.** Los 5 simbolos sin usar y los 4 `any` son la parte visible y mediocre de la deuda. La parte cara son los 6 bloques no transaccionales, los 3 bucles con `await` y los 7 `eager: true` — ninguno de los cuales es un aviso del linter. Por eso el Paso 2 (reglas de ORM) tiene mas valor que los pasos 1 y 3 juntos: no limpia lo que ya esta sucio, pero impide que vuelva a aparecer lo que hoy cuesta 2 639 ms.
