import { MigrationInterface, QueryRunner } from "typeorm";

export class Init1791135355549 implements MigrationInterface {
    name = 'Init1791135355549'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "vuelos" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "aerolinea" character varying(150) NOT NULL, "codigoVuelo" character varying(20) NOT NULL, "origenIATA" character varying(10) NOT NULL, "destinoIATA" character varying(10) NOT NULL, "fechaSalida" TIMESTAMP NOT NULL, "fechaLlegada" TIMESTAMP NOT NULL, "precioBase" numeric(10,2) NOT NULL, "asientosDisponibles" integer NOT NULL, CONSTRAINT "PK_f4e1ec4253ec27fa0253b7c6a1a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "autos" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "marca" character varying(100) NOT NULL, "modelo" character varying(100) NOT NULL, "tipo" character varying(50) NOT NULL, "ciudadRecogida" character varying(255) NOT NULL, "precioPorDia" numeric(10,2) NOT NULL, "transmision" character varying(50) NOT NULL, CONSTRAINT "PK_b158e3dd7d86983ddfe1fb71138" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "operators" ("id" integer NOT NULL, "name" character varying(255) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_91c57c457bf3d85869ba86c20d1" UNIQUE ("name"), CONSTRAINT "PK_3d02b3692836893720335a79d1b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "categories" ("id" SERIAL NOT NULL, "name" character varying(100) NOT NULL, CONSTRAINT "UQ_8b0be371d28245da6e4f4b61878" UNIQUE ("name"), CONSTRAINT "PK_24dbc6126a28ff948da33e97d3b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "badges" ("id" SERIAL NOT NULL, "name" character varying(100) NOT NULL, CONSTRAINT "UQ_9c91fc9c4a4ae01712baad1e9f6" UNIQUE ("name"), CONSTRAINT "PK_8a651318b8de577e8e217676466" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "languages" ("id" SERIAL NOT NULL, "code" character varying(10) NOT NULL, CONSTRAINT "UQ_7397752718d1c9eb873722ec9b2" UNIQUE ("code"), CONSTRAINT "PK_b517f827ca496b29f4d549c631d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "atraccion_locations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "atraccion_id" uuid NOT NULL, "address" character varying(500) NOT NULL, "city" integer NOT NULL, "country" character varying(10) NOT NULL, "latitude" numeric(10,6) NOT NULL, "longitude" numeric(10,6) NOT NULL, "type" character varying(50), CONSTRAINT "CHK_longitude_range" CHECK ("longitude" >= -180 AND "longitude" <= 180), CONSTRAINT "CHK_latitude_range" CHECK ("latitude" >= -90 AND "latitude" <= 90), CONSTRAINT "PK_daa698368f82bae129d945afc0c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "atraccion_photos" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "atraccion_id" uuid NOT NULL, "url" character varying(2048) NOT NULL, "display_order" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_ac92faa5851bd9947a181b31d76" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "atraccion_includes" ("id" SERIAL NOT NULL, "atraccion_id" uuid NOT NULL, "description" character varying(255) NOT NULL, CONSTRAINT "PK_19b516762e8c2fd4d9a3ec27d90" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."atracciones_product_type_enum" AS ENUM('SINGLE_TICKET', 'GUIDED_TOUR', 'PACKAGE')`);
        await queryRunner.query(`CREATE TABLE "atracciones" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(255) NOT NULL, "long_description" text, "duration" character varying(50), "price_currency" character varying(3) NOT NULL DEFAULT 'USD', "price_total" numeric(10,2) NOT NULL, "operator_id" integer NOT NULL, "product_type" "public"."atracciones_product_type_enum" NOT NULL DEFAULT 'SINGLE_TICKET', "free_cancellation" boolean NOT NULL DEFAULT false, "rating_score" numeric(3,1), "rating_count" integer NOT NULL DEFAULT '0', "url_web" character varying(2048), "url_app" character varying(2048), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "UQ_atraccion_name_operator" UNIQUE ("name", "operator_id"), CONSTRAINT "CHK_rating_count" CHECK ("rating_count" >= 0), CONSTRAINT "CHK_rating_range" CHECK ("rating_score" IS NULL OR ("rating_score" >= 0 AND "rating_score" <= 5)), CONSTRAINT "CHK_price_positive" CHECK ("price_total" > 0), CONSTRAINT "PK_3080af2af8001280aa8fc7f87a5" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."reservations_status_enum" AS ENUM('CONFIRMED', 'PENDING', 'CANCELLED')`);
        await queryRunner.query(`CREATE TABLE "reservations" ("reservation_id" uuid NOT NULL DEFAULT uuid_generate_v4(), "atraccion_id" uuid NOT NULL, "status" "public"."reservations_status_enum" NOT NULL DEFAULT 'PENDING', "date" date NOT NULL, "time" character varying(10), "ticket_count" integer NOT NULL, "customer_name" character varying(255) NOT NULL, "customer_email" character varying(255), "total_price_currency" character varying(3) NOT NULL DEFAULT 'USD', "total_price_total" numeric(10,2) NOT NULL DEFAULT '0', "idempotency_key" uuid NOT NULL, "cancel_reason" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_6b0a68b6082ee14612e6b5cbc44" UNIQUE ("idempotency_key"), CONSTRAINT "CHK_total_price" CHECK ("total_price_total" >= 0), CONSTRAINT "CHK_ticket_count" CHECK ("ticket_count" >= 1), CONSTRAINT "PK_414a88401d7ab4ce981a69784bb" PRIMARY KEY ("reservation_id"))`);
        await queryRunner.query(`CREATE TABLE "alojamientos" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "nombre" character varying(255) NOT NULL, "destino" character varying(255) NOT NULL, "precioPorNoche" numeric(10,2) NOT NULL, "capacidadAdultos" integer NOT NULL, "capacidadNinos" integer NOT NULL, "habitaciones" integer NOT NULL, "tienePiscina" boolean NOT NULL, CONSTRAINT "PK_2eef8a78804653e05eee27b6618" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "atraccion_categories" ("atraccionesId" uuid NOT NULL, "categoriesId" integer NOT NULL, CONSTRAINT "PK_fac8122755478cbf7d7cf21b2c5" PRIMARY KEY ("atraccionesId", "categoriesId"))`);
        await queryRunner.query(`CREATE INDEX "IDX_29528871e15ffca1417dcb2e45" ON "atraccion_categories" ("atraccionesId") `);
        await queryRunner.query(`CREATE INDEX "IDX_029a3a4dab2d30bcd5a3242c8d" ON "atraccion_categories" ("categoriesId") `);
        await queryRunner.query(`CREATE TABLE "atraccion_badges" ("atraccionesId" uuid NOT NULL, "badgesId" integer NOT NULL, CONSTRAINT "PK_83a41be06ad9990683ba755846b" PRIMARY KEY ("atraccionesId", "badgesId"))`);
        await queryRunner.query(`CREATE INDEX "IDX_7a0b5691c639175e9bb920c331" ON "atraccion_badges" ("atraccionesId") `);
        await queryRunner.query(`CREATE INDEX "IDX_101079ba9f85e6ca60c595e227" ON "atraccion_badges" ("badgesId") `);
        await queryRunner.query(`CREATE TABLE "atraccion_languages" ("atraccionesId" uuid NOT NULL, "languagesId" integer NOT NULL, CONSTRAINT "PK_556f2dc019f85a5853b104f1bd8" PRIMARY KEY ("atraccionesId", "languagesId"))`);
        await queryRunner.query(`CREATE INDEX "IDX_950ce0e01f6c86ce5f0b9af937" ON "atraccion_languages" ("atraccionesId") `);
        await queryRunner.query(`CREATE INDEX "IDX_85e6750a45f5287e6f693bf44b" ON "atraccion_languages" ("languagesId") `);
        await queryRunner.query(`ALTER TABLE "atraccion_locations" ADD CONSTRAINT "FK_af5a9761bed3573b6fe1122ede0" FOREIGN KEY ("atraccion_id") REFERENCES "atracciones"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "atraccion_photos" ADD CONSTRAINT "FK_afd74f3ea6980354971efe08293" FOREIGN KEY ("atraccion_id") REFERENCES "atracciones"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "atraccion_includes" ADD CONSTRAINT "FK_eac0b8ec94609d046b3f4d22d77" FOREIGN KEY ("atraccion_id") REFERENCES "atracciones"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "atracciones" ADD CONSTRAINT "FK_31f95706a5eda6ef5871fe6e442" FOREIGN KEY ("operator_id") REFERENCES "operators"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "reservations" ADD CONSTRAINT "FK_1520f7aa69ae1a1ced5bf3e3aea" FOREIGN KEY ("atraccion_id") REFERENCES "atracciones"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "atraccion_categories" ADD CONSTRAINT "FK_29528871e15ffca1417dcb2e458" FOREIGN KEY ("atraccionesId") REFERENCES "atracciones"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "atraccion_categories" ADD CONSTRAINT "FK_029a3a4dab2d30bcd5a3242c8db" FOREIGN KEY ("categoriesId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "atraccion_badges" ADD CONSTRAINT "FK_7a0b5691c639175e9bb920c3313" FOREIGN KEY ("atraccionesId") REFERENCES "atracciones"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "atraccion_badges" ADD CONSTRAINT "FK_101079ba9f85e6ca60c595e227f" FOREIGN KEY ("badgesId") REFERENCES "badges"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "atraccion_languages" ADD CONSTRAINT "FK_950ce0e01f6c86ce5f0b9af9371" FOREIGN KEY ("atraccionesId") REFERENCES "atracciones"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "atraccion_languages" ADD CONSTRAINT "FK_85e6750a45f5287e6f693bf44b8" FOREIGN KEY ("languagesId") REFERENCES "languages"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "atraccion_languages" DROP CONSTRAINT "FK_85e6750a45f5287e6f693bf44b8"`);
        await queryRunner.query(`ALTER TABLE "atraccion_languages" DROP CONSTRAINT "FK_950ce0e01f6c86ce5f0b9af9371"`);
        await queryRunner.query(`ALTER TABLE "atraccion_badges" DROP CONSTRAINT "FK_101079ba9f85e6ca60c595e227f"`);
        await queryRunner.query(`ALTER TABLE "atraccion_badges" DROP CONSTRAINT "FK_7a0b5691c639175e9bb920c3313"`);
        await queryRunner.query(`ALTER TABLE "atraccion_categories" DROP CONSTRAINT "FK_029a3a4dab2d30bcd5a3242c8db"`);
        await queryRunner.query(`ALTER TABLE "atraccion_categories" DROP CONSTRAINT "FK_29528871e15ffca1417dcb2e458"`);
        await queryRunner.query(`ALTER TABLE "reservations" DROP CONSTRAINT "FK_1520f7aa69ae1a1ced5bf3e3aea"`);
        await queryRunner.query(`ALTER TABLE "atracciones" DROP CONSTRAINT "FK_31f95706a5eda6ef5871fe6e442"`);
        await queryRunner.query(`ALTER TABLE "atraccion_includes" DROP CONSTRAINT "FK_eac0b8ec94609d046b3f4d22d77"`);
        await queryRunner.query(`ALTER TABLE "atraccion_photos" DROP CONSTRAINT "FK_afd74f3ea6980354971efe08293"`);
        await queryRunner.query(`ALTER TABLE "atraccion_locations" DROP CONSTRAINT "FK_af5a9761bed3573b6fe1122ede0"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_85e6750a45f5287e6f693bf44b"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_950ce0e01f6c86ce5f0b9af937"`);
        await queryRunner.query(`DROP TABLE "atraccion_languages"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_101079ba9f85e6ca60c595e227"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_7a0b5691c639175e9bb920c331"`);
        await queryRunner.query(`DROP TABLE "atraccion_badges"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_029a3a4dab2d30bcd5a3242c8d"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_29528871e15ffca1417dcb2e45"`);
        await queryRunner.query(`DROP TABLE "atraccion_categories"`);
        await queryRunner.query(`DROP TABLE "alojamientos"`);
        await queryRunner.query(`DROP TABLE "reservations"`);
        await queryRunner.query(`DROP TYPE "public"."reservations_status_enum"`);
        await queryRunner.query(`DROP TABLE "atracciones"`);
        await queryRunner.query(`DROP TYPE "public"."atracciones_product_type_enum"`);
        await queryRunner.query(`DROP TABLE "atraccion_includes"`);
        await queryRunner.query(`DROP TABLE "atraccion_photos"`);
        await queryRunner.query(`DROP TABLE "atraccion_locations"`);
        await queryRunner.query(`DROP TABLE "languages"`);
        await queryRunner.query(`DROP TABLE "badges"`);
        await queryRunner.query(`DROP TABLE "categories"`);
        await queryRunner.query(`DROP TABLE "operators"`);
        await queryRunner.query(`DROP TABLE "autos"`);
        await queryRunner.query(`DROP TABLE "vuelos"`);
    }

}
