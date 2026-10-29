import { MigrationInterface, QueryRunner } from "typeorm";
import { createHash } from "crypto";

/**
 * Pasa los datos del modelo monolítico (esquema public) al modelo por microservicios y deja
 * las tablas viejas en el esquema `legacy` (no se borran).
 *
 * Solo corre si existen las tablas viejas y ms_catalog.atraccion está vacía, así que es seguro
 * en bases nuevas y en Supabase (que solo tiene catálogo, admin y contrato).
 *
 * Reglas:
 *  - Se conservan los UUID públicos de atracciones, categorías, usuarios y reservas.
 *  - Reseñas: una por usuario y atracción (se queda la más reciente).
 *  - Reservas sin detalle (sin atracción) no se migran: no tienen turno ni línea de orden.
 *  - Cada reserva genera orden, detalle por tipo de pasajero, reserva, titular, pago,
 *    reembolso (si se canceló pagada) y factura, y actualiza el cupo reservado del turno.
 */
export class MigrarDatosLegacy1830000000001 implements MigrationInterface {
  name = "MigrarDatosLegacy1830000000001";

  public async up(q: QueryRunner): Promise<void> {
    const [{ existe }] = await q.query(
      `SELECT to_regclass('public.atracciones') IS NOT NULL AS existe`,
    );
    if (!existe) return;
    const [{ n }] = await q.query(
      `SELECT count(*)::int AS n FROM ms_catalog.atraccion`,
    );
    if (n > 0) return;

    const cat = await migrarCategorias(q);
    const atr = await migrarAtracciones(q, cat);
    const usu = await migrarUsuarios(q);
    await migrarResenasYFavoritos(q, atr, usu);
    await migrarContrato(q);
    await migrarReservas(q, atr, usu);
    await moverLegacy(q);
  }

  public async down(q: QueryRunner): Promise<void> {
    for (const t of TABLAS_LEGACY) {
      await q.query(`
        DO $$ BEGIN
          IF to_regclass('legacy.${t}') IS NOT NULL THEN
            ALTER TABLE legacy.${t} SET SCHEMA public;
          END IF;
        END $$`);
    }
  }
}

const TABLAS_LEGACY = [
  "outbox_eventos",
  "facturas",
  "detalles_reserva",
  "reservas",
  "resenas",
  "wishlists",
  "clientes",
  "usuarios",
  "contrato_promociones",
  "atracciones",
  "categorias",
];

const RE_CORREO = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const RE_TELEFONO = /^\+?[0-9]{7,15}$/;
const RE_DOCUMENTO = /^[A-Z0-9]{5,20}$/;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const FACTORES = { ADULTO: 1, NINO: 0.5, MAYOR: 0.7, INFANTE: 0 } as const;

type Mapa = Map<string, number>;

interface DatosAtraccion {
  ciudad: string;
  lat: number;
  lon: number;
  categoria?: string;
  tipo?: string;
}

