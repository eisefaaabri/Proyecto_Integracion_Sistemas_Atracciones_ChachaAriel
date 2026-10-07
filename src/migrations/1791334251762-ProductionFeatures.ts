import { MigrationInterface, QueryRunner } from "typeorm";

export class ProductionFeatures1791334251762 implements MigrationInterface {
    name = 'ProductionFeatures1791334251762'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "wishlists" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "added_at" TIMESTAMP NOT NULL DEFAULT now(), "atraccion_id" uuid, "cliente_id" uuid, CONSTRAINT "PK_d0a37f2848c5d268d315325f359" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_93d2a3f5b1b2610c3d0346775c" ON "wishlists" ("cliente_id", "atraccion_id") `);
        await queryRunner.query(`CREATE TABLE "resenas" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "score" integer NOT NULL, "comment" text NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "atraccion_id" uuid, "cliente_id" uuid, CONSTRAINT "PK_8f2c05f4f9be4dfe60ef900d000" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_115d9f83396c39c3d3dedd59bb" ON "resenas" ("atraccion_id") `);
        await queryRunner.query(`ALTER TABLE "atracciones" ADD "foto_url" text`);
        await queryRunner.query(`ALTER TABLE "atracciones" ADD "deleted_at" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "facturas" ADD "transaction_id" character varying(100)`);
        await queryRunner.query(`ALTER TABLE "facturas" ADD "metodo_pago" character varying(50)`);
        await queryRunner.query(`ALTER TABLE "facturas" ADD "receipt_url" text`);
        await queryRunner.query(`ALTER TABLE "wishlists" ADD CONSTRAINT "FK_b7f866d41ee70d66e88275fda77" FOREIGN KEY ("atraccion_id") REFERENCES "atracciones"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "wishlists" ADD CONSTRAINT "FK_9b95dc94963a6ce6c79fd58921d" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "resenas" ADD CONSTRAINT "FK_115d9f83396c39c3d3dedd59bbb" FOREIGN KEY ("atraccion_id") REFERENCES "atracciones"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "resenas" ADD CONSTRAINT "FK_81bb93f8858af7a04f2e507d120" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "resenas" DROP CONSTRAINT "FK_81bb93f8858af7a04f2e507d120"`);
        await queryRunner.query(`ALTER TABLE "resenas" DROP CONSTRAINT "FK_115d9f83396c39c3d3dedd59bbb"`);
        await queryRunner.query(`ALTER TABLE "wishlists" DROP CONSTRAINT "FK_9b95dc94963a6ce6c79fd58921d"`);
        await queryRunner.query(`ALTER TABLE "wishlists" DROP CONSTRAINT "FK_b7f866d41ee70d66e88275fda77"`);
        await queryRunner.query(`ALTER TABLE "facturas" DROP COLUMN "receipt_url"`);
        await queryRunner.query(`ALTER TABLE "facturas" DROP COLUMN "metodo_pago"`);
        await queryRunner.query(`ALTER TABLE "facturas" DROP COLUMN "transaction_id"`);
        await queryRunner.query(`ALTER TABLE "atracciones" DROP COLUMN "deleted_at"`);
        await queryRunner.query(`ALTER TABLE "atracciones" DROP COLUMN "foto_url"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_115d9f83396c39c3d3dedd59bb"`);
        await queryRunner.query(`DROP TABLE "resenas"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_93d2a3f5b1b2610c3d0346775c"`);
        await queryRunner.query(`DROP TABLE "wishlists"`);
    }

}
