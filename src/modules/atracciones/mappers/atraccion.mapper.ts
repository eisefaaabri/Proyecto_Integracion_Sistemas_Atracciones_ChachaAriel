import { Atraccion, EstadoAtraccion } from "../../catalog/catalog.entities";
import { Precios } from "../../pricing/pricing.service";
import { TipoTarifa } from "../../pricing/pricing.entities";
import { Horario } from "../../inventory/inventory.entities";

export interface ExtrasAtraccion {
  precios?: Precios;
  horarios?: Horario[];
  ciudad?: string;
}

// Estado del modelo nuevo → estado que conocen la API v2/v3 y el frontend.
export function estadoApi(estado: EstadoAtraccion): string | null {
  if (estado === EstadoAtraccion.PUBLICADA) return "ACTIVA";
  if (estado === EstadoAtraccion.BORRADOR) return null;
  return estado;
}

export function estadoModelo(
  estado: string | null | undefined,
): EstadoAtraccion {
  if (!estado || estado === "ACTIVA") return EstadoAtraccion.PUBLICADA;
  if (estado === "INACTIVA") return EstadoAtraccion.INACTIVA;
  if (estado === "MANTENIMIENTO") return EstadoAtraccion.MANTENIMIENTO;
  return EstadoAtraccion.BORRADOR;
}

const dec2 = (n: number | null | undefined) =>
  n === null || n === undefined ? null : Number(n).toFixed(2);

/**
 * Misma forma que la entidad monolítica que consumen el frontend (v2) y Booking (v3):
 * id = UUID público, precio_base y duracion_horas como texto con 2 decimales.
 * precio, ciudad, duracion y horarios son campos agregados que pidió Booking.
 */
export function toAtraccionApi(a: Atraccion, extras: ExtrasAtraccion = {}) {
  const precio = extras.precios?.[TipoTarifa.ADULTO] ?? null;
  const horarios = (extras.horarios ?? []).map((h) => h.hor_hora.slice(0, 5));
  const cupo = extras.horarios?.length
    ? Math.max(...extras.horarios.map((h) => h.hor_cupo))
    : null;
  const fotos = [...(a.fotos ?? [])].sort((x, y) => x.fot_orden - y.fot_orden);
  const incluye = [...(a.inclusiones ?? [])]
    .sort((x, y) => x.inc_orden - y.inc_orden || x.inc_id - y.inc_id)
    .map((i) => i.inc_nombre);

  return {
    id: a.atr_uuid,
    nombre: a.atr_nombre,
    descripcion: a.atr_descripcion,
    precio_base: dec2(precio),
    capacidad_diaria: cupo,
    codigo_aeropuerto: a.atr_codigo_aeropuerto,
    foto_url: fotos[0]?.fot_url ?? null,
    estado: estadoApi(a.atr_estado),
    duracion_horas: dec2(a.atr_duracion_horas),
    incluye: incluye.length ? incluye : null,
    itinerario: a.atr_itinerario,
    created_at: a.atr_creado_en,
    updated_at: a.atr_actualizado_en,
    deleted_at: a.atr_eliminado_en,
    precio,
    ciudad: extras.ciudad ?? null,
    duracion: a.atr_duracion_horas,
    horarios,
    latitud: a.atr_latitud,
    longitud: a.atr_longitud,
    categorias: (a.categorias ?? []).map((c) => c.cat_slug),
    calificacion_promedio: a.atr_calificacion_promedio,
    numero_resenas: a.atr_numero_resenas,
  };
}

export type AtraccionApi = ReturnType<typeof toAtraccionApi>;
