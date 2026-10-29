import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Columnas para recibir reservas despachadas por Booking Prototipo
 * (POST /api/v3/atracciones/reservas). Idempotente, como la migración base.
 */
export class ReservasCanalBooking1820000000000 implements MigrationInterface {
  name = "ReservasCanalBooking1820000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "reservas"
        ADD COLUMN IF NOT EXISTS "canal" character varying(20) NOT NULL DEFAULT 'WEB',
        ADD COLUMN IF NOT EXISTS "codigo_reserva" character varying(20),
        ADD COLUMN IF NOT EXISTS "hora_turno" character varying(5),
        ADD COLUMN IF NOT EXISTS "slot_id" character varying(40),
        ADD COLUMN IF NOT EXISTS "booking_reservation_id" character varying(100),
        ADD COLUMN IF NOT EXISTS "correlation_id" character varying(100),
        ADD COLUMN IF NOT EXISTS "contacto_email" character varying(150),
        ADD COLUMN IF NOT EXISTS "solicitudes_especiales" text,
        ADD COLUMN IF NOT EXISTS "pasajeros" jsonb
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_reservas_codigo_reserva" ON "reservas" ("codigo_reserva")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_reservas_booking_reservation_id" ON "reservas" ("booking_reservation_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_reservas_booking_reservation_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_reservas_codigo_reserva"`,
    );
    await queryRunner.query(`
      ALTER TABLE "reservas"
        DROP COLUMN IF EXISTS "pasajeros",
        DROP COLUMN IF EXISTS "solicitudes_especiales",
        DROP COLUMN IF EXISTS "contacto_email",
        DROP COLUMN IF EXISTS "correlation_id",
        DROP COLUMN IF EXISTS "booking_reservation_id",
        DROP COLUMN IF EXISTS "slot_id",
        DROP COLUMN IF EXISTS "hora_turno",
        DROP COLUMN IF EXISTS "codigo_reserva",
        DROP COLUMN IF EXISTS "canal"
    `);
  }
}
