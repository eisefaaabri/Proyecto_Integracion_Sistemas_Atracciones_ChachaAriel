import { MigrationInterface, QueryRunner } from 'typeorm';

export class RefactorAtraccionId1730000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Encontrar los nombres de las restricciones (Foreign Keys) automáticamente
    const foreignKeys = await queryRunner.query(`
      SELECT tc.table_name, tc.constraint_name, kcu.column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' AND kcu.column_name IN ('atraccion_id', 'atraccionesId');
    `);

    // 2. Eliminar las restricciones de llave foránea temporalmente
    for (const fk of foreignKeys) {
      await queryRunner.query(`ALTER TABLE "${fk.table_name}" DROP CONSTRAINT "${fk.constraint_name}";`);
    }

    // 3. Cambiar el tipo de dato de UUID a VARCHAR(50) en todas las tablas afectadas
    await queryRunner.query(`ALTER TABLE "atracciones" ALTER COLUMN "id" TYPE varchar(50);`);
    
    // Cambiar tipo en las tablas relacionadas que encontremos
    for (const fk of foreignKeys) {
      await queryRunner.query(`ALTER TABLE "${fk.table_name}" ALTER COLUMN "${fk.column_name}" TYPE varchar(50);`);
    }

    // 4. Actualizar los datos (Añadir prefijo ATR_)
    await queryRunner.query(`UPDATE "atracciones" SET "id" = 'ATR_' || "id" WHERE "id" NOT LIKE 'ATR_%';`);
    
    for (const fk of foreignKeys) {
      await queryRunner.query(`UPDATE "${fk.table_name}" SET "${fk.column_name}" = 'ATR_' || "${fk.column_name}" WHERE "${fk.column_name}" NOT LIKE 'ATR_%';`);
    }

    // 5. Restaurar las llaves foráneas con ON UPDATE CASCADE para mayor seguridad a futuro
    for (const fk of foreignKeys) {
      await queryRunner.query(`
        ALTER TABLE "${fk.table_name}"
        ADD CONSTRAINT "${fk.constraint_name}"
        FOREIGN KEY ("${fk.column_name}") REFERENCES "atracciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Para revertir (down), se quitaría el prefijo y se volvería a castear a UUID
    const foreignKeys = await queryRunner.query(`
      SELECT tc.table_name, tc.constraint_name, kcu.column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' AND kcu.column_name IN ('atraccion_id', 'atraccionesId');
    `);

    for (const fk of foreignKeys) {
      await queryRunner.query(`ALTER TABLE "${fk.table_name}" DROP CONSTRAINT "${fk.constraint_name}";`);
    }

    await queryRunner.query(`UPDATE "atracciones" SET "id" = REPLACE("id", 'ATR_', '');`);
    
    for (const fk of foreignKeys) {
      await queryRunner.query(`UPDATE "${fk.table_name}" SET "${fk.column_name}" = REPLACE("${fk.column_name}", 'ATR_', '');`);
    }

    await queryRunner.query(`ALTER TABLE "atracciones" ALTER COLUMN "id" TYPE uuid USING "id"::uuid;`);
    
    for (const fk of foreignKeys) {
      await queryRunner.query(`ALTER TABLE "${fk.table_name}" ALTER COLUMN "${fk.column_name}" TYPE uuid USING "${fk.column_name}"::uuid;`);
      
      await queryRunner.query(`
        ALTER TABLE "${fk.table_name}"
        ADD CONSTRAINT "${fk.constraint_name}"
        FOREIGN KEY ("${fk.column_name}") REFERENCES "atracciones"("id") ON DELETE CASCADE;
      `);
    }
  }
}
