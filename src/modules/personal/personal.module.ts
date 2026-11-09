import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module";
import { RolesGuard } from "../auth/roles.guard";
import { PersonalService } from "./personal.service";
import { PersonalController } from "./personal.controller";

@Module({
  imports: [IdentityModule],
  controllers: [PersonalController],
  providers: [PersonalService, RolesGuard],
})
export class PersonalModule {}
