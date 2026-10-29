import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Idempotency-Key deja de exigir formato UUID: el conector de Booking puede
 * enviar claves con prefijo. Los UUID existentes se conservan como texto.
 */
export class IdempotencyKeyTexto1820000000004 implements MigrationInterface {
  name = "IdempotencyKeyTexto1820000000004";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "reservas"
        ALTER COLUMN "idempotency_key" TYPE character varying(100) USING "idempotency_key"::text,
        ALTER COLUMN "checkin_idempotency_key" TYPE character varying(100) USING "checkin_idempotency_key"::text
    `);
  }

  // Falla si ya se guardaron claves que no son UUID.
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "reservas"
        ALTER COLUMN "checkin_idempotency_key" TYPE uuid USING "checkin_idempotency_key"::uuid,
        ALTER COLUMN "idempotency_key" TYPE uuid USING "idempotency_key"::uuid
    `);
  }
}
