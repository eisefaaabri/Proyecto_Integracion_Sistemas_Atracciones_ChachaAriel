import { Column, Entity } from "typeorm";
import { aNumero } from "../../common/typeorm/transformers";

@Entity({ schema: "ms_billing_profile", name: "dato_facturacion" })
export class DatoFacturacion {
  @Column({
    type: "bigint",
    primary: true,
    generated: "identity",
    generatedIdentity: "ALWAYS",
    transformer: aNumero,
  })
  dfa_id: number;

  @Column({ type: "bigint", transformer: aNumero })
  usu_id: number;

  @Column({ type: "varchar", length: 20 })
  dfa_tipo_identificacion: string;

  @Column({ type: "varchar", length: 20 })
  dfa_identificacion: string;

  @Column({ type: "varchar", length: 150 })
  dfa_razon_social: string;

  @Column({ type: "varchar", length: 160 })
  dfa_correo: string;

  @Column({ type: "varchar", length: 20, nullable: true })
  dfa_telefono: string | null;

  @Column({ type: "boolean", default: false })
  dfa_es_principal: boolean;

  @Column({ type: "boolean", default: true })
  dfa_activo: boolean;
}
