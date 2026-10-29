import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { Reembolso } from "./refund.entities";

@Injectable()
export class RefundService {
  constructor(
    @InjectRepository(Reembolso)
    private readonly reembolsos: Repository<Reembolso>,
  ) {}

  async crear(
    d: { pagId: number; numero: string; monto: number; motivo: string | null },
    manager: EntityManager,
  ): Promise<Reembolso> {
    const ahora = new Date();
    const { identifiers } = await manager.insert(Reembolso, {
      pag_id: d.pagId,
      rem_numero: d.numero,
      rem_monto: d.monto,
      rem_motivo: d.motivo?.slice(0, 300) ?? null,
      rem_procesado_en: ahora,
    });
    return manager.findOneOrFail(Reembolso, {
      where: { rem_id: Number(identifiers[0].rem_id) },
    });
  }

  dePago(pagId: number, manager?: EntityManager): Promise<Reembolso | null> {
    return (manager ?? this.reembolsos.manager).findOne(Reembolso, {
      where: { pag_id: pagId },
    });
  }
}
