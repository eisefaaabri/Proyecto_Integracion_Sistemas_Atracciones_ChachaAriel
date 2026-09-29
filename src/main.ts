import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/v1');

  app.enableCors();

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

  const config = new DocumentBuilder()
    .setTitle('API de Atracciones Turísticas')
    .setDescription(
      'Microservicio de Atracciones del Marketplace Turístico.\n' +
      'Gestiona el catálogo de tours (GUIDED_TOUR), paquetes (PACKAGE) y entradas individuales (SINGLE_TICKET),\n' +
      'la disponibilidad de cupos y el ciclo de vida transaccional completo de las reservas.\n\n' +
      'Todos los endpoints transaccionales exigen la cabecera `Idempotency-Key` (UUID v4) para\n' +
      'garantizar operaciones idempotentes y evitar reservas o cancelaciones duplicadas.\n' +
      'Los errores siguen el estándar RFC 7807 (application/problem+json).',
    )
    .setVersion('1.2.0')
    .addOAuth2({
      type: 'oauth2',
      flows: {
        authorizationCode: {
          authorizationUrl: 'https://auth.booking-hub.com/oauth2/authorize',
          tokenUrl: 'https://auth.booking-hub.com/oauth2/token',
          scopes: {
            'attractions:read': 'Leer catálogo y detalles',
            'attractions:book': 'Hacer reservas',
            'attractions:write': 'Crear y mantener inventario',
            'attractions:cancel': 'Cancelar reservas',
          },
        },
      },
    })
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.PORT || 3000);
}
bootstrap();
