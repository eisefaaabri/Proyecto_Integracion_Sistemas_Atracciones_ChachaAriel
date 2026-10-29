import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, In, IsNull, Repository } from "typeorm";
import {
  Atraccion,
  AtraccionFoto,
  Categoria,
  EstadoAtraccion,
  Favorito,
  Idioma,
  Inclusion,
  Operador,
} from "./catalog.entities";

export interface DatosAtraccion {
  nombre: string;
  descripcion: string;
  estado: EstadoAtraccion;
  codigoAeropuerto: string;
  ciuId: number;
  latitud: number;
  longitud: number;
  duracionHoras: number | null;
  itinerario: string | null;
  fotoUrl?: string | null;
  incluye?: string[] | null;
}

export interface FiltroAtracciones {
  q?: string;
  aeropuerto?: string;
  soloPublicadas?: boolean;
  page: number;
  limit: number;
}

export function slugify(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200);
}

@Injectable()
export class CatalogService {
  private operadorId: number | null = null;

  constructor(
    @InjectRepository(Atraccion)
    private readonly atracciones: Repository<Atraccion>,
    @InjectRepository(Categoria)
    private readonly categorias: Repository<Categoria>,
    @InjectRepository(Favorito)
    private readonly favoritos: Repository<Favorito>,
  ) {}

  private async operadorEcuatravel(manager: EntityManager): Promise<number> {
    if (!this.operadorId) {
      const op = await manager.findOneOrFail(Operador, {
        where: { ope_codigo: 1 },
      });
      this.operadorId = op.ope_id;
    }
    return this.operadorId;
  }

  private relaciones = {
    fotos: true,
    inclusiones: true,
    categorias: true,
  } as const;

  findByUuid(uuid: string, manager?: EntityManager): Promise<Atraccion | null> {
    return (manager ?? this.atracciones.manager).findOne(Atraccion, {
      where: { atr_uuid: uuid, atr_eliminado_en: IsNull() },
      relations: this.relaciones,
    });
  }

  findByUuids(uuids: string[]): Promise<Atraccion[]> {
    if (!uuids.length) return Promise.resolve([]);
    return this.atracciones.find({
      where: { atr_uuid: In(uuids), atr_eliminado_en: IsNull() },
      relations: this.relaciones,
    });
  }

  findByIds(ids: number[]): Promise<Atraccion[]> {
    if (!ids.length) return Promise.resolve([]);
    return this.atracciones.find({
      where: { atr_id: In([...new Set(ids)]) },
      relations: this.relaciones,
    });
  }

  // Bloquea la fila: serializa cambios de catálogo y reservas sobre la misma atracción.
  bloquear(atrId: number, manager: EntityManager): Promise<Atraccion | null> {
    return manager.findOne(Atraccion, {
      where: { atr_id: atrId },
      lock: { mode: "pessimistic_write" },
    });
  }

  async listar(f: FiltroAtracciones): Promise<[Atraccion[], number]> {
    const qb = this.atracciones
      .createQueryBuilder("a")
      .where("a.atr_eliminado_en IS NULL");
    if (f.soloPublicadas)
      qb.andWhere("a.atr_estado = :pub", { pub: EstadoAtraccion.PUBLICADA });
    if (f.q?.trim()) {
      qb.andWhere(
        "(a.atr_nombre ILIKE :q OR a.atr_descripcion ILIKE :q OR a.atr_codigo_aeropuerto ILIKE :q)",
        { q: `%${f.q.trim()}%` },
      );
    }
    if (f.aeropuerto?.trim()) {
      qb.andWhere("a.atr_codigo_aeropuerto = :apt", {
        apt: f.aeropuerto.trim().toUpperCase(),
      });
    }
    const [filas, total] = await qb
      .orderBy("a.atr_nombre", "ASC")
      .addOrderBy("a.atr_id", "ASC")
      .skip((f.page - 1) * f.limit)
      .take(f.limit)
      .getManyAndCount();
    // Relaciones aparte: take/skip con joins pagina mal.
    const conRelaciones = await this.findByIds(filas.map((a) => a.atr_id));
    const porId = new Map(conRelaciones.map((a) => [a.atr_id, a]));
    return [filas.map((a) => porId.get(a.atr_id)), total];
  }

  listarPublicadasIds(): Promise<Atraccion[]> {
    return this.atracciones.find({
      select: { atr_id: true, atr_uuid: true },
      where: {
        atr_estado: EstadoAtraccion.PUBLICADA,
        atr_eliminado_en: IsNull(),
      },
    });
  }

  private async slugUnico(
    nombre: string,
    manager: EntityManager,
    excluirId?: number,
  ): Promise<string> {
    const base = slugify(nombre) || "atraccion";
    for (let i = 1; ; i++) {
      const slug = i === 1 ? base : `${base}-${i}`;
      const otro = await manager.findOne(Atraccion, {
        where: { atr_slug: slug },
      });
      if (!otro || otro.atr_id === excluirId) return slug;
    }
  }