// Ciudad real, coordenadas aproximadas, categoría y tipo de cada atracción conocida.
const ATRACCIONES: Record<string, DatosAtraccion> = {
  "4be0e209-2203-47b3-98b1-0f4d13414c24": {
    ciudad: "Cuenca",
    lat: -2.8975,
    lon: -79.0045,
    categoria: "centros-historicos",
  },
  "02c6d32b-5368-4cc6-b2bc-1fd7d426c8ce": {
    ciudad: "Cuenca",
    lat: -2.7833,
    lon: -79.2167,
    categoria: "volcanes-montana",
  },
  "22a57dd0-17c7-4f50-911f-5b25b9cbd248": {
    ciudad: "Cuenca",
    lat: -2.7833,
    lon: -79.2167,
    categoria: "volcanes-montana",
  },
  "5d96fd2a-a715-4e0b-a761-bb6a3e0124ce": {
    ciudad: "Cuenca",
    lat: -2.92,
    lon: -79.0047,
    categoria: "tours-experiencias",
  },
  "04d1c744-a501-4f6d-a417-c8baf3e7d720": {
    ciudad: "Cañar",
    lat: -2.545,
    lon: -78.875,
    categoria: "cultura-museos",
  },
  "13d65765-c94f-4af8-bc29-305f70088251": {
    ciudad: "Puerto Ayora",
    lat: -1.2833,
    lon: -90.4333,
    categoria: "islas-vida-marina",
  },
  "3e88b24e-e17e-4632-b55f-459767e14d7a": {
    ciudad: "Puerto Ayora",
    lat: -1.225,
    lon: -90.422,
    categoria: "islas-vida-marina",
  },
  "fc8c6835-9df1-405d-a53a-3e700d59a10c": {
    ciudad: "Puerto Ayora",
    lat: -0.2833,
    lon: -90.55,
    categoria: "islas-vida-marina",
  },
  "b5b1658b-2981-42fc-b409-c8211193f102": {
    ciudad: "Puerto Ayora",
    lat: -0.757,
    lon: -90.306,
    categoria: "islas-vida-marina",
  },
  "74003b88-5af2-4f10-a1f5-b9ebde89137d": {
    ciudad: "Puerto Ayora",
    lat: -0.61,
    lon: -90.6667,
    categoria: "islas-vida-marina",
  },
  "2e7f6a55-2811-402d-a639-6fbcf3054d8d": {
    ciudad: "Puerto Ayora",
    lat: -0.766,
    lon: -90.336,
    categoria: "islas-vida-marina",
  },
  "103de01a-9c9a-4ed6-bac1-5115fe98f05b": {
    ciudad: "Guayaquil",
    lat: -2.1767,
    lon: -80.0175,
    categoria: "naturaleza-aventura",
  },
  "b58b0a7f-dcb0-4631-a55c-e7c83d432704": {
    ciudad: "Guayaquil",
    lat: -2.1844,
    lon: -79.8758,
    categoria: "centros-historicos",
  },
  "9503cf5d-4134-460b-8378-06fe594576f1": {
    ciudad: "Guayaquil",
    lat: -2.196,
    lon: -79.88,
    categoria: "tours-experiencias",
  },
  "08b77173-05e8-477e-aafd-761882b9154f": {
    ciudad: "Guayaquil",
    lat: -2.196,
    lon: -79.88,
    categoria: "tours-experiencias",
  },
  "8f555159-c413-48d3-b7a2-7860f71bea8a": {
    ciudad: "Guayaquil",
    lat: -2.2167,
    lon: -79.8667,
    categoria: "naturaleza-aventura",
  },
  "b07d0db9-d5aa-420f-aab9-a0edb0c8adcf": {
    ciudad: "Guayaquil",
    lat: -2.193,
    lon: -79.878,
    categoria: "centros-historicos",
  },
  "44260589-634d-4971-ade8-4c8068ede204": {
    ciudad: "Santa Elena",
    lat: -1.8264,
    lon: -80.7533,
    categoria: "islas-vida-marina",
  },
  "7afbc57e-a8f5-423d-abed-1846891238b3": {
    ciudad: "Guayaquil",
    lat: -2.1475,
    lon: -79.865,
    categoria: "cultura-museos",
  },
  "1c94a20c-8e83-43c4-ad4f-543054b6a694": {
    ciudad: "Puerto López",
    lat: -1.5583,
    lon: -80.8111,
    categoria: "islas-vida-marina",
  },
  "019daec7-33df-4d59-b17c-f204f7f3b14e": {
    ciudad: "Salinas",
    lat: -2.189,
    lon: -81.009,
    categoria: "islas-vida-marina",
  },
  "06ac13ab-8a3c-424c-b2ee-3bc74d5f5960": {
    ciudad: "Manta",
    lat: -0.942,
    lon: -80.731,
    categoria: "islas-vida-marina",
  },
  "9eefe01e-a540-4024-a222-f39e3bf5596d": {
    ciudad: "Baños de Agua Santa",
    lat: -1.3964,
    lon: -78.4247,
    categoria: "naturaleza-aventura",
  },
  "1a0281ba-2caa-4cc4-8b11-81a63ccdced0": {
    ciudad: "Quito",
    lat: -0.2147,
    lon: -78.5072,
    categoria: "cultura-museos",
    tipo: "ADMISSION",
  },
  "92ea1662-5972-4f73-9724-d84a87e6d93b": {
    ciudad: "Quito",
    lat: -0.2201,
    lon: -78.5123,
    categoria: "centros-historicos",
  },
  "8a2057f8-dd08-4c41-8ef3-cec3e2b6432e": {
    ciudad: "Quito",
    lat: -0.0022,
    lon: -78.4558,
    categoria: "cultura-museos",
  },
  "7e11ff79-d7d4-4e1e-a1ba-79be6466097d": {
    ciudad: "Latacunga",
    lat: -0.855,
    lon: -78.902,
    categoria: "volcanes-montana",
  },
  "76025804-d058-4c69-a78b-91e903f6030d": {
    ciudad: "Mindo",
    lat: -0.05,
    lon: -78.775,
    categoria: "naturaleza-aventura",
  },
  "420eaca1-88e9-4c98-a665-30947d2df6e6": {
    ciudad: "Quito",
    lat: -0.229,
    lon: -78.518,
    categoria: "tours-experiencias",
  },
  "d767334e-f187-4aa7-b38a-f6728d851806": {
    ciudad: "Otavalo",
    lat: 0.305,
    lon: -78.364,
    categoria: "naturaleza-aventura",
  },
  "c074c4c0-9c55-4d5a-9a07-2fd0cca37b48": {
    ciudad: "Latacunga",
    lat: -0.68,
    lon: -78.437,
    categoria: "volcanes-montana",
  },
  "679d73e2-d1a2-4c39-b81f-2a47f5642748": {
    ciudad: "Puerto Francisco de Orellana",
    lat: -0.95,
    lon: -76.05,
    categoria: "naturaleza-aventura",
  },
  "2ca6e0ac-fc79-45dc-99d2-7465e74ac244": {
    ciudad: "Quito",
    lat: -0.48,
    lon: -78.14,
    categoria: "volcanes-montana",
  },
  "4a186e89-45da-4eee-b21d-691d3da435a9": {
    ciudad: "Quito",
    lat: 0.04,
    lon: -78.49,
    categoria: "volcanes-montana",
  },
  "38a2f543-e251-40a2-9082-33d740c4f4b2": {
    ciudad: "Quito",
    lat: -0.192,
    lon: -78.519,
    categoria: "volcanes-montana",
    tipo: "ADMISSION",
  },
  "4dbc16de-a7aa-4f67-87c2-e39fd0307eb2": {
    ciudad: "Papallacta",
    lat: -0.364,
    lon: -78.144,
    categoria: "naturaleza-aventura",
    tipo: "ADMISSION",
  },
  "491bfa94-0497-46a0-afe5-f3409df4fc6b": {
    ciudad: "Quito",
    lat: -0.0022,
    lon: -78.4558,
    categoria: "cultura-museos",
  },
  "63c73ebc-78f3-4867-9c5e-1a76c6aa04e6": {
    ciudad: "Quito",
    lat: -0.0022,
    lon: -78.4558,
    categoria: "cultura-museos",
  },
  "a56e8a0d-4768-434c-86f6-281422866ee4": {
    ciudad: "Latacunga",
    lat: -0.68,
    lon: -78.437,
    categoria: "volcanes-montana",
  },
  "e7230ba1-fa0b-4d40-a0c5-5cecd5f9d480": {
    ciudad: "Riobamba",
    lat: -1.4693,
    lon: -78.8174,
    categoria: "volcanes-montana",
  },
};

