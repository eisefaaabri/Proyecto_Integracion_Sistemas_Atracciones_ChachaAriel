import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Taxonomía de categorías con banderas de inclusión (RDA2 §6) y acuerdo
 * comercial de promociones con Booking (RDA2 §9). Siembra una taxonomía
 * inicial; el acuerdo queda sin responder hasta que el ADMIN lo complete.
 */
export class CategoriasPromociones1820000000002 implements MigrationInterface {
  name = "CategoriasPromociones1820000000002";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "categorias" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "nombre" character varying(100) NOT NULL,
        "slug" character varying(100) NOT NULL,
        "descripcion" text,
        "icono" character varying(50),
        "incluye_comida" boolean NOT NULL DEFAULT false,
        "incluye_transporte" boolean NOT NULL DEFAULT false,
        "incluye_guia" boolean NOT NULL DEFAULT false,
        "orden" integer NOT NULL DEFAULT 0,
        "padre_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_categorias" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_categorias_slug" UNIQUE ("slug"),
        CONSTRAINT "FK_categorias_padre" FOREIGN KEY ("padre_id")
          REFERENCES "categorias"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_categorias_padre_id" ON "categorias" ("padre_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "contrato_promociones" (
        "id" smallint NOT NULL DEFAULT 1,
        "permite_promociones" boolean NOT NULL DEFAULT false,
        "porcentaje_descuento_maximo" numeric(5,2) NOT NULL DEFAULT 0,
        "destinos_habilitados" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "fecha_acuerdo" date,
        "vigencia_hasta" date,
        "condiciones_combo" text,
        "contacto_nombre" character varying(150),
        "contacto_email" character varying(150),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_contrato_promociones" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_contrato_promociones_unico" CHECK ("id" = 1),
        CONSTRAINT "CHK_contrato_promociones_porcentaje"
          CHECK ("porcentaje_descuento_maximo" BETWEEN 0 AND 50)
      )
    `);

    await queryRunner.query(`
      INSERT INTO "categorias"
        ("nombre", "slug", "descripcion", "icono", "incluye_comida", "incluye_transporte", "incluye_guia", "orden")
      VALUES
        ('Tours y experiencias guiadas', 'tours-experiencias', 'Recorridos con guía por ciudades y sus alrededores.', 'compass', false, true, true, 1),
        ('Naturaleza y aventura', 'naturaleza-aventura', 'Volcanes, bosques, islas y actividades al aire libre.', 'mountain', false, true, true, 2),
        ('Cultura y museos', 'cultura-museos', 'Museos, sitios arqueológicos y centros históricos.', 'landmark', false, false, false, 3)
      ON CONFLICT ("slug") DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "categorias"
        ("nombre", "slug", "descripcion", "icono", "incluye_comida", "incluye_transporte", "incluye_guia", "orden", "padre_id")
      SELECT v.nombre, v.slug, v.descripcion, v.icono, v.comida, v.transporte, v.guia, v.orden, p.id
      FROM (VALUES
        ('Centros históricos', 'centros-historicos', 'Caminatas por los cascos coloniales de Quito y Cuenca.', 'building', false, false, true, 1, 'tours-experiencias'),
        ('Gastronomía y cacao', 'gastronomia-cacao', 'Degustaciones de comida típica, cacao y café de origen.', 'utensils', true, true, true, 2, 'tours-experiencias'),
        ('Volcanes y montaña', 'volcanes-montana', 'Excursiones al Cotopaxi, Quilotoa y Chimborazo.', 'mountain-snow', true, true, true, 1, 'naturaleza-aventura'),
        ('Islas y vida marina', 'islas-vida-marina', 'Snorkel, playas y fauna de Galápagos y la costa.', 'waves', true, true, true, 2, 'naturaleza-aventura')
      ) AS v(nombre, slug, descripcion, icono, comida, transporte, guia, orden, padre_slug)
      JOIN "categorias" p ON p.slug = v.padre_slug
      ON CONFLICT ("slug") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "contrato_promociones"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "categorias"`);
  }
}
