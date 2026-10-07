import { SetMetadata } from "@nestjs/common";

export const ROLES_KEY = "roles";

/** Declara los roles permitidos para una ruta. Sin @Roles, la ruta es pública (solo JWT). */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
