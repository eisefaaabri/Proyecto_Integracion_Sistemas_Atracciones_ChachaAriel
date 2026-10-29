import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Supabase publica el esquema public en su Data API con los roles anon y
 * authenticated (la clave anon es pública). Las tablas de esta app solo se usan
 * a través del backend, así que se activa RLS sin políticas y se retiran los
 * permisos de esos roles. El backend se conecta como dueño de las tablas y RLS
 * no le aplica. Fuera de Supabase (sin rol anon) no hace nada.
 *
 * Las tablas que creen migraciones futuras quedan sin permisos para anon por
 * los default privileges, pero conviene activarles RLS igual.
 */
export class SupabaseRls1820000000005 implements MigrationInterface {
  name = "SupabaseRls1820000000005";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE t record;
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          RETURN;
        END IF;
        FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
          EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
          EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t.tablename);
        END LOOP;
        REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
      END $$
    `);
  }

  // No se restauran los permisos de anon: dejar las tablas expuestas no es un
  // estado al que convenga volver automáticamente.
  public async down(): Promise<void> {}
}
