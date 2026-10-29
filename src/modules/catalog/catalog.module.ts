import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  Atraccion,
  AtraccionFoto,
  Categoria,
  Favorito,
  Idioma,
  Inclusion,
  Operador,
  OperadorUsuario,
} from "./catalog.entities";
import { CatalogService } from "./catalog.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Atraccion,
      AtraccionFoto,
      Categoria,
      Favorito,
      Idioma,
      Inclusion,
      Operador,
      OperadorUsuario,
    ]),
  ],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
