import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ValidationPipe, VersioningType } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import helmet from "helmet";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Helmet para cabeceras de seguridad y ocultar X-Powered-By
  app.use(helmet());

  app.setGlobalPrefix("api");
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: "2",
  });

  // CORS dinámico: en producción FRONTEND_URL es obligatorio (origen exacto del frontend).
  let frontendUrl = configService.get<string>("FRONTEND_URL");
  const isProduction = configService.get<string>("NODE_ENV") === "production";
  if (isProduction && !frontendUrl) {
    throw new Error(
      "En producción FRONTEND_URL es obligatorio: URL exacta del frontend para CORS.",
    );
  }
  if (!frontendUrl) frontendUrl = "*";
  app.enableCors({
    origin: frontendUrl,
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
    credentials: true,
  });

  // Filtro Global de Excepciones
  app.useGlobalFilters(new HttpExceptionFilter());

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

  // Swagger solo en desarrollo/pre-producción: no exponer docs en producción.
  if (!isProduction) {
    const config = new DocumentBuilder()
      .setTitle("API de Atracciones Turísticas")
      .setDescription(
        "Microservicio de Atracciones del Marketplace Turístico.\n" +
          "Gestiona el catálogo de tours (GUIDED_TOUR), paquetes (PACKAGE) y entradas individuales (SINGLE_TICKET),\n" +
          "la disponibilidad de cupos y el ciclo de vida transaccional completo de las reservas.\n\n" +
          "Todos los endpoints transaccionales exigen la cabecera `Idempotency-Key` (UUID v4) para\n" +
          "garantizar operaciones idempotentes y evitar reservas o cancelaciones duplicadas.\n" +
          "Los errores siguen el estándar RFC 7807 (application/problem+json).",
      )
      .setVersion("2.0.0")
      .addOAuth2({
        type: "oauth2",
        flows: {
          authorizationCode: {
            authorizationUrl: "https://auth.booking-hub.com/oauth2/authorize",
            tokenUrl: "https://auth.booking-hub.com/oauth2/token",
            scopes: {
              "attractions:read": "Leer catálogo y detalles",
              "attractions:book": "Hacer reservas",
              "attractions:write": "Crear y mantener inventario",
              "attractions:cancel": "Cancelar reservas",
            },
          },
        },
      })
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup("api/docs", app, document);
  }

  const port = configService.get<number>("PORT", 3000);
  await app.listen(port);

  console.log(
    `[API] entorno=${isProduction ? "production" : "dev"} puerto=${port} ` +
      `cors=${frontendUrl}${isProduction ? "" : " docs=/api/docs"}`,
  );
}
bootstrap();

// force restart
