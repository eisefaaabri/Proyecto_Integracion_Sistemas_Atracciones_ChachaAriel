import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Auditoría de cancelación y check-in presencial de reservas de Booking
 * (POST /api/v3/atracciones/reservas/{id}/cancel y /checkin).
 */
export class ReservasCancelacionCheckin1820000000001 implements MigrationInterface {
  name = "ReservasCancelacionCheckin1820000000001";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "reservas"
        ADD COLUMN IF NOT EXISTS "cancelada_at" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS "cancelacion_motivo" character varying(200),
        ADD COLUMN IF NOT EXISTS "cancelacion_solicitante" character varying(20),
        ADD COLUMN IF NOT EXISTS "checkin_at" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS "checkin_guia" character varying(150),
        ADD COLUMN IF NOT EXISTS "checkin_dispositivo" character varying(100),
        ADD COLUMN IF NOT EXISTS "checkin_idempotency_key" uuid
    `);
    // Bases creadas con synchronize tienen estado_pago como enum nativo; las de la
    // migración consolidada, como varchar.
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'facturas_estado_pago_enum') THEN
          ALTER TYPE "facturas_estado_pago_enum" ADD VALUE IF NOT EXISTS 'REEMBOLSADO';
        END IF;
      END $$
    `);
  }

  // PostgreSQL no permite quitar valores de un enum: REEMBOLSADO se conserva.
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "reservas"
        DROP COLUMN IF EXISTS "checkin_idempotency_key",
        DROP COLUMN IF EXISTS "checkin_dispositivo",
        DROP COLUMN IF EXISTS "checkin_guia",
        DROP COLUMN IF EXISTS "checkin_at",
        DROP COLUMN IF EXISTS "cancelacion_solicitante",
        DROP COLUMN IF EXISTS "cancelacion_motivo",
        DROP COLUMN IF EXISTS "cancelada_at"
    `);
  }
}