function slugify(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200);
}

// Código ECT-XXXXXX estable a partir del UUID (las reservas web viejas no tenían código).
function codigoDesde(uuid: string): string {
  const hash = createHash("md5").update(uuid).digest();
  let code = "ECT-";
  for (let i = 0; i < 6; i++)
    code += CODE_ALPHABET[hash[i] % CODE_ALPHABET.length];
  return code;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function tipoIdentificacion(doc: string | null): [string, string] | null {
  if (!doc) return null;
  const d = doc.toUpperCase();
  if (d === "9999999999999") return ["CONSUMIDOR_FINAL", d];
  if (/^[0-9]{10}$/.test(d)) return ["CEDULA", d];
  if (/^[0-9]{13}$/.test(d)) return ["RUC", d];
  if (RE_DOCUMENTO.test(d)) return ["PASAPORTE", d];
  return null;
}

function separarNombre(
  completo: string | null,
  correo: string,
): [string, string | null] {
  const limpio = (completo ?? "").trim().replace(/\s+/g, " ");
  if (!limpio) return [correo.split("@")[0], null];
  const i = limpio.indexOf(" ");
  return i < 0 ? [limpio, null] : [limpio.slice(0, i), limpio.slice(i + 1)];
}

async function idDe(
  q: QueryRunner,
  sql: string,
  params: unknown[],
): Promise<number> {
  const rows = await q.query(sql, params);
  return Number(rows[0]?.id);
}

async function migrarCategorias(q: QueryRunner): Promise<Mapa> {
  const mapa: Mapa = new Map();
  if (!(await existe(q, "categorias"))) return mapa;
  const filas = await q.query(
    `SELECT * FROM public.categorias ORDER BY (padre_id IS NOT NULL), orden, nombre`,
  );
  for (const c of filas) {
    const id = await idDe(
      q,
      `INSERT INTO ms_catalog.categoria (cat_uuid, cat_padre_id, cat_nombre, cat_slug, cat_descripcion,
         cat_icono, cat_orden, cat_incluye_comida, cat_incluye_transporte, cat_incluye_guia)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'map-pin'), $7, $8, $9, $10) RETURNING cat_id AS id`,
      [
        c.id,
        c.padre_id ? (mapa.get(c.padre_id) ?? null) : null,
        c.nombre,
        c.slug,
        c.descripcion ? String(c.descripcion).slice(0, 255) : null,
        c.icono ? String(c.icono).slice(0, 40) : null,
        c.orden,
        c.incluye_comida,
        c.incluye_transporte,
        c.incluye_guia,
      ],
    );
    mapa.set(c.id, id);
    mapa.set(`slug:${c.slug}`, id);
  }
  return mapa;
}

async function migrarAtracciones(q: QueryRunner, cat: Mapa): Promise<Mapa> {
  const mapa: Mapa = new Map();
  const [{ ope_id }] = await q.query(
    `SELECT ope_id FROM ms_catalog.operador WHERE ope_codigo = 1`,
  );
  const idiomas = await q.query(
    `SELECT idi_id FROM ms_catalog.idioma WHERE idi_codigo IN ('es', 'en')`,
  );
  const aeropuertos = await q.query(
    `SELECT a.aer_codigo, a.ciu_id, a.aer_latitud, a.aer_longitud FROM ms_location.aeropuerto a`,
  );
  const ciudades = await q.query(
    `SELECT ciu_id, ciu_nombre FROM ms_location.ciudad`,
  );
  const ciudadId = new Map<string, number>(
    ciudades.map((c: any) => [c.ciu_nombre, c.ciu_id]),
  );
  const slugs = new Set<string>();

  const filas = await q.query(
    `SELECT * FROM public.atracciones ORDER BY created_at, nombre`,
  );
  for (const a of filas) {
    const codigo = String(a.codigo_aeropuerto ?? "")
      .trim()
      .toUpperCase();
    const aer = aeropuertos.find((x: any) => x.aer_codigo === codigo);
    if (!aer) {
      throw new Error(
        `La atracción ${a.id} usa el aeropuerto '${codigo}', que no está en ms_location.aeropuerto`,
      );
    }
    const datos = ATRACCIONES[a.id];
    const duracion = a.duracion_horas != null ? Number(a.duracion_horas) : null;
    let slug = slugify(a.nombre) || "atraccion";
    for (let i = 2; slugs.has(slug); i++) slug = `${slugify(a.nombre)}-${i}`;
    slugs.add(slug);
    const estado =
      a.estado === "ACTIVA"
        ? "PUBLICADA"
        : a.estado === "INACTIVA" || a.estado === "MANTENIMIENTO"
          ? a.estado
          : "BORRADOR";

    const atrId = await idDe(
      q,
      `INSERT INTO ms_catalog.atraccion (atr_uuid, atr_nombre, atr_slug, atr_descripcion, atr_tipo,
         atr_estado, atr_latitud, atr_longitud, atr_duracion_horas, atr_codigo_aeropuerto, ciu_id,
         ope_id, atr_itinerario, atr_creado_en, atr_actualizado_en, atr_eliminado_en)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING atr_id AS id`,
      [
        a.id,
        a.nombre,
        slug,
        a.descripcion,
        datos?.tipo ??
          (duracion != null && duracion >= 6 ? "DAY_TRIP" : "GUIDED_TOUR"),
        estado,
        datos?.lat ?? aer.aer_latitud,
        datos?.lon ?? aer.aer_longitud,
        duracion,
        codigo,
        (datos && ciudadId.get(datos.ciudad)) ?? aer.ciu_id,
        ope_id,
        a.itinerario,
        a.created_at,
        a.updated_at,
        a.deleted_at,
      ],
    );
    mapa.set(a.id, atrId);

    if (a.foto_url && String(a.foto_url).length <= 500) {
      await q.query(
        `INSERT INTO ms_catalog.atraccion_foto (atr_id, fot_url, fot_alt, fot_orden) VALUES ($1, $2, $3, 0)`,
        [atrId, a.foto_url, String(a.nombre).slice(0, 200)],
      );
    }

    const incluye: string[] = Array.isArray(a.incluye) ? a.incluye : [];
    const vistos = new Set<string>();
    for (const [orden, bruto] of incluye.entries()) {
      const nombre = String(bruto ?? "")
        .trim()
        .slice(0, 150);
      if (!nombre || vistos.has(nombre.toLowerCase())) continue;
      vistos.add(nombre.toLowerCase());
      const incId = await idDe(
        q,
        `INSERT INTO ms_catalog.inclusion (inc_tipo, inc_nombre, inc_orden) VALUES ('INCLUYE', $1, $2)
         ON CONFLICT (inc_tipo, inc_nombre) DO UPDATE SET inc_nombre = EXCLUDED.inc_nombre
         RETURNING inc_id AS id`,
        [nombre, orden],
      );
      await q.query(
        `INSERT INTO ms_catalog.atraccion_inclusion (atr_id, inc_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [atrId, incId],
      );
    }

    for (const { idi_id } of idiomas) {
      await q.query(
        `INSERT INTO ms_catalog.atraccion_idioma (atr_id, idi_id) VALUES ($1, $2)`,
        [atrId, idi_id],
      );
    }
    const catId = datos?.categoria
      ? cat.get(`slug:${datos.categoria}`)
      : undefined;
    if (catId) {
      await q.query(
        `INSERT INTO ms_catalog.atraccion_categoria (atr_id, cat_id) VALUES ($1, $2)`,
        [atrId, catId],
      );
    }

    const precio = Number(a.precio_base);
    for (const [tipo, factor] of Object.entries(FACTORES)) {
      await q.query(
        `INSERT INTO ms_pricing.tarifa (atr_id, tar_tipo, tar_precio, tar_vigente_desde) VALUES ($1, $2, $3, $4)`,
        [atrId, tipo, round2(precio * factor), a.created_at],
      );
    }
    for (const hora of ["09:00", "14:00"]) {
      await q.query(
        `INSERT INTO ms_inventory.horario (atr_id, hor_hora, hor_cupo) VALUES ($1, $2, $3)`,
        [atrId, hora, Math.max(Number(a.capacidad_diaria) || 1, 1)],
      );
    }
  }
  return mapa;
}

interface MapaUsuarios {
  porUsuario: Mapa; // uuid usuario viejo -> usu_id
  porCliente: Mapa; // uuid cliente viejo -> usu_id (solo clientes con cuenta)
}

async function migrarUsuarios(q: QueryRunner): Promise<MapaUsuarios> {
  const porUsuario: Mapa = new Map();
  const porCliente: Mapa = new Map();
  if (!(await existe(q, "usuarios"))) return { porUsuario, porCliente };

  const roles = await q.query(`SELECT rol_id, rol_nombre FROM ms_identity.rol`);
  const rolId = (n: string) =>
    roles.find((r: any) => r.rol_nombre === n).rol_id;
  const [{ ope_id }] = await q.query(
    `SELECT ope_id FROM ms_catalog.operador WHERE ope_codigo = 1`,
  );

  const filas = await q.query(
    `SELECT u.*, c.id AS cliente_id, c.dni, c.nombre_completo, c.telefono
     FROM public.usuarios u LEFT JOIN public.clientes c ON c.usuario_id = u.id
     ORDER BY u.created_at`,
  );
  for (const u of filas) {
    const [nombre, apellido] = separarNombre(u.nombre_completo, u.email);
    const doc =
      u.dni && RE_DOCUMENTO.test(String(u.dni).toUpperCase())
        ? String(u.dni).toUpperCase()
        : null;
    const tel = u.telefono && RE_TELEFONO.test(u.telefono) ? u.telefono : null;
    const usuId = await idDe(
      q,
      `INSERT INTO ms_identity.usuario (usu_uuid, usu_correo, usu_password, usu_nombre, usu_apellido,
         usu_documento, usu_telefono, usu_activo, usu_creado_en, usu_actualizado_en)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING usu_id AS id`,
      [
        u.id,
        u.email,
        u.password_hash,
        nombre.slice(0, 120),
        apellido?.slice(0, 120) ?? null,
        doc,
        tel,
        u.estado,
        u.created_at,
        u.updated_at,
      ],
    );
    porUsuario.set(u.id, usuId);
    if (u.cliente_id) porCliente.set(u.cliente_id, usuId);

    const esAdmin = u.rol === "ADMIN";
    await q.query(
      `INSERT INTO ms_identity.usuario_rol (usu_id, rol_id, usr_asignado_en) VALUES ($1, $2, $3)`,
      [usuId, rolId(esAdmin ? "ADMIN" : "CLIENTE"), u.created_at],
    );
    if (esAdmin) {
      await q.query(
        `INSERT INTO ms_catalog.operador_usuario (ope_id, usu_id, opeu_cargo) VALUES ($1, $2, 'ADMIN')`,
        [ope_id, usuId],
      );
    }
    const ident = tipoIdentificacion(doc);
    if (ident && ident[0] !== "CONSUMIDOR_FINAL") {
      await q.query(
        `INSERT INTO ms_billing_profile.dato_facturacion (usu_id, dfa_tipo_identificacion, dfa_identificacion,
           dfa_razon_social, dfa_correo, dfa_telefono, dfa_es_principal, dfa_creado_en)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7)`,
        [
          usuId,
          ident[0],
          ident[1],
          (u.nombre_completo || nombre).slice(0, 150),
          u.email,
          tel,
          u.created_at,
        ],
      );
    }
  }
  return { porUsuario, porCliente };
}

async function migrarResenasYFavoritos(
  q: QueryRunner,
  atr: Mapa,
  usu: MapaUsuarios,
): Promise<void> {
  if (await existe(q, "resenas")) {
    const filas = await q.query(
      `SELECT DISTINCT ON (r.cliente_id, r.atraccion_id) r.*, c.nombre_completo
       FROM public.resenas r LEFT JOIN public.clientes c ON c.id = r.cliente_id
       ORDER BY r.cliente_id, r.atraccion_id, r.created_at DESC`,
    );
    for (const r of filas) {
      const atrId = atr.get(r.atraccion_id);
      if (!atrId) continue;
      const usuId = r.cliente_id
        ? (usu.porCliente.get(r.cliente_id) ?? null)
        : null;
      await q.query(
        `INSERT INTO ms_review.resena (atr_id, usu_id, ren_autor_nombre, ren_puntuacion, ren_comentario, ren_creado_en)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          atrId,
          usuId,
          usuId ? null : (r.nombre_completo || "Usuario anónimo").slice(0, 120),
          r.score,
          String(r.comment).slice(0, 1000),
          r.created_at,
        ],
      );
    }
    await q.query(`
      UPDATE ms_catalog.atraccion a
      SET atr_calificacion_promedio = s.promedio, atr_numero_resenas = s.total
      FROM (SELECT atr_id, round(avg(ren_puntuacion), 2) AS promedio, count(*) AS total
            FROM ms_review.resena WHERE ren_visible GROUP BY atr_id) s
      WHERE s.atr_id = a.atr_id`);
  }
  if (await existe(q, "wishlists")) {
    const filas = await q.query(`SELECT * FROM public.wishlists`);
    for (const w of filas) {
      const atrId = atr.get(w.atraccion_id);
      const usuId = usu.porCliente.get(w.cliente_id);
      if (!atrId || !usuId) continue;
      await q.query(
        `INSERT INTO ms_catalog.favorito (usu_id, atr_id, fav_creado_en) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [usuId, atrId, w.added_at],
      );
    }
  }
}

async function migrarContrato(q: QueryRunner): Promise<void> {
  if (!(await existe(q, "contrato_promociones"))) return;
  const [c] = await q.query(
    `SELECT * FROM public.contrato_promociones WHERE id = 1`,
  );
  if (!c) return;
  const correo =
    c.contacto_email && RE_CORREO.test(c.contacto_email)
      ? c.contacto_email
      : null;
  await q.query(
    `INSERT INTO ms_pricing.contrato_promocion (cpr_id, cpr_permite_promociones, cpr_porcentaje_maximo,
       cpr_fecha_acuerdo, cpr_vigencia_hasta, cpr_condiciones, cpr_contacto_nombre, cpr_contacto_correo, cpr_actualizado_en)
     VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      c.permite_promociones,
      c.permite_promociones ? Number(c.porcentaje_descuento_maximo) : 0,
      c.fecha_acuerdo,
      c.vigencia_hasta,
      c.condiciones_combo ? String(c.condiciones_combo).slice(0, 1000) : null,
      c.contacto_nombre,
      correo,
      c.updated_at,
    ],
  );
  const destinos: string[] = Array.isArray(c.destinos_habilitados)
    ? c.destinos_habilitados
    : [];
  for (const [orden, nombre] of destinos.entries()) {
    await q.query(
      `INSERT INTO ms_pricing.contrato_promocion_destino (cpr_id, cpd_nombre, cpd_orden) VALUES (1, $1, $2)
       ON CONFLICT DO NOTHING`,
      [String(nombre).slice(0, 100), orden],
    );
  }
}

