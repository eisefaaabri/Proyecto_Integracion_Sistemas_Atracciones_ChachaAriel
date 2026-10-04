import { MigrationInterface, QueryRunner } from "typeorm";

export class Init1791133255072 implements MigrationInterface {
    name = 'Init1791133255072'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "vuelos" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "aerolinea" character varying(150) NOT NULL, "codigoVuelo" character varying(20) NOT NULL, "origenIATA" character varying(10) NOT NULL, "destinoIATA" character varying(10) NOT NULL, "fechaSalida" TIMESTAMP NOT NULL, "fechaLlegada" TIMESTAMP NOT NULL, "precioBase" numeric(10,2) NOT NULL, "asientosDisponibles" integer NOT NULL, CONSTRAINT "PK_f4e1ec4253ec27fa0253b7c6a1a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "autos" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "marca" character varying(100) NOT NULL, "modelo" character varying(100) NOT NULL, "tipo" character varying(50) NOT NULL, "ciudadRecogida" character varying(255) NOT NULL, "precioPorDia" numeric(10,2) NOT NULL, "transmision" character varying(50) NOT NULL, CONSTRAINT "PK_b158e3dd7d86983ddfe1fb71138" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "alojamientos" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "nombre" character varying(255) NOT NULL, "destino" character varying(255) NOT NULL, "precioPorNoche" numeric(10,2) NOT NULL, "capacidadAdultos" integer NOT NULL, "capacidadNinos" integer NOT NULL, "habitaciones" integer NOT NULL, "tienePiscina" boolean NOT NULL, CONSTRAINT "PK_2eef8a78804653e05eee27b6618" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "alojamientos"`);
        await queryRunner.query(`DROP TABLE "autos"`);
        await queryRunner.query(`DROP TABLE "vuelos"`);
    }

}
