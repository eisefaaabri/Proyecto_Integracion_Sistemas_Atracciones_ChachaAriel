import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";

import { CommonModule } from "./common/common.module";
import { AtraccionesModule } from "./modules/atracciones/atracciones.module";
import { AuthModule } from "./modules/auth/auth.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
    }),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: "postgres",
        url: configService.get<string>("DATABASE_URL"),
        autoLoadEntities: true,
        synchronize: configService.get<string>("DB_SYNCHRONIZE") === "true",
        migrationsRun: true,
        migrations: [__dirname + "/migrations/*{.ts,.js}"],
      }),
    }),

    CommonModule,
    AuthModule,
    AtraccionesModule,

    ThrottlerModule.forRoot([
      {
        name: "default",
        ttl: 60_000,
        limit: 100,
      },
    ]),
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
