import { MigrationInterface, QueryRunner } from "typeorm";
import { SCHEMAS } from "./1830000000000-EsquemasMicroservicios";

/**
 * Igual que SupabaseRls1820000000005, para los esquemas de microservicios y `legacy`:
 * RLS activo sin políticas y sin permisos para anon/authenticated. El backend se conecta
 * como dueño de las tablas y RLS no le aplica. Fuera de Supabase no hace nada.
 */
export class SupabaseRlsEsquemas1830000000002 implements MigrationInterface {
  name = "SupabaseRlsEsquemas1830000000002";

  public async up(q: QueryRunner): Promise<void> {
    const esquemas = [...SCHEMAS, "legacy"].map((s) => `'${s}'`).join(", ");
    await q.query(`
      DO $$
      DECLARE t record; s text;
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          RETURN;
        END IF;
        FOR t IN SELECT schemaname, tablename FROM pg_tables WHERE schemaname IN (${esquemas}) LOOP
          EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', t.schemaname, t.tablename);
          EXECUTE format('REVOKE ALL ON TABLE %I.%I FROM anon, authenticated', t.schemaname, t.tablename);
        END LOOP;
        FOR s IN SELECT nspname FROM pg_namespace WHERE nspname IN (${esquemas}) LOOP
          EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA %I FROM anon, authenticated', s);
          EXECUTE format('REVOKE USAGE ON SCHEMA %I FROM anon, authenticated', s);
          EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL ON TABLES FROM anon, authenticated', s);
        END LOOP;
      END $$
    `);
  }

  // No se restauran permisos de anon (ver SupabaseRls1820000000005).
  public async down(): Promise<void> {}
}
