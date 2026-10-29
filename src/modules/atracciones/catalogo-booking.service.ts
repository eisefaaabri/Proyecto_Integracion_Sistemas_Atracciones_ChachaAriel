import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CatalogService } from "../catalog/catalog.service";
import { Categoria } from "../catalog/catalog.entities";
import { PricingService } from "../pricing/pricing.service";
import { ContratoPromocion } from "../pricing/pricing.entities";
import { ActualizarPromocionesContratoDto } from "./dto/catalogo-booking.dto";
import { UUID_REGEX, hoyEcuador, problem } from "./booking.utils";

export interface NodoCategoria extends ReturnType<typeof toCategoriaPlana> {
  descripcion: string | null;
  icono: string | null;
  orden: number;
  subcategorias: NodoCategoria[];
}

function toCategoriaPlana(c: Categoria, uuidPorId: Map<number, string>) {
  return {
    id: c.cat_uuid,
    padre_id: c.cat_padre_id ? (uuidPorId.get(c.cat_padre_id) ?? null) : null,
    nombre: c.cat_nombre,
    slug: c.cat_slug,
    incluye_comida: c.cat_incluye_comida,
    incluye_transporte: c.cat_incluye_transporte,
    incluye_guia: c.cat_incluye_guia,
    // Alias en inglés de la guía de socios (RDA2 §6).
    includes_food: c.cat_incluye_comida,
    includes_transport: c.cat_incluye_transporte,
    includes_guide: c.cat_incluye_guia,
  };
}

@Injectable()
export class CatalogoBookingService {
  private readonly logger = new Logger(CatalogoBookingService.name);
  private readonly proveedorId: string;

  constructor(
    private readonly catalog: CatalogService,
    private readonly pricing: PricingService,
    config: ConfigService,
  ) {
    this.proveedorId = config.get<string>(
      "PARTNER_SERVICE_ID",
      "NODE_ATR_ARIEL",
    );
  }

  async arbolCategorias(): Promise<NodoCategoria[]> {
    const todas = await this.catalog.categoriasActivas();
    const uuids = new Map(todas.map((c) => [c.cat_id, c.cat_uuid]));
    const nodos = new Map<number, NodoCategoria>(
      todas.map((c) => [
        c.cat_id,
        {
          ...toCategoriaPlana(c, uuids),
          descripcion: c.cat_descripcion ?? null,
          icono: c.cat_icono ?? null,
          orden: c.cat_orden,
          subcategorias: [],
        },
      ]),
    );
    const raices: NodoCategoria[] = [];
    for (const c of todas) {
      const padre = c.cat_padre_id ? nodos.get(c.cat_padre_id) : undefined;
      (padre ? padre.subcategorias : raices).push(nodos.get(c.cat_id));
    }
    return raices;
  }

  async listarCategorias(padreUuid?: string) {
    if (padreUuid && !UUID_REGEX.test(padreUuid)) return [];
    const todas = await this.catalog.categoriasActivas();
    const uuids = new Map(todas.map((c) => [c.cat_id, c.cat_uuid]));
    const padre = padreUuid
      ? todas.find((c) => c.cat_uuid === padreUuid)
      : undefined;
    if (padreUuid && !padre) return [];
    return todas
      .filter((c) =>
        padre ? c.cat_padre_id === padre.cat_id : c.cat_padre_id === null,
      )
      .map((c) => toCategoriaPlana(c, uuids));
  }

  async obtenerContrato() {
    return this.toContratoResponse(await this.pricing.contrato());
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

    const contrato = await this.pricing.guardarContrato({
      permite: dto.permite_promociones,
      porcentaje: dto.porcentaje_descuento_maximo,
      destinos,
      fechaAcuerdo: hoy,
      vigenciaHasta: dto.vigencia_hasta ?? null,
      condiciones: dto.condiciones_combo?.trim() || null,
      contactoNombre: dto.contacto_comercial?.nombre?.trim() || null,
      contactoCorreo: dto.contacto_comercial?.email?.toLowerCase() || null,
    });
    this.logger.log(
      JSON.stringify({
        event: "promociones.contrato.actualizado",
        permite_promociones: contrato.cpr_permite_promociones,
        porcentaje_descuento_maximo: contrato.cpr_porcentaje_maximo,
        destinos: destinos.length,
      }),
    );
    return this.toContratoResponse(contrato);
  }

  // Sin fila, la tienda aún no respondió el cuestionario: no acepta promociones.
  private toContratoResponse(c: ContratoPromocion | null) {
    const contacto =
      c?.cpr_contacto_nombre || c?.cpr_contacto_correo
        ? { nombre: c.cpr_contacto_nombre, email: c.cpr_contacto_correo }
        : null;
    return {
      proveedor_id: this.proveedorId,
      nombre_comercial: "Ecuatravel",
      cuestionario_respondido: Boolean(c),
      permite_promociones: c?.cpr_permite_promociones ?? false,
      porcentaje_descuento_maximo: Number(c?.cpr_porcentaje_maximo ?? 0),
      destinos_habilitados: [...(c?.destinos ?? [])]
        .sort((a, b) => a.cpd_orden - b.cpd_orden)
        .map((d) => d.cpd_nombre),
      fecha_acuerdo: c?.cpr_fecha_acuerdo ?? null,
      vigencia_hasta: c?.cpr_vigencia_hasta ?? null,
      condiciones_combo: c?.cpr_condiciones ?? null,
      contacto_comercial: contacto,
    };
  }
}
