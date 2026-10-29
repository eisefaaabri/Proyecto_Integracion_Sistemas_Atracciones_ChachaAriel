import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ValidationPipe, VersioningType, Logger } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import helmet from "helmet";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { correlationIdMiddleware } from "./common/middleware/correlation-id.middleware";

async function bootstrap() {
  const logger = new Logger("Bootstrap");
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // 1. Apagado Limpio (Graceful Shutdown)
  app.enableShutdownHooks();

  app.use(correlationIdMiddleware);

  // 2. Helmet para cabeceras de seguridad permitiendo Swagger UI
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  // 3. Prefijo Global y Soporte Multi-versión (v2 para frontend legacy, v3 para Booking Prototipo)
  app.setGlobalPrefix("api");
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: ["2", "3"],
  });

  // 4. CORS Habilitado para Red Tailscale (100.x.x.x) y Desarrollo Local
  app.enableCors({
    origin: true,
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
    credentials: true,
    allowedHeaders: [
      "Origin",
      "X-Requested-With",
      "Content-Type",
      "Accept",
      "Authorization",
      "Idempotency-Key",
      "X-Correlation-Id",
      "x-correlation-id",
      "X-API-Key",
      "X-Node-Id",
      "Cache-Control",
      "Pragma",
    ],
    exposedHeaders: [
      "Location",
      "X-Correlation-Id",
      "Idempotency-Key",
      "X-API-Deprecation-Date",
    ],
  });

  // 5. Filtro Global de Excepciones (RFC 7807 Problem Details)
  app.useGlobalFilters(new HttpExceptionFilter());

  // 6. Validación Global de DTOs con saneamiento
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // 7. Documentación OpenAPI / Swagger v3.0.0
  const swaggerEnabled =
    configService.get<string>("SWAGGER_ENABLED", "true") === "true";
  const isProduction = configService.get<string>("NODE_ENV") === "production";
  if (!isProduction || swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle("API de Atracciones Turísticas — Integración RDA2")
      .setDescription(
        "Microservicio de Atracciones (Ecuatravel) integrado con Booking Prototipo.\n" +
          "Gestiona el catálogo de tours, disponibilidad de aforo en tiempo real y transacciones de reserva.\n\n" +
          "Endpoints de reserva exigen la cabecera `Idempotency-Key` (UUID v4) y propagan `X-Correlation-Id`.",
      )
      .setVersion("3.0.0")
      .addBearerAuth()
      .addApiKey(
        { type: "apiKey", in: "header", name: "X-API-Key" },
        "ApiKeyAuth",
      )
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup("api/docs", app, document, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    });
  }

  // 8. Escucha explícita en 0.0.0.0 para atender tráfico de Tailscale
  const port = configService.get<number>("PORT", 3001);
  const host = configService.get<string>("HOST", "0.0.0.0");
  const tailscaleIp = configService.get<string>(
    "TAILSCALE_LOCAL_IP",
    "100.x.x.x",
  );

  await app.listen(port, host);

  logger.log(
    "==================================================================",
  );
  logger.log(
    ` Servidor activo en entorno:    ${isProduction ? "production" : "dev"}`,
  );
  logger.log(
    ` Escuchando localmente en:       http://localhost:${port}/api/v3`,
  );
  logger.log(
    ` Enlace Tailscale:              http://${tailscaleIp}:${port}/api/v3`,
  );
  logger.log(
    ` Documentación Swagger en vivo: http://${tailscaleIp}:${port}/api/docs`,
  );
  logger.log(
    ` Healthcheck para Booking:      http://${tailscaleIp}:${port}/api/v3/atracciones/health`,
  );
  logger.log(
    "==================================================================",
  );
}

bootstrap();