async function migrarReservas(
  q: QueryRunner,
  atr: Mapa,
  usu: MapaUsuarios,
): Promise<void> {
  if (!(await existe(q, "reservas"))) return;
  const est = async (esquema: string) =>
    new Map<string, number>(
      (await q.query(`SELECT est_codigo, est_id FROM ${esquema}.estado`)).map(
        (e: any) => [e.est_codigo, e.est_id],
      ),
    );
  const estOrden = await est("ms_order");
  const estReserva = await est("ms_booking");
  const estPago = await est("ms_payment");
  const estFactura = await est("ms_invoicing");
  const metodos = new Map<string, number>(
    (
      await q.query(`SELECT mpa_codigo, mpa_id FROM ms_payment.metodo_pago`)
    ).map((m: any) => [m.mpa_codigo, m.mpa_id]),
  );

  const filas = await q.query(
    `SELECT r.*, d.cantidad_boletos, d.precio_unitario_historico, d.subtotal AS detalle_subtotal,
            d.atraccion_id, a.nombre AS atraccion_nombre,
            c.nombre_completo, c.dni, c.telefono, c.usuario_id, u.email AS usuario_email,
            f.estado_pago, f.total_pagado, f.metodo_pago, f.transaction_id, f.receipt_url,
            f.fecha_emision, f.ruc_cliente, f.created_at AS factura_creada
     FROM public.reservas r
     JOIN public.detalles_reserva d ON d.reserva_id = r.id
     JOIN public.atracciones a ON a.id = d.atraccion_id
     LEFT JOIN public.clientes c ON c.id = r.cliente_id
     LEFT JOIN public.usuarios u ON u.id = c.usuario_id
     LEFT JOIN public.facturas f ON f.reserva_id = r.id
     ORDER BY r.created_at`,
  );

  for (const r of filas) {
    const atrId = atr.get(r.atraccion_id);
    if (!atrId) continue;
    const usuId = r.usuario_id
      ? (usu.porUsuario.get(r.usuario_id) ?? null)
      : null;
    const canal = r.canal === "BOOKING" || !usuId ? "BOOKING" : "WEB";
    const codigo = r.codigo_reserva || codigoDesde(r.id);
    const fecha = String(
      r.fecha_reserva instanceof Date
        ? r.fecha_reserva.toISOString()
        : r.fecha_reserva,
    ).slice(0, 10);
    const activa =
      r.estado_reserva === "PENDIENTE" || r.estado_reserva === "CONFIRMADA";
    const pagada =
      r.estado_pago === "PAGADO" || r.estado_pago === "REEMBOLSADO";
    const cancelada = r.estado_reserva === "CANCELADA";

    // Turno: el de la reserva o el primero; si la hora no existe se agrega como inactiva.
    const hora = r.hora_turno || "09:00";
    let [horario] = await q.query(
      `SELECT hor_id, hor_cupo FROM ms_inventory.horario WHERE atr_id = $1 AND hor_hora = $2`,
      [atrId, hora],
    );
    if (!horario) {
      [horario] = await q.query(
        `INSERT INTO ms_inventory.horario (atr_id, hor_hora, hor_cupo, hor_activo)
         SELECT $1, $2, max(hor_cupo), FALSE FROM ms_inventory.horario WHERE atr_id = $1
         RETURNING hor_id, hor_cupo`,
        [atrId, hora],
      );
    }
    const tickets = Number(r.cantidad_boletos);
    const [{ dis_id }] = await q.query(
      `INSERT INTO ms_inventory.disponibilidad (atr_id, hor_id, dis_fecha, dis_cupo_total, dis_cupo_reservado)
       VALUES ($1, $2, $3, GREATEST($4::int, $5::int), $5)
       ON CONFLICT (atr_id, dis_fecha, hor_id) DO UPDATE
         SET dis_cupo_reservado = ms_inventory.disponibilidad.dis_cupo_reservado + EXCLUDED.dis_cupo_reservado,
             dis_cupo_total = GREATEST(ms_inventory.disponibilidad.dis_cupo_total,
                                       ms_inventory.disponibilidad.dis_cupo_reservado + EXCLUDED.dis_cupo_reservado)
       RETURNING dis_id`,
      [atrId, horario.hor_id, fecha, horario.hor_cupo, activa ? tickets : 0],
    );

    // Líneas por tipo de pasajero, con el precio adulto histórico como base.
    const p = Number(r.precio_unitario_historico);
    const pj = r.pasajeros as {
      adultos?: number;
      ninos?: number;
      seniors?: number;
      infantes?: number;
    } | null;
    const pax = {
      ADULTO: Number(pj?.adultos ?? 0),
      NINO: Number(pj?.ninos ?? 0),
      MAYOR: Number(pj?.seniors ?? 0),
      INFANTE: Number(pj?.infantes ?? 0),
    };
    const sumaPax = pax.ADULTO + pax.NINO + pax.MAYOR + pax.INFANTE;
    if (!pj || sumaPax !== tickets || pax.ADULTO < 1) {
      Object.assign(pax, { ADULTO: tickets, NINO: 0, MAYOR: 0, INFANTE: 0 });
    }
    const lineas = (Object.keys(FACTORES) as (keyof typeof FACTORES)[])
      .filter((t) => pax[t] > 0)
      .map((t) => {
        const precio = round2(p * FACTORES[t]);
        return {
          tipo: t,
          cantidad: pax[t],
          precio,
          subtotal: round2(precio * pax[t]),
        };
      });
    const total = round2(lineas.reduce((s, l) => s + l.subtotal, 0));

    const estadoOrden = cancelada
      ? pagada
        ? "REEMBOLSADA"
        : "CANCELADA"
      : pagada || r.estado_reserva === "CONFIRMADA"
        ? "PAGADA"
        : "CREADA";
    const correo =
      [r.contacto_email, r.usuario_email].find((e) => e && RE_CORREO.test(e)) ??
      null;
    const telefono =
      r.telefono && RE_TELEFONO.test(r.telefono) ? r.telefono : null;
    const ordId = await idDe(
      q,
      `INSERT INTO ms_order.orden (ord_numero, usu_id, ord_canal, ord_referencia_externa, ord_correlation_id,
         ord_contacto_correo, ord_contacto_telefono, est_id, mpa_id, ord_fecha, ord_subtotal, ord_total,
         ord_observaciones, ord_creado_en, ord_actualizado_en)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11, $12, $10, $13) RETURNING ord_id AS id`,
      [
        `ORD-${codigo}`,
        usuId,
        canal,
        r.booking_reservation_id,
        r.correlation_id,
        correo,
        telefono,
        estOrden.get(estadoOrden),
        pagada ? metodoPago(metodos, r.metodo_pago) : null,
        r.created_at,
        total,
        r.solicitudes_especiales
          ? String(r.solicitudes_especiales).slice(0, 500)
          : null,
        r.updated_at,
      ],
    );
    const detIds: number[] = [];
    for (const l of lineas) {
      detIds.push(
        await idDe(
          q,
          `INSERT INTO ms_order.orden_detalle (ord_id, atr_id, det_tipo_pasajero, det_descripcion, det_cantidad,
             det_precio_unitario, det_subtotal) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING det_id AS id`,
          [
            ordId,
            atrId,
            l.tipo,
            String(r.atraccion_nombre).slice(0, 255),
            l.cantidad,
            l.precio,
            l.subtotal,
          ],
        ),
      );
    }

    const estadoReserva = cancelada
      ? "CANCELADA"
      : r.estado_reserva === "CONFIRMADA"
        ? r.checkin_at
          ? "CHECKED_IN"
          : "CONFIRMADA"
        : "PENDIENTE_PAGO";
    const solicitante = ["CLIENTE", "SAGA_ORCHESTRATOR", "ADMIN"].includes(
      r.cancelacion_solicitante,
    )
      ? r.cancelacion_solicitante
      : null;
    const resId = await idDe(
      q,
      `INSERT INTO ms_booking.reserva (res_uuid, res_codigo, ord_id, det_id, dis_id, est_id, res_adultos,
         res_ninos, res_seniors, res_infantes, res_numero_tickets, res_precio_unitario, res_subtotal,
         res_observaciones, res_motivo_cancelacion, res_cancelacion_solicitante, res_checkin_en,
         res_checkin_guia, res_checkin_dispositivo, res_checkin_idempotencia, res_creado_en,
         res_actualizado_en, res_cancelado_en, res_confirmado_en)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
               $21, $22, $23, $24) RETURNING res_id AS id`,
      [
        r.id,
        codigo,
        ordId,
        detIds[0],
        dis_id,
        estReserva.get(estadoReserva),
        pax.ADULTO,
        pax.NINO,
        pax.MAYOR,
        pax.INFANTE,
        tickets,
        p,
        total,
        r.solicitudes_especiales
          ? String(r.solicitudes_especiales).slice(0, 500)
          : null,
        r.cancelacion_motivo
          ? String(r.cancelacion_motivo).slice(0, 255)
          : null,
        solicitante,
        r.checkin_at,
        r.checkin_guia,
        r.checkin_dispositivo,
        r.checkin_idempotency_key,
        r.created_at,
        r.updated_at,
        cancelada ? (r.cancelada_at ?? r.updated_at) : null,
        r.estado_reserva === "CONFIRMADA" || pagada ? r.updated_at : null,
      ],
    );
    const docTitular =
      r.dni && RE_DOCUMENTO.test(String(r.dni).toUpperCase())
        ? String(r.dni).toUpperCase()
        : null;
    await q.query(
      `INSERT INTO ms_booking.reserva_pasajero (res_id, pax_nombre, pax_documento, pax_es_titular)
       VALUES ($1, $2, $3, TRUE)`,
      [
        resId,
        (
          r.nombre_completo || (r.usuario_email ?? "Titular").split("@")[0]
        ).slice(0, 120),
        docTitular,
      ],
    );

    let pagId: number | null = null;
    if (pagada && total > 0) {
      pagId = await idDe(
        q,
        `INSERT INTO ms_payment.pago (pag_numero, ord_id, mpa_id, est_id, pag_monto, pag_referencia,
           pag_comprobante_url, pag_fecha, pag_aprobado_en, pag_creado_en)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, $8) RETURNING pag_id AS id`,
        [
          `PAG-${codigo}`,
          ordId,
          metodoPago(metodos, r.metodo_pago),
          estPago.get("APROBADO"),
          total,
          r.transaction_id,
          r.receipt_url,
          r.factura_creada ?? r.updated_at,
        ],
      );
    }
    if (pagId && cancelada) {
      await q.query(
        `INSERT INTO ms_refund.reembolso (pag_id, rem_numero, rem_monto, rem_motivo, rem_solicitado_en, rem_procesado_en)
         VALUES ($1, $2, $3, $4, $5, $5)`,
        [
          pagId,
          `REF-${codigo}`,
          total,
          (r.cancelacion_motivo || "Cancelación de la reserva").slice(0, 300),
          r.cancelada_at ?? r.updated_at,
        ],
      );
    }

    if (r.estado_pago) {
      const ident = tipoIdentificacion(r.ruc_cliente) ?? [
        "CONSUMIDOR_FINAL",
        "9999999999999",
      ];
      const estadoFactura =
        cancelada || r.estado_pago === "REEMBOLSADO"
          ? "ANULADA"
          : pagada
            ? "PAGADA"
            : "NO_PAGADA";
      const [dfa] = usuId
        ? await q.query(
            `SELECT dfa_id FROM ms_billing_profile.dato_facturacion WHERE usu_id = $1 AND dfa_es_principal`,
            [usuId],
          )
        : [];
      const facId = await idDe(
        q,
        `INSERT INTO ms_invoicing.factura (ord_id, dfa_id, fac_numero, est_id, fac_emitida_en, fac_subtotal,
           fac_total, fac_tipo_identificacion, fac_identificacion, fac_razon_social, fac_correo, fac_telefono)
         VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8, $9, $10, $11) RETURNING fac_id AS id`,
        [
          ordId,
          dfa?.dfa_id ?? null,
          `FAC-${codigo}`,
          estFactura.get(estadoFactura),
          r.fecha_emision ?? r.created_at,
          total,
          ident[0],
          ident[1],
          (r.nombre_completo || "Consumidor final").slice(0, 150),
          correo ?? "facturacion@ecuatravel.ec",
          telefono,
        ],
      );
      for (const [i, l] of lineas.entries()) {
        await q.query(
          `INSERT INTO ms_invoicing.factura_detalle (fac_id, det_id, fde_codigo, fde_descripcion, fde_cantidad,
             fde_precio_unitario, fde_subtotal, fde_total) VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
          [
            facId,
            detIds[i],
            `ATR-${atrId}-${l.tipo}`.slice(0, 25),
            String(r.atraccion_nombre).slice(0, 300),
            l.cantidad,
            l.precio,
            l.subtotal,
          ],
        );
      }
    }
  }
}

function metodoPago(
  metodos: Map<string, number>,
  legado: string | null,
): number {
  const codigo =
    legado === "PAYPAL"
      ? "PAYPAL"
      : legado === "TRANSFER"
        ? "TRANSFERENCIA"
        : legado === "BOOKING"
          ? "BOOKING"
          : "TARJETA";
  return metodos.get(codigo);
}

async function existe(q: QueryRunner, tabla: string): Promise<boolean> {
  const [{ ok }] = await q.query(`SELECT to_regclass($1) IS NOT NULL AS ok`, [
    `public.${tabla}`,
  ]);
  return ok;
}

async function moverLegacy(q: QueryRunner): Promise<void> {
  await q.query(`CREATE SCHEMA IF NOT EXISTS legacy`);
  for (const t of TABLAS_LEGACY) {
    if (await existe(q, t))
      await q.query(`ALTER TABLE public.${t} SET SCHEMA legacy`);
  }
}
