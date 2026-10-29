import { ConfigService } from "@nestjs/config";
import { TypeOrmModuleOptions } from "@nestjs/typeorm";
import { join } from "path";

// Con DB_SSL=true el cifrado se controla aquí: se quitan sslmode/sslrootcert de la
// URL porque pg los antepone a la opción `ssl` y "require" exige verificar el
// certificado, que en Supabase está firmado por su propia CA.
function limpiarUrl(url: string | undefined, ssl: boolean): string | undefined {
  if (!url || !ssl) return url;
  try {
    const parsed = new URL(url);
    for (const p of ["sslmode", "sslrootcert", "sslcert", "sslkey", "ssl"]) {
      parsed.searchParams.delete(p);
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

export function buildTypeOrmOptions(
  config: ConfigService,
): TypeOrmModuleOptions {
  const ssl = config.get<string>("DB_SSL") === "true";
  // DB_SSL_CA: certificado PEM de la CA (Supabase → Database Settings). Con él
  // se verifica el servidor; sin él la conexión va cifrada pero sin verificar.
  const ca = config.get<string>("DB_SSL_CA")?.replace(/\\n/g, "\n");

  return {
    type: "postgres",
    url: limpiarUrl(config.get<string>("DATABASE_URL"), ssl),
    ssl: ssl
      ? ca
        ? { ca, rejectUnauthorized: true }
        : { rejectUnauthorized: false }
      : false,
    autoLoadEntities: true,
    synchronize: config.get<string>("DB_SYNCHRONIZE") === "true",
    migrationsRun: true,
    migrations: [join(__dirname, "..", "migrations", "*{.ts,.js}")],
    extra: {
      // El pooler gratuito de Supabase admite pocas conexiones simultáneas.
      max: Number(config.get<string>("DB_POOL_MAX", "10")),
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
    },
  };
}
