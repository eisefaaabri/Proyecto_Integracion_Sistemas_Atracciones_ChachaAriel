import { HttpException, HttpStatus } from "@nestjs/common";

const ERRORS_BASE = "https://booking.epn.edu.ec/errors";

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
