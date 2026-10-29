import { HttpException, HttpStatus } from "@nestjs/common";

const ERRORS_BASE = "https://booking.epn.edu.ec/errors";

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Problem Details (RFC 7807) con el `code` que Booking usa para decidir.
export function problem(
  status: HttpStatus,
  code: string,
  slug: string,
  title: string,
  detail: string,
  extra: Record<string, unknown> = {},
) {
  return new HttpException(
    { type: `${ERRORS_BASE}/${slug}`, title, status, detail, code, ...extra },
    status,
  );
}

export function hoyEcuador(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guayaquil",
  }).format(new Date());
}

export function horaActualEcuador(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Guayaquil",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
}

export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// "10:30 a.m.", "2:00 PM", "10:30", "10:30:00" -> "10:30" (24 h). null si no es válida.
export function toHora24(raw: string): string | null {
  const m = raw
    .trim()
    .toLowerCase()
    .match(/^(\d{1,2}):([0-5]\d)(?::[0-5]\d)?\s*(a\.?\s?m\.?|p\.?\s?m\.?)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const meridiano = m[3]?.[0];
  if (meridiano) {
    if (h < 1 || h > 12) return null;
    if (meridiano === "p" && h < 12) h += 12;
    if (meridiano === "a" && h === 12) h = 0;
  }
  if (h > 23) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

export function horaLegible(hora24: string): string {
  const [h, min] = hora24.split(":").map(Number);
  return `${h % 12 || 12}:${String(min).padStart(2, "0")} ${h < 12 ? "a.m." : "p.m."}`;
}

export function slotId(fecha: string, hora24: string): string {
  return `slot-${fecha.replace(/-/g, "")}-${hora24.replace(":", "")}`;
}