  async crear(d: DatosAtraccion, manager: EntityManager): Promise<Atraccion> {
    const { identifiers } = await manager.insert(Atraccion, {
      atr_nombre: d.nombre,
      atr_slug: await this.slugUnico(d.nombre, manager),
      atr_descripcion: d.descripcion,
      atr_tipo:
        d.duracionHoras != null && d.duracionHoras >= 6
          ? "DAY_TRIP"
          : "GUIDED_TOUR",
      atr_estado: d.estado,
      atr_latitud: d.latitud,
      atr_longitud: d.longitud,
      atr_duracion_horas: d.duracionHoras,
      atr_codigo_aeropuerto: d.codigoAeropuerto,
      ciu_id: d.ciuId,
      ope_id: await this.operadorEcuatravel(manager),
      atr_itinerario: d.itinerario,
    });
    const atrId = Number(identifiers[0].atr_id);
    const idiomas = await manager.find(Idioma, {
      where: { idi_codigo: In(["es", "en"]) },
    });
    await manager
      .createQueryBuilder()
      .relation(Atraccion, "idiomas")
      .of(atrId)
      .add(idiomas.map((i) => i.idi_id));
    if (d.fotoUrl) await this.fijarFoto(atrId, d.nombre, d.fotoUrl, manager);
    if (d.incluye) await this.fijarInclusiones(atrId, d.incluye, manager);
    return manager.findOneOrFail(Atraccion, {
      where: { atr_id: atrId },
      relations: this.relaciones,
    });
  }

  async actualizar(
    atr: Atraccion,
    d: Partial<DatosAtraccion>,
    manager: EntityManager,
  ): Promise<void> {
    const cambios: Partial<Atraccion> = {};
    if (d.nombre !== undefined) cambios.atr_nombre = d.nombre;
    if (d.descripcion !== undefined) cambios.atr_descripcion = d.descripcion;
    if (d.estado !== undefined) cambios.atr_estado = d.estado;
    if (d.codigoAeropuerto !== undefined) {
      cambios.atr_codigo_aeropuerto = d.codigoAeropuerto;
      cambios.ciu_id = d.ciuId;
      cambios.atr_latitud = d.latitud;
      cambios.atr_longitud = d.longitud;
    }
    if (d.duracionHoras !== undefined)
      cambios.atr_duracion_horas = d.duracionHoras;
    if (d.itinerario !== undefined) cambios.atr_itinerario = d.itinerario;
    if (Object.keys(cambios).length)
      await manager.update(Atraccion, { atr_id: atr.atr_id }, cambios);
    if (d.fotoUrl !== undefined)
      await this.fijarFoto(
        atr.atr_id,
        d.nombre ?? atr.atr_nombre,
        d.fotoUrl,
        manager,
      );
    if (d.incluye !== undefined)
      await this.fijarInclusiones(atr.atr_id, d.incluye ?? [], manager);
  }

  // Borrado lógico (atr_eliminado_en), como en el diseño original.
  async eliminar(atrId: number): Promise<void> {
    await this.atracciones.update(
      { atr_id: atrId },
      { atr_eliminado_en: new Date() },
    );
  }

  // La foto principal es la de orden 0.
  async fijarFoto(
    atrId: number,
    nombre: string,
    url: string | null,
    manager: EntityManager,
  ): Promise<void> {
    await manager.delete(AtraccionFoto, { atr_id: atrId, fot_orden: 0 });
    if (url) {
      await manager.insert(AtraccionFoto, {
        atr_id: atrId,
        fot_url: url.slice(0, 500),
        fot_alt: nombre.slice(0, 200),
        fot_orden: 0,
      });
    }
  }

  async fijarInclusiones(
    atrId: number,
    nombres: string[],
    manager: EntityManager,
  ): Promise<void> {
    const limpios = [
      ...new Map(
        nombres
          .map((n) => String(n).trim().slice(0, 150))
          .filter(Boolean)
          .map((n) => [n.toLowerCase(), n]),
      ).values(),
    ];
    const relacion = manager
      .createQueryBuilder()
      .relation(Atraccion, "inclusiones")
      .of(atrId);
    const actuales = await relacion.loadMany<Inclusion>();
    await relacion.remove(actuales.map((i) => i.inc_id));
    for (const [orden, nombre] of limpios.entries()) {
      const [fila] = await manager.query(
        `INSERT INTO ms_catalog.inclusion (inc_tipo, inc_nombre, inc_orden) VALUES ('INCLUYE', $1, $2)
         ON CONFLICT (inc_tipo, inc_nombre) DO UPDATE SET inc_nombre = EXCLUDED.inc_nombre
         RETURNING inc_id`,
        [nombre, orden],
      );
      await relacion.add(fila.inc_id);
    }
  }

  async actualizarCalificacion(
    atrId: number,
    promedio: number,
    total: number,
    manager: EntityManager,
  ): Promise<void> {
    await manager.update(
      Atraccion,
      { atr_id: atrId },
      { atr_calificacion_promedio: promedio, atr_numero_resenas: total },
    );
  }

  categoriasActivas(): Promise<Categoria[]> {
    return this.categorias.find({
      where: { cat_activa: true },
      order: { cat_orden: "ASC", cat_nombre: "ASC" },
    });
  }

  // --- Favoritos (adaptación Ecuatravel) ---

  favorito(usuId: number, atrId: number): Promise<Favorito | null> {
    return this.favoritos.findOne({ where: { usu_id: usuId, atr_id: atrId } });
  }

  async agregarFavorito(usuId: number, atrId: number): Promise<Favorito> {
    const { identifiers } = await this.favoritos.insert({
      usu_id: usuId,
      atr_id: atrId,
    });
    return this.favoritos.findOneOrFail({
      where: { fav_id: Number(identifiers[0].fav_id) },
    });
  }

  async quitarFavorito(favId: number): Promise<void> {
    await this.favoritos.delete({ fav_id: favId });
  }

  favoritosDe(usuId: number): Promise<Favorito[]> {
    return this.favoritos.find({
      where: { usu_id: usuId, atraccion: { atr_eliminado_en: IsNull() } },
      relations: {
        atraccion: { fotos: true, inclusiones: true, categorias: true },
      },
      order: { fav_creado_en: "DESC" },
    });
  }
}
