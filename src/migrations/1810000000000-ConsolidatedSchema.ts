import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Esquema consolidado (idempotente) alineado con las entidades actuales.
 * - CREATE TABLE IF NOT EXISTS: funciona en una BD nueva y no rompe BDs
 *   ya creadas con synchronize.
 * - ADD COLUMN / ADD CONSTRAINT / CREATE INDEX IF NOT EXISTS: se autoconcilian
 *   si el esquema ya existe (p. ej. columnas nuevas como estado, duracion_horas,
 *   incluye, itinerario, idempotency_key).
 */
export class ConsolidatedSchema1810000000000 implements MigrationInterface {
  name = "ConsolidatedSchema1810000000000";

  private async ensureConstraint(
    queryRunner: QueryRunner,
    name: string,
    sql: string,
  ) {
    const row = await queryRunner.query(
      `SELECT 1 FROM pg_constraint WHERE conname = $1`,
      [name],
    );
    if (row.length === 0) {
      await queryRunner.query(sql);
    }
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---------- atracciones (núcleo del catálogo) ----------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "atracciones" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "nombre" character varying(150) NOT NULL,
        "descripcion" text NOT NULL,
        "precio_base" numeric(10,2) NOT NULL,
        "capacidad_diaria" integer NOT NULL,
        "codigo_aeropuerto" character varying(10) NOT NULL,
        "foto_url" text,
        "estado" character varying(20) NOT NULL DEFAULT 'ACTIVA',
        "duracion_horas" numeric(5,2),
        "incluye" jsonb,
        "itinerario" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_atracciones" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_atracciones_precio_base" CHECK ("precio_base" >= 0),
        CONSTRAINT "CHK_atracciones_capacidad_diaria" CHECK ("capacidad_diaria" >= 1)
      )
    `);

    // Columnas que pueden faltar en BDs que ya tenían el esquema del template/synchronize.
    const columns = [
      ["nombre", "character varying(150)"],
      ["descripcion", "text"],
      ["precio_base", "numeric(10,2)"],
      ["capacidad_diaria", "integer"],
      ["codigo_aeropuerto", "character varying(10)"],
      ["foto_url", "text"],
      ["estado", "character varying(20)"],
      ["duracion_horas", "numeric(5,2)"],
      ["incluye", "jsonb"],
      ["itinerario", "text"],
      ["deleted_at", "TIMESTAMP"],
    ] as const;
    for (const [col, type] of columns) {
      await queryRunner.query(
        `ALTER TABLE "atracciones" ADD COLUMN IF NOT EXISTS "${col}" ${type}`,
      );
    }
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_atracciones_nombre" ON "atracciones" ("nombre")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_atracciones_codigo_aeropuerto" ON "atracciones" ("codigo_aeropuerto")`,
    );

    // ---------- usuarios / clientes ----------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "usuarios" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "email" character varying(255) NOT NULL,
        "password_hash" character varying(255) NOT NULL,
        "rol" character varying(20) NOT NULL DEFAULT 'TURISTA',
        "estado" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_usuarios" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_usuarios_email" ON "usuarios" ("email")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "clientes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "dni" character varying(20) NOT NULL,
        "nombre_completo" character varying(150) NOT NULL,
        "telefono" character varying(20),
        "usuario_id" uuid,
        CONSTRAINT "PK_clientes" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_clientes_dni" ON "clientes" ("dni")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_clientes_usuario_id" ON "clientes" ("usuario_id")`,
    );
    await this.ensureConstraint(
      queryRunner,
      "FK_clientes_usuario",
      `ALTER TABLE "clientes" ADD CONSTRAINT "FK_clientes_usuario" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE`,
    );

    // ---------- reservas ----------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "reservas" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "fecha_reserva" date NOT NULL,
        "estado_reserva" character varying(20) NOT NULL DEFAULT 'PENDIENTE',
        "idempotency_key" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "cliente_id" uuid,
        CONSTRAINT "PK_reservas" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `ALTER TABLE "reservas" ADD COLUMN IF NOT EXISTS "idempotency_key" uuid`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_reservas_idempotency_key" ON "reservas" ("idempotency_key")`,
    );
    await this.ensureConstraint(
      queryRunner,
      "FK_reservas_cliente",
      `ALTER TABLE "reservas" ADD CONSTRAINT "FK_reservas_cliente" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT`,
    );

    // ---------- detalle de reserva ----------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "detalles_reserva" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "cantidad_boletos" integer NOT NULL,
        "precio_unitario_historico" numeric(10,2) NOT NULL,
        "subtotal" numeric(10,2) NOT NULL,
        "reserva_id" uuid,
        "atraccion_id" uuid,
        CONSTRAINT "PK_detalles_reserva" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_detalles_cantidad" CHECK ("cantidad_boletos" >= 1)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_detalles_reserva_id" ON "detalles_reserva" ("reserva_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_detalles_atraccion_id" ON "detalles_reserva" ("atraccion_id")`,
    );
    await this.ensureConstraint(
      queryRunner,
      "FK_detalles_reserva",
      `ALTER TABLE "detalles_reserva" ADD CONSTRAINT "FK_detalles_reserva" FOREIGN KEY ("reserva_id") REFERENCES "reservas"("id") ON DELETE CASCADE`,
    );
    await this.ensureConstraint(
      queryRunner,
      "FK_detalles_atraccion",
      `ALTER TABLE "detalles_reserva" ADD CONSTRAINT "FK_detalles_atraccion" FOREIGN KEY ("atraccion_id") REFERENCES "atracciones"("id") ON DELETE RESTRICT`,
    );

    // ---------- facturas ----------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "facturas" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "numero_factura" character varying(50) NOT NULL,
        "fecha_emision" date NOT NULL,
        "ruc_cliente" character varying(20) NOT NULL,
        "estado_pago" character varying(20) NOT NULL DEFAULT 'PENDIENTE',
        "total_pagado" numeric(10,2) NOT NULL,
        "transaction_id" character varying(100),
        "metodo_pago" character varying(50),
        "receipt_url" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "reserva_id" uuid,
        "cliente_id" uuid,
        CONSTRAINT "PK_facturas" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_facturas_total" CHECK ("total_pagado" >= 0)
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_facturas_numero_factura" ON "facturas" ("numero_factura")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_facturas_reserva_id" ON "facturas" ("reserva_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_facturas_cliente_id" ON "facturas" ("cliente_id")`,
    );
    await this.ensureConstraint(
      queryRunner,
      "FK_facturas_reserva",
      `ALTER TABLE "facturas" ADD CONSTRAINT "FK_facturas_reserva" FOREIGN KEY ("reserva_id") REFERENCES "reservas"("id") ON DELETE RESTRICT`,
    );
    await this.ensureConstraint(
      queryRunner,
      "FK_facturas_cliente",
      `ALTER TABLE "facturas" ADD CONSTRAINT "FK_facturas_cliente" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT`,
    );

    // ---------- reseñas ----------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "resenas" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "score" integer NOT NULL,
        "comment" text NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "atraccion_id" uuid,
        "cliente_id" uuid,
        CONSTRAINT "PK_resenas" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_resenas_score" CHECK ("score" >= 1 AND "score" <= 5)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_resenas_atraccion_id" ON "resenas" ("atraccion_id")`,
    );
    await this.ensureConstraint(
      queryRunner,
      "FK_resenas_atraccion",
      `ALTER TABLE "resenas" ADD CONSTRAINT "FK_resenas_atraccion" FOREIGN KEY ("atraccion_id") REFERENCES "atracciones"("id") ON DELETE CASCADE`,
    );
    await this.ensureConstraint(
      queryRunner,
      "FK_resenas_cliente",
      `ALTER TABLE "resenas" ADD CONSTRAINT "FK_resenas_cliente" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE`,
    );

    // ---------- wishlists ----------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "wishlists" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "added_at" TIMESTAMP NOT NULL DEFAULT now(),
        "atraccion_id" uuid,
        "cliente_id" uuid,
        CONSTRAINT "PK_wishlists" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_wishlists_cliente_atraccion" ON "wishlists" ("cliente_id", "atraccion_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_wishlists_atraccion_id" ON "wishlists" ("atraccion_id")`,
    );
    await this.ensureConstraint(
      queryRunner,
      "FK_wishlists_atraccion",
      `ALTER TABLE "wishlists" ADD CONSTRAINT "FK_wishlists_atraccion" FOREIGN KEY ("atraccion_id") REFERENCES "atracciones"("id") ON DELETE CASCADE`,
    );
    await this.ensureConstraint(
      queryRunner,
      "FK_wishlists_cliente",
      `ALTER TABLE "wishlists" ADD CONSTRAINT "FK_wishlists_cliente" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "wishlists"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "resenas"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "facturas"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "detalles_reserva"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reservas"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "clientes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "usuarios"`);
  }
}
