import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
import { Categoria } from "./entities/categoria.entity";
import { ContratoPromociones } from "./entities/contrato-promociones.entity";
import { ActualizarPromocionesContratoDto } from "./dto/catalogo-booking.dto";
import { hoyEcuador, problem } from "./booking.utils";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTRATO_ID = 1;
const ORDEN = { orden: "ASC", nombre: "ASC" } as const;

export interface NodoCategoria extends ReturnType<typeof toCategoriaPlana> {
  descripcion: string | null;
  icono: string | null;
  orden: number;
  subcategorias: NodoCategoria[];
}

function toCategoriaPlana(c: Categoria) {
  return {
    id: c.id,
    padre_id: c.padre_id ?? null,
    nombre: c.nombre,
    slug: c.slug,
    incluye_comida: c.incluye_comida,
    incluye_transporte: c.incluye_transporte,
    incluye_guia: c.incluye_guia,
    // Alias en inglés de la guía de socios (RDA2 §6).
    includes_food: c.incluye_comida,
    includes_transport: c.incluye_transporte,
    includes_guide: c.incluye_guia,
  };
}

@Injectable()
export class CatalogoBookingService {
  private readonly logger = new Logger(CatalogoBookingService.name);
  private readonly proveedorId: string;

  constructor(
    @InjectRepository(Categoria)
    private readonly categorias: Repository<Categoria>,
    @InjectRepository(ContratoPromociones)
    private readonly contratos: Repository<ContratoPromociones>,
    config: ConfigService,
  ) {
    this.proveedorId = config.get<string>(
      "PARTNER_SERVICE_ID",
      "NODE_ATR_ARIEL",
    );
  }

  async arbolCategorias(): Promise<NodoCategoria[]> {
    const todas = await this.categorias.find({ order: ORDEN });
    const nodos = new Map<string, NodoCategoria>(
      todas.map((c) => [
        c.id,
        {
          ...toCategoriaPlana(c),
          descripcion: c.descripcion ?? null,
          icono: c.icono ?? null,
          orden: c.orden,
          subcategorias: [],
        },
      ]),
    );
    const raices: NodoCategoria[] = [];
    for (const c of todas) {
      const nodo = nodos.get(c.id);
      const padre = c.padre_id ? nodos.get(c.padre_id) : undefined;
      (padre ? padre.subcategorias : raices).push(nodo);
    }
    return raices;
  }

  async listarCategorias(padreId?: string) {
    if (padreId && !UUID_REGEX.test(padreId)) return [];
    const categorias = await this.categorias.find({
      where: { padre_id: padreId ?? IsNull() },
      order: ORDEN,
    });
    return categorias.map(toCategoriaPlana);
  }

  async obtenerContrato() {
    const contrato = await this.contratos.findOne({
      where: { id: CONTRATO_ID },
    });
    return this.toContratoResponse(contrato);
  }

  async actualizarContrato(dto: ActualizarPromocionesContratoDto) {
    const invalid: { name: string; reason: string }[] = [];
    if (!dto.permite_promociones && dto.porcentaje_descuento_maximo > 0) {
      invalid.push({
        name: "porcentaje_descuento_maximo",
        reason: "Debe ser 0 si permite_promociones es false.",
      });
    }
    const hoy = hoyEcuador();
    if (dto.vigencia_hasta && dto.vigencia_hasta < hoy) {
      invalid.push({
        name: "vigencia_hasta",
        reason: `No puede ser anterior a ${hoy}.`,
      });
    }
    if (invalid.length) {
      throw problem(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_FAILED",
        "validacion",
        "Solicitud inválida",
        "El acuerdo de promociones es inconsistente.",
        { invalid_params: invalid },
      );
    }

    // Sin repetidos ni vacíos, conservando el primer formato escrito.
    const vistos = new Set<string>();
    const destinos = (dto.destinos_habilitados ?? [])
      .map((d) => d.trim())
      .filter((d) => {
        const clave = d.toLocaleLowerCase("es");
        if (!d || vistos.has(clave)) return false;
        vistos.add(clave);
        return true;
      });

    const contrato = await this.contratos.save(
      this.contratos.create({
        id: CONTRATO_ID,
        permite_promociones: dto.permite_promociones,
        porcentaje_descuento_maximo: dto.porcentaje_descuento_maximo,
        destinos_habilitados: destinos,
        fecha_acuerdo: hoy,
        vigencia_hasta: dto.vigencia_hasta ?? null,
        condiciones_combo: dto.condiciones_combo?.trim() || null,
        contacto_nombre: dto.contacto_comercial?.nombre?.trim() || null,
        contacto_email: dto.contacto_comercial?.email?.toLowerCase() || null,
      }),
    );
    this.logger.log(
      JSON.stringify({
        event: "promociones.contrato.actualizado",
        permite_promociones: contrato.permite_promociones,
        porcentaje_descuento_maximo: contrato.porcentaje_descuento_maximo,
        destinos: destinos.length,
      }),
    );
    return this.toContratoResponse(contrato);
  }

  // Sin fila, la tienda aún no respondió el cuestionario: no acepta promociones.
  private toContratoResponse(c: ContratoPromociones | null) {
    const contacto =
      c?.contacto_nombre || c?.contacto_email
        ? { nombre: c.contacto_nombre, email: c.contacto_email }
        : null;
    return {
      proveedor_id: this.proveedorId,
      nombre_comercial: "Ecuatravel",
      cuestionario_respondido: Boolean(c),
      permite_promociones: c?.permite_promociones ?? false,
      porcentaje_descuento_maximo: Number(c?.porcentaje_descuento_maximo ?? 0),
      destinos_habilitados: c?.destinos_habilitados ?? [],
      fecha_acuerdo: c?.fecha_acuerdo ?? null,
      vigencia_hasta: c?.vigencia_hasta ?? null,
      condiciones_combo: c?.condiciones_combo ?? null,
      contacto_comercial: contacto,
    };
  }
}
