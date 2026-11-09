import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, In, Repository } from "typeorm";
import { DatoFacturacion } from "./billing-profile.entities";

export type TipoIdentificacion =
  "CEDULA" | "RUC" | "PASAPORTE" | "CONSUMIDOR_FINAL";

export const CONSUMIDOR_FINAL = "9999999999999";

// Deduce el tipo del formato; null si el documento no sirve para facturar.
export function tipoIdentificacion(
  documento: string | null | undefined,
): [TipoIdentificacion, string] | null {
  if (!documento) return null;
  const d = documento.toUpperCase();
  if (d === CONSUMIDOR_FINAL) return ["CONSUMIDOR_FINAL", d];
  if (/^[0-9]{10}$/.test(d)) return ["CEDULA", d];
  if (/^[0-9]{13}$/.test(d)) return ["RUC", d];
  if (/^[A-Z0-9]{5,20}$/.test(d)) return ["PASAPORTE", d];
  return null;
}

@Injectable()
export class BillingProfileService {
  constructor(
    @InjectRepository(DatoFacturacion)
    private readonly datos: Repository<DatoFacturacion>,
  ) {}

  async crearPrincipal(
    usuId: number,
    documento: string | null | undefined,
    razonSocial: string,
    correo: string,
    telefono: string | null,
    manager: EntityManager,
  ): Promise<void> {
    const ident = tipoIdentificacion(documento);
    if (!ident || ident[0] === "CONSUMIDOR_FINAL") return;
    await manager.insert(DatoFacturacion, {
      usu_id: usuId,
      dfa_tipo_identificacion: ident[0],
      dfa_identificacion: ident[1],
      dfa_razon_social: razonSocial.slice(0, 150),
      dfa_correo: correo,
      dfa_telefono:
        telefono && /^\+?[0-9]{7,15}$/.test(telefono) ? telefono : null,
      dfa_es_principal: true,
    });
  }

  async principales(usuIds: number[]): Promise<Map<number, DatoFacturacion>> {
    if (!usuIds.length) return new Map();
    const filas = await this.datos.find({
      where: { usu_id: In(usuIds), dfa_es_principal: true, dfa_activo: true },
    });
    return new Map(filas.map((d) => [d.usu_id, d]));
  }

  activos(usuId: number): Promise<DatoFacturacion[]> {
    return this.datos.find({
      where: { usu_id: usuId, dfa_activo: true },
      order: { dfa_es_principal: "DESC" },
    });
  }

  principal(
    usuId: number,
    manager?: EntityManager,
  ): Promise<DatoFacturacion | null> {
    return (manager ?? this.datos.manager).findOne(DatoFacturacion, {
      where: { usu_id: usuId, dfa_es_principal: true, dfa_activo: true },
    });
  }
}
