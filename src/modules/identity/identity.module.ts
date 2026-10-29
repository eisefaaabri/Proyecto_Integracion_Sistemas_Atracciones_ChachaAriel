import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Rol, Usuario, UsuarioRol } from "./identity.entities";
import { IdentityService } from "./identity.service";

@Module({
  imports: [TypeOrmModule.forFeature([Rol, Usuario, UsuarioRol])],
  providers: [IdentityService],
  exports: [IdentityService],
})
export class IdentityModule {}
