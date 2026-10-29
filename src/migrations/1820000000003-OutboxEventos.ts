import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Transactional Outbox para GET /api/v3/atracciones/eventos.
 */
export class OutboxEventos1820000000003 implements MigrationInterface {
  name = "OutboxEventos1820000000003";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "outbox_eventos" (
        "evt_id" BIGSERIAL NOT NULL,
        "event_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "event_type" character varying(40) NOT NULL,
        "aggregate_id" character varying(100) NOT NULL,
        "correlation_id" character varying(100) NOT NULL,
        "payload" jsonb NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_outbox_eventos" PRIMARY KEY ("evt_id"),
        CONSTRAINT "UQ_outbox_eventos_event_id" UNIQUE ("event_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_outbox_eventos_event_type" ON "outbox_eventos" ("event_type", "evt_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "outbox_eventos"`);
  }
}
