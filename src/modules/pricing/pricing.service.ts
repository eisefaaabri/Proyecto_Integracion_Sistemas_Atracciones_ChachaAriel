import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import {
  ContratoPromocion,
  ContratoPromocionDestino,
  Tarifa,
  TipoTarifa,
} from "./pricing.entities";

export type Precios = Record<TipoTarifa, number>;

// Descuentos por tipo de pasajero sobre la tarifa adulto (contrato v3).
export const FACTOR_TARIFA: Record<TipoTarifa, number> = {
  [TipoTarifa.ADULTO]: 1,
  [TipoTarifa.NINO]: 0.5,
  [TipoTarifa.MAYOR]: 0.7,
  [TipoTarifa.INFANTE]: 0,
};

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface DatosContrato {
  permite: boolean;
  porcentaje: number;
  destinos: string[];
  fechaAcuerdo: string;
  vigenciaHasta: string | null;
  condiciones: string | null;
  contactoNombre: string | null;
  contactoCorreo: string | null;
}

@Injectable()
export class PricingService {
  constructor(
    @InjectRepository(Tarifa) private readonly tarifas: Repository<Tarifa>,
    @InjectRepository(ContratoPromocion)
    private readonly contratos: Repository<ContratoPromocion>,
  ) {}

  // Tarifas vigentes a una fecha (hoy por defecto) para varias atracciones.
  async vigentes(
    atrIds: number[],
    fecha?: string,
    manager?: EntityManager,
  ): Promise<Map<number, Precios>> {
    const resultado = new Map<number, Precios>();
    if (!atrIds.length) return resultado;
    const filas: {
      atr_id: string;
      tar_tipo: TipoTarifa;
      tar_precio: string;
    }[] = await (manager ?? this.tarifas.manager).query(
      `SELECT DISTINCT ON (atr_id, tar_tipo) atr_id, tar_tipo, tar_precio
       FROM ms_pricing.tarifa
       WHERE atr_id = ANY($1) AND tar_vigente_desde <= COALESCE($2::date, CURRENT_DATE)
         AND (tar_vigente_hasta IS NULL OR tar_vigente_hasta >= COALESCE($2::date, CURRENT_DATE))
       ORDER BY atr_id, tar_tipo, tar_vigente_desde DESC`,
      [[...new Set(atrIds)], fecha ?? null],
    );
    for (const f of filas) {
      const id = Number(f.atr_id);
      const precios = resultado.get(id) ?? ({} as Precios);
      precios[f.tar_tipo] = Number(f.tar_precio);
      resultado.set(id, precios);
    }
    for (const precios of resultado.values()) {
      const adulto = precios[TipoTarifa.ADULTO] ?? 0;
      for (const t of Object.values(TipoTarifa)) {
        if (precios[t] === undefined)
          precios[t] = round2(adulto * FACTOR_TARIFA[t]);
      }
    }
    return resultado;
  }

  // Nueva tarifa base desde hoy: cierra las anteriores y deriva niño/mayor/infante.
  async fijarPrecioBase(
    atrId: number,
    precio: number,
    manager: EntityManager,
  ): Promise<void> {
    for (const tipo of Object.values(TipoTarifa)) {
      await manager.query(
        `UPDATE ms_pricing.tarifa SET tar_vigente_hasta = CURRENT_DATE - 1
         WHERE atr_id = $1 AND tar_tipo = $2 AND tar_vigente_desde < CURRENT_DATE
           AND (tar_vigente_hasta IS NULL OR tar_vigente_hasta >= CURRENT_DATE)`,
        [atrId, tipo],
      );
      await manager.query(
        `INSERT INTO ms_pricing.tarifa (atr_id, tar_tipo, tar_precio, tar_vigente_desde)
         VALUES ($1, $2, $3, CURRENT_DATE)
         ON CONFLICT (atr_id, tar_tipo, tar_vigente_desde) DO UPDATE SET tar_precio = EXCLUDED.tar_precio,
           tar_vigente_hasta = NULL`,
        [atrId, tipo, round2(precio * FACTOR_TARIFA[tipo])],
      );
    }
  }

  // --- Contrato de promociones con Booking ---

  contrato(): Promise<ContratoPromocion | null> {
    return this.contratos.findOne({
      where: { cpr_id: 1 },
      relations: { destinos: true },
      order: { destinos: { cpd_orden: "ASC" } },
    });
  }

  async guardarContrato(d: DatosContrato): Promise<ContratoPromocion> {
    await this.contratos.manager.transaction(async (m) => {
      await m.delete(ContratoPromocionDestino, { cpr_id: 1 });
      await m.save(ContratoPromocion, {
        cpr_id: 1,
        cpr_permite_promociones: d.permite,
        cpr_porcentaje_maximo: d.porcentaje,
        cpr_fecha_acuerdo: d.fechaAcuerdo,
        cpr_vigencia_hasta: d.vigenciaHasta,
        cpr_condiciones: d.condiciones,
        cpr_contacto_nombre: d.contactoNombre,
        cpr_contacto_correo: d.contactoCorreo,
        cpr_actualizado_en: new Date(),
      });
      for (const [orden, nombre] of d.destinos.entries()) {
        await m.insert(ContratoPromocionDestino, {
          cpr_id: 1,
          cpd_nombre: nombre,
          cpd_orden: orden,
        });
      }
    });
    return this.contrato();
  }
}
