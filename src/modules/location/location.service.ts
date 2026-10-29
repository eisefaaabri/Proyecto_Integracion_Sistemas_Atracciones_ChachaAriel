import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { Aeropuerto, Ciudad } from "./location.entities";

@Injectable()
export class LocationService {
  constructor(
    @InjectRepository(Aeropuerto)
    private readonly aeropuertos: Repository<Aeropuerto>,
    @InjectRepository(Ciudad) private readonly ciudades: Repository<Ciudad>,
  ) {}

  aeropuerto(codigo: string): Promise<Aeropuerto | null> {
    return this.aeropuertos.findOne({
      where: { aer_codigo: codigo.trim().toUpperCase(), aer_activo: true },
      relations: { ciudad: true },
    });
  }

  async nombresCiudad(ids: number[]): Promise<Map<number, string>> {
    if (!ids.length) return new Map();
    const filas = await this.ciudades.find({
      where: { ciu_id: In([...new Set(ids)]) },
    });
    return new Map(filas.map((c) => [c.ciu_id, c.ciu_nombre]));
  }
}
