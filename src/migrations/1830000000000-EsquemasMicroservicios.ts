import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Modelo por microservicios basado en el diseño de Descubre EC
 * (Adaptacion_Microservicios/02_microservicios_v2_bases_de_datos.sql), adaptado a Ecuatravel.
 *
 * Cada servicio vive en su propio esquema (equivalente a database-per-service dentro de una
 * sola base de Supabase). Solo hay FK dentro de un esquema; las referencias a otro servicio son
 * IDs lógicos con índice.
 *
 * Adaptaciones de Ecuatravel respecto al original:
 *  - ms_identity.usuario: usu_uuid público (sub del JWT) y apellido opcional.
 *  - ms_location.aeropuerto: las atracciones se organizan por aeropuerto (IATA).
 *  - ms_catalog: banderas de inclusión en categoria, código de aeropuerto e itinerario en
 *    atraccion, estado MANTENIMIENTO, duración opcional y tabla favorito (wishlist).
 *  - ms_pricing: tarifa INFANTE y contrato_promocion (acuerdo B2B con Booking).
 *  - ms_order: canal WEB/BOOKING (las órdenes de Booking no tienen usuario local),
 *    detalle por tipo de pasajero e idempotencia con claves de texto.
 *  - ms_booking: estado CHECKED_IN, seniors/infantes, check-in, solicitante de cancelación,
 *    orden de la reserva y outbox de eventos.
 *  - ms_payment: método BOOKING y URL de comprobante.
 *  - dom_documento acepta cédula, RUC o pasaporte alfanumérico.
 */
export class EsquemasMicroservicios1830000000000 implements MigrationInterface {
  name = "EsquemasMicroservicios1830000000000";

  public async up(q: QueryRunner): Promise<void> {
    for (const sql of [
      IDENTITY,
      BILLING_PROFILE,
      LOCATION,
      CATALOG,
      REVIEW,
      PRICING,
      INVENTORY,
      CART,
      COUPON,
      ORDER,
      BOOKING,
      PAYMENT,
      REFUND,
      INVOICING,
      SUPPORT,
      AUDIT,
    ]) {
      await q.query(sql);
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP SCHEMA IF EXISTS ${SCHEMAS.join(", ")} CASCADE`);
  }
}

export const SCHEMAS = [
  "ms_identity",
  "ms_billing_profile",
  "ms_location",
  "ms_catalog",
  "ms_review",
  "ms_pricing",
  "ms_inventory",
  "ms_cart",
  "ms_coupon",
  "ms_order",
  "ms_booking",
  "ms_payment",
  "ms_refund",
  "ms_invoicing",
  "ms_support",
  "ms_audit",
];

const correo = (s: string) => String.raw`
CREATE DOMAIN ${s}.dom_correo AS VARCHAR(160)
    CHECK (VALUE ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');`;
const telefono = (s: string) => String.raw`
CREATE DOMAIN ${s}.dom_telefono AS VARCHAR(20)
    CHECK (VALUE ~ '^\+?[0-9]{7,15}$');`;
const documento = (s: string) => String.raw`
CREATE DOMAIN ${s}.dom_documento AS VARCHAR(20)
    CHECK (VALUE ~ '^[A-Z0-9]{5,20}$');`;
const importe = (s: string) => `
CREATE DOMAIN ${s}.dom_importe AS NUMERIC(12,2) CHECK (VALUE >= 0);`;
const moneda = (s: string) => `
CREATE DOMAIN ${s}.dom_moneda AS CHAR(3) CHECK (VALUE ~ '^[A-Z]{3}$');`;
const fnTimestamp = (s: string) => `
CREATE OR REPLACE FUNCTION ${s}.fn_actualizar_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW := jsonb_populate_record(NEW, jsonb_build_object(TG_ARGV[0], now()));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;`;
const estado = (s: string) => `
CREATE TABLE ${s}.estado (
    est_id     SMALLINT    GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    est_codigo VARCHAR(20) NOT NULL UNIQUE,
    est_nombre VARCHAR(50) NOT NULL,
    est_final  BOOLEAN     NOT NULL DEFAULT FALSE
);`;

// 1 · Identity & Access
const IDENTITY = `
CREATE SCHEMA ms_identity;
${correo("ms_identity")}
${documento("ms_identity")}
${telefono("ms_identity")}
${fnTimestamp("ms_identity")}

CREATE TABLE ms_identity.rol (
    rol_id          SMALLINT     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    rol_nombre      VARCHAR(30)  NOT NULL UNIQUE,
    rol_descripcion VARCHAR(200) NOT NULL,
    rol_activo      BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE ms_identity.usuario (
    usu_id             BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usu_uuid           UUID          NOT NULL DEFAULT gen_random_uuid(),
    usu_correo         ms_identity.dom_correo    NOT NULL,
    usu_password       VARCHAR(100)  NOT NULL,
    usu_nombre         VARCHAR(120)  NOT NULL,
    usu_apellido       VARCHAR(120),
    usu_documento      ms_identity.dom_documento,
    usu_telefono       ms_identity.dom_telefono,
    usu_fecha_nacimiento DATE,
    usu_avatar         VARCHAR(255),
    usu_verificado     BOOLEAN       NOT NULL DEFAULT FALSE,
    usu_activo         BOOLEAN       NOT NULL DEFAULT TRUE,
    usu_ultimo_acceso  TIMESTAMPTZ,
    usu_creado_en      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    usu_actualizado_en TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT uq_usuario_uuid      UNIQUE (usu_uuid),
    CONSTRAINT uq_usuario_correo    UNIQUE (usu_correo),
    CONSTRAINT uq_usuario_documento UNIQUE (usu_documento),
    CONSTRAINT usuario_nombre_no_vacio CHECK (btrim(usu_nombre) <> '')
);

CREATE TABLE ms_identity.usuario_rol (
    usu_id           BIGINT      NOT NULL,
    rol_id           SMALLINT    NOT NULL,
    usr_asignado_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
    usr_asignado_por BIGINT,
    CONSTRAINT pk_usuario_rol PRIMARY KEY (usu_id, rol_id),
    CONSTRAINT fk_usuario_rol_usuario FOREIGN KEY (usu_id)
        REFERENCES ms_identity.usuario (usu_id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_usuario_rol_rol FOREIGN KEY (rol_id)
        REFERENCES ms_identity.rol (rol_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_usuario_rol_asignador FOREIGN KEY (usr_asignado_por)
        REFERENCES ms_identity.usuario (usu_id) ON UPDATE CASCADE ON DELETE SET NULL
);
CREATE INDEX ix_usuario_rol_rol_id ON ms_identity.usuario_rol (rol_id);
CREATE INDEX ix_usuario_rol_asignado_por ON ms_identity.usuario_rol (usr_asignado_por);

CREATE TABLE ms_identity.sesion (
    ses_id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    usu_id         BIGINT       NOT NULL,
    ses_token_hash VARCHAR(128) NOT NULL UNIQUE,
    ses_ip         VARCHAR(45),
    ses_user_agent VARCHAR(255),
    ses_expira_en  TIMESTAMPTZ  NOT NULL,
    ses_revocada   BOOLEAN      NOT NULL DEFAULT FALSE,
    ses_creado_en  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT fk_sesion_usuario FOREIGN KEY (usu_id)
        REFERENCES ms_identity.usuario (usu_id) ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX ix_sesion_usu_id ON ms_identity.sesion (usu_id);
CREATE INDEX ix_sesion_expira_en ON ms_identity.sesion (ses_expira_en);

CREATE TABLE ms_identity.token_verificacion (
    tokv_id        BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usu_id         BIGINT       NOT NULL,
    tokv_token     VARCHAR(128) NOT NULL UNIQUE,
    tokv_tipo      VARCHAR(20)  NOT NULL,
    tokv_expira_en TIMESTAMPTZ  NOT NULL,
    tokv_usado     BOOLEAN      NOT NULL DEFAULT FALSE,
    tokv_creado_en TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT token_verificacion_tipo_valido CHECK (tokv_tipo IN ('EMAIL', 'RECUPERACION')),
    CONSTRAINT fk_token_verificacion_usuario FOREIGN KEY (usu_id)
        REFERENCES ms_identity.usuario (usu_id) ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX ix_token_verificacion_usu_id ON ms_identity.token_verificacion (usu_id);

CREATE TRIGGER trg_usuario_actualizado BEFORE UPDATE ON ms_identity.usuario
    FOR EACH ROW EXECUTE FUNCTION ms_identity.fn_actualizar_timestamp('usu_actualizado_en');

CREATE VIEW ms_identity.v_usuario_roles AS
SELECT u.usu_id, u.usu_correo, u.usu_nombre, u.usu_apellido, r.rol_id, r.rol_nombre
FROM ms_identity.usuario u
JOIN ms_identity.usuario_rol ur ON ur.usu_id = u.usu_id
JOIN ms_identity.rol r          ON r.rol_id  = ur.rol_id
WHERE u.usu_activo AND r.rol_activo;

INSERT INTO ms_identity.rol (rol_nombre, rol_descripcion) VALUES
    ('ADMIN',    'Administrador de Ecuatravel'),
    ('OPERADOR', 'Empresa que opera atracciones'),
    ('CLIENTE',  'Turista que compra y reserva');
`;

// 2 · Billing Profile
const BILLING_PROFILE = `
CREATE SCHEMA ms_billing_profile;
${correo("ms_billing_profile")}
${telefono("ms_billing_profile")}

CREATE TABLE ms_billing_profile.dato_facturacion (
    dfa_id                  BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usu_id                  BIGINT       NOT NULL,
    dfa_tipo_identificacion VARCHAR(20)  NOT NULL DEFAULT 'CEDULA',
    dfa_identificacion      VARCHAR(20)  NOT NULL,
    dfa_razon_social        VARCHAR(150) NOT NULL,
    dfa_correo              ms_billing_profile.dom_correo NOT NULL,
    dfa_telefono            ms_billing_profile.dom_telefono,
    dfa_es_principal        BOOLEAN      NOT NULL DEFAULT FALSE,
    dfa_activo              BOOLEAN      NOT NULL DEFAULT TRUE,
    dfa_creado_en           TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT dato_facturacion_tipo_valido
        CHECK (dfa_tipo_identificacion IN ('CEDULA', 'RUC', 'PASAPORTE', 'CONSUMIDOR_FINAL')),
    CONSTRAINT dato_facturacion_identificacion_valida CHECK (
        (dfa_tipo_identificacion = 'CEDULA'           AND dfa_identificacion ~ '^[0-9]{10}$') OR
        (dfa_tipo_identificacion = 'RUC'              AND dfa_identificacion ~ '^[0-9]{13}$') OR
        (dfa_tipo_identificacion = 'PASAPORTE'        AND dfa_identificacion ~ '^[A-Z0-9]{5,20}$') OR
        (dfa_tipo_identificacion = 'CONSUMIDOR_FINAL' AND dfa_identificacion = '9999999999999')
    ),
    CONSTRAINT uq_dato_facturacion_usuario_identificacion
        UNIQUE (usu_id, dfa_tipo_identificacion, dfa_identificacion)
);
CREATE UNIQUE INDEX ux_dato_facturacion_principal
    ON ms_billing_profile.dato_facturacion (usu_id) WHERE dfa_es_principal;
CREATE INDEX ix_dato_facturacion_usu_id ON ms_billing_profile.dato_facturacion (usu_id);
`;

// 3 · Location (+ aeropuerto, núcleo de Ecuatravel)
const LOCATION = `
CREATE SCHEMA ms_location;

CREATE TABLE ms_location.region (
    reg_id     SMALLINT    GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    reg_nombre VARCHAR(30) NOT NULL UNIQUE,
    reg_codigo CHAR(2)     NOT NULL UNIQUE,
    CONSTRAINT region_nombre_no_vacio CHECK (btrim(reg_nombre) <> '')
);

CREATE TABLE ms_location.provincia (
    prov_id     SMALLINT    GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    prov_nombre VARCHAR(60) NOT NULL UNIQUE,
    prov_codigo CHAR(2)     NOT NULL UNIQUE,
    reg_id      SMALLINT    NOT NULL,
    prov_activa BOOLEAN     NOT NULL DEFAULT TRUE,
    CONSTRAINT fk_provincia_region FOREIGN KEY (reg_id)
        REFERENCES ms_location.region (reg_id) ON UPDATE CASCADE ON DELETE RESTRICT
);
CREATE INDEX ix_provincia_reg_id ON ms_location.provincia (reg_id);

CREATE TABLE ms_location.ciudad (
    ciu_id          SMALLINT     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ciu_nombre      VARCHAR(80)  NOT NULL,
    ciu_codigo      CHAR(6)      NOT NULL UNIQUE,
    prov_id         SMALLINT     NOT NULL,
    ciu_activa      BOOLEAN      NOT NULL DEFAULT TRUE,
    ciu_descripcion VARCHAR(500),
    ciu_imagen      VARCHAR(500),
    CONSTRAINT uq_ciudad_provincia_nombre UNIQUE (prov_id, ciu_nombre),
    CONSTRAINT fk_ciudad_provincia FOREIGN KEY (prov_id)
        REFERENCES ms_location.provincia (prov_id) ON UPDATE CASCADE ON DELETE RESTRICT
);
CREATE INDEX ix_ciudad_prov_id ON ms_location.ciudad (prov_id);

CREATE TABLE ms_location.aeropuerto (
    aer_id       SMALLINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    aer_codigo   CHAR(3)       NOT NULL UNIQUE,
    aer_nombre   VARCHAR(120)  NOT NULL,
    ciu_id       SMALLINT      NOT NULL,
    aer_latitud  NUMERIC(10,6) NOT NULL,
    aer_longitud NUMERIC(10,6) NOT NULL,
    aer_activo   BOOLEAN       NOT NULL DEFAULT TRUE,
    CONSTRAINT aeropuerto_codigo_iata CHECK (aer_codigo ~ '^[A-Z]{3}$'),
    CONSTRAINT fk_aeropuerto_ciudad FOREIGN KEY (ciu_id)
        REFERENCES ms_location.ciudad (ciu_id) ON UPDATE CASCADE ON DELETE RESTRICT
);
CREATE INDEX ix_aeropuerto_ciu_id ON ms_location.aeropuerto (ciu_id);

INSERT INTO ms_location.region (reg_nombre, reg_codigo) VALUES
    ('SIERRA','SI'), ('COSTA','CO'), ('AMAZONIA','AM'), ('GALAPAGOS','GA');

INSERT INTO ms_location.provincia (prov_nombre, prov_codigo, reg_id)
SELECT p.nombre, p.codigo, r.reg_id
FROM (VALUES
    ('Azuay','01','SI'), ('Bolívar','02','SI'), ('Cañar','03','SI'), ('Carchi','04','SI'),
    ('Chimborazo','05','SI'), ('Cotopaxi','06','SI'), ('El Oro','07','CO'), ('Esmeraldas','08','CO'),
    ('Galápagos','09','GA'), ('Guayas','10','CO'), ('Imbabura','11','SI'), ('Loja','12','SI'),
    ('Los Ríos','13','CO'), ('Manabí','14','CO'), ('Morona Santiago','15','AM'), ('Napo','16','AM'),
    ('Orellana','17','AM'), ('Pastaza','18','AM'), ('Pichincha','19','SI'), ('Santa Elena','20','CO'),
    ('Santo Domingo de los Tsáchilas','21','SI'), ('Sucumbíos','22','AM'), ('Tungurahua','23','SI'),
    ('Zamora Chinchipe','24','AM')
) AS p(nombre, codigo, region)
JOIN ms_location.region r ON r.reg_codigo = p.region;

-- Las 17 ciudades del diseño original + las de las atracciones de Ecuatravel.
INSERT INTO ms_location.ciudad (ciu_nombre, ciu_codigo, prov_id)
SELECT c.nombre, c.codigo, p.prov_id
FROM (VALUES
    ('Cuenca','010100','Azuay'), ('Guayaquil','090150','Guayas'), ('Quito','170150','Pichincha'),
    ('Ambato','180150','Tungurahua'), ('Riobamba','060100','Chimborazo'), ('Loja','130100','Loja'),
    ('Puerto Baquerizo Moreno','020100','Galápagos'), ('Manta','140350','Manabí'),
    ('Salinas','090300','Santa Elena'), ('La Troncal','030050','Cañar'), ('Ibarra','100150','Imbabura'),
    ('Tulcan','040100','Carchi'), ('Latacunga','050100','Cotopaxi'), ('Macas','160100','Morona Santiago'),
    ('Puyo','190150','Pastaza'), ('Archidona','170350','Napo'), ('Nueva Loja','230100','Sucumbíos'),
    ('Puerto Ayora','200350','Galápagos'), ('Baños de Agua Santa','180250','Tungurahua'),
    ('Otavalo','100450','Imbabura'), ('Santa Elena','240150','Santa Elena'),
    ('Puerto López','131150','Manabí'), ('Mindo','170452','Pichincha'), ('Papallacta','150452','Napo'),
    ('Puerto Francisco de Orellana','220150','Orellana'), ('Cañar','030250','Cañar')
) AS c(nombre, codigo, provincia)
JOIN ms_location.provincia p ON p.prov_nombre = c.provincia;

INSERT INTO ms_location.aeropuerto (aer_codigo, aer_nombre, ciu_id, aer_latitud, aer_longitud)
SELECT a.codigo, a.nombre, c.ciu_id, a.lat, a.lon
FROM (VALUES
    ('UIO','Aeropuerto Internacional Mariscal Sucre','Quito',-0.129167,-78.357500),
    ('GYE','Aeropuerto Internacional José Joaquín de Olmedo','Guayaquil',-2.157419,-79.883558),
    ('CUE','Aeropuerto Mariscal Lamar','Cuenca',-2.889467,-78.984397),
    ('GPS','Aeropuerto Seymour de Baltra','Puerto Ayora',-0.453758,-90.265914),
    ('SCY','Aeropuerto San Cristóbal','Puerto Baquerizo Moreno',-0.910206,-89.617450),
    ('MEC','Aeropuerto Internacional Eloy Alfaro','Manta',-0.946078,-80.678808),
    ('LOH','Aeropuerto Ciudad de Catamayo','Loja',-3.995900,-79.371900)
) AS a(codigo, nombre, ciudad, lat, lon)
JOIN ms_location.ciudad c ON c.ciu_nombre = a.ciudad;
`;

// 4 · Catalog & Attractions
const CATALOG = String.raw`
CREATE SCHEMA ms_catalog;
${correo("ms_catalog")}
${telefono("ms_catalog")}
${moneda("ms_catalog")}
CREATE DOMAIN ms_catalog.dom_ruc AS VARCHAR(13) CHECK (VALUE ~ '^[0-9]{13}$');
${fnTimestamp("ms_catalog")}

CREATE TABLE ms_catalog.operador (
    ope_id             BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ope_codigo         INTEGER      NOT NULL UNIQUE,
    ope_nombre         VARCHAR(150) NOT NULL,
    ope_ruc            ms_catalog.dom_ruc UNIQUE,
    ope_correo         ms_catalog.dom_correo,
    ope_telefono       ms_catalog.dom_telefono,
    ope_direccion      VARCHAR(255),
    prov_id            SMALLINT     NOT NULL,            -- ID lógico (Location)
    ope_activo         BOOLEAN      NOT NULL DEFAULT TRUE,
    ope_creado_en      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    ope_actualizado_en TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX ix_operador_prov_id ON ms_catalog.operador (prov_id);

CREATE TABLE ms_catalog.operador_usuario (
    ope_id      BIGINT      NOT NULL,
    usu_id      BIGINT      NOT NULL,                    -- ID lógico (Identity)
    opeu_cargo  VARCHAR(60) NOT NULL,
    opeu_activo BOOLEAN     NOT NULL DEFAULT TRUE,
    CONSTRAINT pk_operador_usuario PRIMARY KEY (ope_id, usu_id),
    CONSTRAINT fk_operador_usuario_operador FOREIGN KEY (ope_id)
        REFERENCES ms_catalog.operador (ope_id) ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX ix_operador_usuario_usu_id ON ms_catalog.operador_usuario (usu_id);

CREATE TABLE ms_catalog.categoria (
    cat_id                 INTEGER      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cat_uuid               UUID         NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    cat_padre_id           INTEGER,
    cat_nombre             VARCHAR(100) NOT NULL,
    cat_slug               VARCHAR(100) NOT NULL UNIQUE,
    cat_descripcion        VARCHAR(255),
    cat_icono              VARCHAR(40)  NOT NULL DEFAULT 'map-pin',
    cat_orden              SMALLINT     NOT NULL DEFAULT 0,
    cat_activa             BOOLEAN      NOT NULL DEFAULT TRUE,
    cat_incluye_comida     BOOLEAN      NOT NULL DEFAULT FALSE,
    cat_incluye_transporte BOOLEAN      NOT NULL DEFAULT FALSE,
    cat_incluye_guia       BOOLEAN      NOT NULL DEFAULT FALSE,
    CONSTRAINT categoria_no_es_ella_misma CHECK (cat_padre_id IS DISTINCT FROM cat_id),
    CONSTRAINT fk_categoria_padre FOREIGN KEY (cat_padre_id)
        REFERENCES ms_catalog.categoria (cat_id) ON UPDATE CASCADE ON DELETE RESTRICT
);
CREATE INDEX ix_categoria_cat_padre_id ON ms_catalog.categoria (cat_padre_id);

CREATE TABLE ms_catalog.idioma (
    idi_id     SMALLINT    GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    idi_codigo CHAR(2)     NOT NULL UNIQUE,
    idi_nombre VARCHAR(50) NOT NULL
);

CREATE TABLE ms_catalog.inclusion (
    inc_id     INTEGER      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    inc_tipo   VARCHAR(20)  NOT NULL,
    inc_nombre VARCHAR(150) NOT NULL,
    inc_orden  SMALLINT     NOT NULL DEFAULT 0,
    CONSTRAINT uq_inclusion_tipo_nombre UNIQUE (inc_tipo, inc_nombre),
    CONSTRAINT inclusion_tipo_valido CHECK (inc_tipo IN ('INCLUYE', 'NO_INCLUYE', 'RECOMENDACION'))
);
CREATE INDEX ix_inclusion_inc_tipo ON ms_catalog.inclusion (inc_tipo);

CREATE TABLE ms_catalog.atraccion (
    atr_id                    BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    atr_uuid                  UUID          NOT NULL DEFAULT gen_random_uuid(),
    atr_nombre                VARCHAR(200)  NOT NULL,
    atr_slug                  VARCHAR(220)  NOT NULL UNIQUE,
    atr_descripcion           TEXT          NOT NULL,
    atr_descripcion_corta     VARCHAR(280),
    atr_tipo                  VARCHAR(30)   NOT NULL DEFAULT 'GUIDED_TOUR',
    atr_estado                VARCHAR(20)   NOT NULL DEFAULT 'BORRADOR',
    atr_latitud               NUMERIC(10,6) NOT NULL,
    atr_longitud              NUMERIC(10,6) NOT NULL,
    atr_direccion             VARCHAR(255),
    atr_punto_encuentro       VARCHAR(255),
    atr_duracion_horas        NUMERIC(5,2),
    atr_moneda                ms_catalog.dom_moneda NOT NULL DEFAULT 'USD',
    atr_codigo_aeropuerto     CHAR(3)       NOT NULL,      -- ID lógico (Location.aeropuerto)
    ciu_id                    SMALLINT      NOT NULL,      -- ID lógico (Location)
    ope_id                    BIGINT        NOT NULL,
    atr_itinerario            TEXT,
    atr_cancelacion_gratuita  BOOLEAN       NOT NULL DEFAULT FALSE,
    atr_horas_cancelacion     SMALLINT      NOT NULL DEFAULT 24,
    atr_destacada             BOOLEAN       NOT NULL DEFAULT FALSE,
    atr_calificacion_promedio NUMERIC(3,2)  NOT NULL DEFAULT 0,
    atr_numero_resenas        INTEGER       NOT NULL DEFAULT 0,
    atr_creado_en             TIMESTAMPTZ   NOT NULL DEFAULT now(),
    atr_actualizado_en        TIMESTAMPTZ   NOT NULL DEFAULT now(),
    atr_eliminado_en          TIMESTAMPTZ,
    CONSTRAINT uq_atraccion_uuid UNIQUE (atr_uuid),
    CONSTRAINT atraccion_duracion_valida
        CHECK (atr_duracion_horas IS NULL OR (atr_duracion_horas > 0 AND atr_duracion_horas <= 720)),
    CONSTRAINT atraccion_calificacion_valida
        CHECK (atr_calificacion_promedio >= 0 AND atr_calificacion_promedio <= 5),
    CONSTRAINT atraccion_latitud_valida  CHECK (atr_latitud BETWEEN -90 AND 90),
    CONSTRAINT atraccion_longitud_valida CHECK (atr_longitud BETWEEN -180 AND 180),
    CONSTRAINT atraccion_horas_cancelacion_valida CHECK (atr_horas_cancelacion >= 0),
    CONSTRAINT atraccion_aeropuerto_iata CHECK (atr_codigo_aeropuerto ~ '^[A-Z]{3}$'),
    CONSTRAINT atraccion_tipo_valido
        CHECK (atr_tipo IN ('GUIDED_TOUR', 'ADMISSION', 'DAY_TRIP', 'TRANSPORT', 'PACKAGE')),
    CONSTRAINT atraccion_estado_valido
        CHECK (atr_estado IN ('BORRADOR', 'PUBLICADA', 'INACTIVA', 'MANTENIMIENTO')),
    CONSTRAINT fk_atraccion_operador FOREIGN KEY (ope_id)
        REFERENCES ms_catalog.operador (ope_id) ON UPDATE CASCADE ON DELETE RESTRICT
);
CREATE INDEX ix_atraccion_ciu_id ON ms_catalog.atraccion (ciu_id);
CREATE INDEX ix_atraccion_ope_id ON ms_catalog.atraccion (ope_id);
CREATE INDEX ix_atraccion_estado ON ms_catalog.atraccion (atr_estado);
CREATE INDEX ix_atraccion_aeropuerto ON ms_catalog.atraccion (atr_codigo_aeropuerto);
CREATE INDEX ix_atraccion_nombre ON ms_catalog.atraccion (atr_nombre);

CREATE TABLE ms_catalog.atraccion_categoria (
    atr_id BIGINT  NOT NULL,
    cat_id INTEGER NOT NULL,
    CONSTRAINT pk_atraccion_categoria PRIMARY KEY (atr_id, cat_id),
    CONSTRAINT fk_atraccion_categoria_atraccion FOREIGN KEY (atr_id)
        REFERENCES ms_catalog.atraccion (atr_id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_atraccion_categoria_categoria FOREIGN KEY (cat_id)
        REFERENCES ms_catalog.categoria (cat_id) ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX ix_atraccion_categoria_cat_id ON ms_catalog.atraccion_categoria (cat_id);

CREATE TABLE ms_catalog.atraccion_idioma (
    atr_id BIGINT   NOT NULL,
    idi_id SMALLINT NOT NULL,
    CONSTRAINT pk_atraccion_idioma PRIMARY KEY (atr_id, idi_id),
    CONSTRAINT fk_atraccion_idioma_atraccion FOREIGN KEY (atr_id)
        REFERENCES ms_catalog.atraccion (atr_id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_atraccion_idioma_idioma FOREIGN KEY (idi_id)
        REFERENCES ms_catalog.idioma (idi_id) ON UPDATE CASCADE ON DELETE RESTRICT
);
CREATE INDEX ix_atraccion_idioma_idi_id ON ms_catalog.atraccion_idioma (idi_id);

CREATE TABLE ms_catalog.atraccion_inclusion (
    atr_id BIGINT  NOT NULL,
    inc_id INTEGER NOT NULL,
    CONSTRAINT pk_atraccion_inclusion PRIMARY KEY (atr_id, inc_id),
    CONSTRAINT fk_atraccion_inclusion_atraccion FOREIGN KEY (atr_id)
        REFERENCES ms_catalog.atraccion (atr_id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_atraccion_inclusion_inclusion FOREIGN KEY (inc_id)
        REFERENCES ms_catalog.inclusion (inc_id) ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX ix_atraccion_inclusion_inc_id ON ms_catalog.atraccion_inclusion (inc_id);

CREATE TABLE ms_catalog.atraccion_foto (
    fot_id    BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    atr_id    BIGINT       NOT NULL,
    fot_url   VARCHAR(500) NOT NULL,
    fot_alt   VARCHAR(200) NOT NULL,
    fot_orden SMALLINT     NOT NULL DEFAULT 0,
    CONSTRAINT fk_atraccion_foto_atraccion FOREIGN KEY (atr_id)
        REFERENCES ms_catalog.atraccion (atr_id) ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX ix_atraccion_foto_atr_id ON ms_catalog.atraccion_foto (atr_id);

-- Adaptación Ecuatravel: wishlist (el diseño original la quitó).
CREATE TABLE ms_catalog.favorito (
    fav_id        BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usu_id        BIGINT      NOT NULL,                  -- ID lógico (Identity)
    atr_id        BIGINT      NOT NULL,
    fav_creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_favorito_usuario_atraccion UNIQUE (usu_id, atr_id),
    CONSTRAINT fk_favorito_atraccion FOREIGN KEY (atr_id)
        REFERENCES ms_catalog.atraccion (atr_id) ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX ix_favorito_atr_id ON ms_catalog.favorito (atr_id);

CREATE TRIGGER trg_operador_actualizado BEFORE UPDATE ON ms_catalog.operador
    FOR EACH ROW EXECUTE FUNCTION ms_catalog.fn_actualizar_timestamp('ope_actualizado_en');
CREATE TRIGGER trg_atraccion_actualizado BEFORE UPDATE ON ms_catalog.atraccion
    FOR EACH ROW EXECUTE FUNCTION ms_catalog.fn_actualizar_timestamp('atr_actualizado_en');

CREATE VIEW ms_catalog.v_atraccion_completa AS
SELECT a.atr_id, a.atr_uuid, a.atr_nombre, a.atr_slug, a.atr_estado, a.atr_tipo,
       a.ciu_id, a.atr_codigo_aeropuerto, o.ope_nombre AS operador, o.ope_ruc AS operador_ruc
FROM ms_catalog.atraccion a
JOIN ms_catalog.operador o ON o.ope_id = a.ope_id;

INSERT INTO ms_catalog.idioma (idi_codigo, idi_nombre) VALUES
    ('es','Español'), ('en','Inglés'), ('fr','Francés'), ('de','Alemán');

INSERT INTO ms_catalog.operador (ope_codigo, ope_nombre, prov_id)
SELECT 1, 'Ecuatravel', p.prov_id FROM ms_location.provincia p WHERE p.prov_nombre = 'Pichincha';
`;

// 5 · Review
const REVIEW = `
CREATE SCHEMA ms_review;

CREATE TABLE ms_review.resena (
    ren_id           BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    atr_id           BIGINT        NOT NULL,             -- ID lógico (Catalog)
    usu_id           BIGINT,                             -- ID lógico (Identity); NULL = anónima
    ren_autor_nombre VARCHAR(120),
    ren_puntuacion   SMALLINT      NOT NULL,
    ren_comentario   VARCHAR(1000) NOT NULL,
    ren_visible      BOOLEAN       NOT NULL DEFAULT TRUE,
    ren_creado_en    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT resena_puntuacion_valida CHECK (ren_puntuacion BETWEEN 1 AND 5),
    CONSTRAINT uq_resena_atraccion_usuario UNIQUE (atr_id, usu_id),
    CONSTRAINT resena_autor_coherente
        CHECK ((usu_id IS NOT NULL AND ren_autor_nombre IS NULL)
            OR (usu_id IS NULL AND ren_autor_nombre IS NOT NULL))
);
CREATE INDEX ix_resena_atr_id ON ms_review.resena (atr_id);
CREATE INDEX ix_resena_usu_id ON ms_review.resena (usu_id);
`;

// 6 · Pricing (+ contrato B2B de promociones con Booking)
const PRICING = `
CREATE SCHEMA ms_pricing;
${importe("ms_pricing")}
${moneda("ms_pricing")}
${correo("ms_pricing")}

CREATE TABLE ms_pricing.tarifa (
    tar_id            BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    atr_id            BIGINT      NOT NULL,              -- ID lógico (Catalog)
    tar_tipo          VARCHAR(20) NOT NULL,
    tar_precio        ms_pricing.dom_importe NOT NULL,
    tar_moneda        ms_pricing.dom_moneda  NOT NULL DEFAULT 'USD',
    tar_vigente_desde DATE        NOT NULL DEFAULT CURRENT_DATE,
    tar_vigente_hasta DATE,
    CONSTRAINT uq_tarifa_atraccion_tipo_desde UNIQUE (atr_id, tar_tipo, tar_vigente_desde),
    CONSTRAINT tarifa_tipo_valido CHECK (tar_tipo IN ('ADULTO', 'NINO', 'MAYOR', 'INFANTE', 'GRUPO')),
    CONSTRAINT tarifa_vigencia_valida
        CHECK (tar_vigente_hasta IS NULL OR tar_vigente_hasta >= tar_vigente_desde)
);
CREATE INDEX ix_tarifa_atr_id ON ms_pricing.tarifa (atr_id);

CREATE TABLE ms_pricing.contrato_promocion (
    cpr_id                   SMALLINT     NOT NULL DEFAULT 1 PRIMARY KEY,
    cpr_permite_promociones  BOOLEAN      NOT NULL DEFAULT FALSE,
    cpr_porcentaje_maximo    NUMERIC(5,2) NOT NULL DEFAULT 0,
    cpr_fecha_acuerdo        DATE,
    cpr_vigencia_hasta       DATE,
    cpr_condiciones          VARCHAR(1000),
    cpr_contacto_nombre      VARCHAR(150),
    cpr_contacto_correo      ms_pricing.dom_correo,
    cpr_actualizado_en       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT contrato_promocion_unico CHECK (cpr_id = 1),
    CONSTRAINT contrato_promocion_porcentaje CHECK (cpr_porcentaje_maximo BETWEEN 0 AND 50),
    CONSTRAINT contrato_promocion_coherente
        CHECK (cpr_permite_promociones OR cpr_porcentaje_maximo = 0)
);

CREATE TABLE ms_pricing.contrato_promocion_destino (
    cpd_id     INTEGER      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cpr_id     SMALLINT     NOT NULL,
    cpd_nombre VARCHAR(100) NOT NULL,
    cpd_orden  SMALLINT     NOT NULL DEFAULT 0,
    CONSTRAINT uq_contrato_promocion_destino UNIQUE (cpr_id, cpd_nombre),
    CONSTRAINT fk_contrato_promocion_destino FOREIGN KEY (cpr_id)
        REFERENCES ms_pricing.contrato_promocion (cpr_id) ON UPDATE CASCADE ON DELETE CASCADE
);
`;

// 7 · Inventory & Availability
const INVENTORY = `
CREATE SCHEMA ms_inventory;

CREATE TABLE ms_inventory.horario (
    hor_id     BIGINT  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    atr_id     BIGINT  NOT NULL,                         -- ID lógico (Catalog)
    hor_hora   TIME    NOT NULL,
    hor_cupo   INTEGER NOT NULL DEFAULT 20,
    hor_activo BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT horario_cupo_positivo CHECK (hor_cupo > 0),
    CONSTRAINT uq_horario_atraccion_hora UNIQUE (atr_id, hor_hora),
    CONSTRAINT uq_horario_id_atraccion UNIQUE (hor_id, atr_id)
);
CREATE INDEX ix_horario_atr_id ON ms_inventory.horario (atr_id);

CREATE TABLE ms_inventory.disponibilidad (
    dis_id             BIGINT  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    atr_id             BIGINT  NOT NULL,                 -- ID lógico (Catalog)
    hor_id             BIGINT  NOT NULL,
    dis_fecha          DATE    NOT NULL,
    dis_cupo_total     INTEGER NOT NULL,
    dis_cupo_reservado INTEGER NOT NULL DEFAULT 0,
    dis_cerrada        BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT uq_disponibilidad_atraccion_fecha_horario UNIQUE (atr_id, dis_fecha, hor_id),
    CONSTRAINT disponibilidad_cupos_validos
        CHECK (dis_cupo_total > 0 AND dis_cupo_reservado >= 0
               AND dis_cupo_reservado <= dis_cupo_total),
    CONSTRAINT fk_disponibilidad_horario FOREIGN KEY (hor_id, atr_id)
        REFERENCES ms_inventory.horario (hor_id, atr_id) ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX ix_disponibilidad_atr_id ON ms_inventory.disponibilidad (atr_id);
CREATE INDEX ix_disponibilidad_hor_id ON ms_inventory.disponibilidad (hor_id, atr_id);
CREATE INDEX ix_disponibilidad_fecha  ON ms_inventory.disponibilidad (dis_fecha);

CREATE TABLE ms_inventory.fecha_bloqueada (
    fb_id        BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    atr_id       BIGINT       NOT NULL,                  -- ID lógico (Catalog)
    fb_fecha     DATE         NOT NULL,
    fb_motivo    VARCHAR(200) NOT NULL,
    fb_creado_en TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_fecha_bloqueada_atraccion_fecha UNIQUE (atr_id, fb_fecha)
);
CREATE INDEX ix_fecha_bloqueada_atr_id ON ms_inventory.fecha_bloqueada (atr_id);
`;

// 8 · Cart
const CART = `
CREATE SCHEMA ms_cart;
${fnTimestamp("ms_cart")}

CREATE TABLE ms_cart.carrito (
    car_id             BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usu_id             BIGINT      NOT NULL,             -- ID lógico (Identity)
    car_activo         BOOLEAN     NOT NULL DEFAULT TRUE,
    car_creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
    car_actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_carrito_usu_id ON ms_cart.carrito (usu_id);
CREATE UNIQUE INDEX ux_carrito_activo ON ms_cart.carrito (usu_id) WHERE car_activo;

CREATE TABLE ms_cart.carrito_item (
    cai_id        BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    car_id        BIGINT      NOT NULL,
    atr_id        BIGINT      NOT NULL,                  -- ID lógico (Catalog)
    dis_id        BIGINT,                                -- ID lógico (Inventory)
    cai_adultos   INTEGER     NOT NULL DEFAULT 1,
    cai_ninos     INTEGER     NOT NULL DEFAULT 0,
    cai_creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT carrito_item_cantidades_validas CHECK (cai_adultos > 0 AND cai_ninos >= 0),
    CONSTRAINT uq_carrito_item UNIQUE (car_id, atr_id, dis_id),
    CONSTRAINT fk_carrito_item_carrito FOREIGN KEY (car_id)
        REFERENCES ms_cart.carrito (car_id) ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX ix_carrito_item_car_id ON ms_cart.carrito_item (car_id);
CREATE INDEX ix_carrito_item_atr_id ON ms_cart.carrito_item (atr_id);
CREATE INDEX ix_carrito_item_dis_id ON ms_cart.carrito_item (dis_id);

CREATE TRIGGER trg_carrito_actualizado BEFORE UPDATE ON ms_cart.carrito
    FOR EACH ROW EXECUTE FUNCTION ms_cart.fn_actualizar_timestamp('car_actualizado_en');
`;

// 9 · Coupon
const COUPON = `
CREATE SCHEMA ms_coupon;
${importe("ms_coupon")}

CREATE TABLE ms_coupon.cupon (
    cup_id           BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cup_codigo       VARCHAR(30) NOT NULL UNIQUE,
    cup_tipo         VARCHAR(20) NOT NULL,
    cup_valor        ms_coupon.dom_importe NOT NULL,
    cup_fecha_inicio DATE        NOT NULL,
    cup_fecha_fin    DATE,
    cup_usos_max     INTEGER,
    cup_activo       BOOLEAN     NOT NULL DEFAULT TRUE,
    CONSTRAINT cupon_tipo_valido CHECK (cup_tipo IN ('PORCENTAJE', 'FIJO')),
    CONSTRAINT cupon_vigencia_valida CHECK (cup_fecha_fin IS NULL OR cup_fecha_fin >= cup_fecha_inicio),
    CONSTRAINT cupon_usos_valido CHECK (cup_usos_max IS NULL OR cup_usos_max > 0),
    CONSTRAINT cupon_porcentaje_valido CHECK (cup_tipo <> 'PORCENTAJE' OR cup_valor <= 100)
);
CREATE INDEX ix_cupon_activo ON ms_coupon.cupon (cup_activo);
`;

// 10 · Order Management
const ORDER = `
CREATE SCHEMA ms_order;
${importe("ms_order")}
${moneda("ms_order")}
${correo("ms_order")}
${fnTimestamp("ms_order")}
${estado("ms_order")}

CREATE TABLE ms_order.orden (
    ord_id                 BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ord_numero             VARCHAR(20)  NOT NULL UNIQUE,  -- external_order_id
    usu_id                 BIGINT,                        -- ID lógico (Identity); NULL en Booking
    ord_canal              VARCHAR(10)  NOT NULL DEFAULT 'WEB',
    ord_referencia_externa VARCHAR(100),                  -- booking_reservation_id
    ord_correlation_id     VARCHAR(100),
    ord_contacto_correo    ms_order.dom_correo,
    ord_contacto_telefono  VARCHAR(20),
    car_id                 BIGINT,                        -- ID lógico (Cart)
    est_id                 SMALLINT     NOT NULL,
    mpa_id                 SMALLINT,                      -- ID lógico (Payment)
    ord_fecha              TIMESTAMPTZ  NOT NULL DEFAULT now(),
    ord_subtotal           ms_order.dom_importe NOT NULL DEFAULT 0,
    ord_descuento          ms_order.dom_importe NOT NULL DEFAULT 0,
    ord_iva                ms_order.dom_importe NOT NULL DEFAULT 0,
    ord_total              ms_order.dom_importe NOT NULL DEFAULT 0,
    ord_moneda             ms_order.dom_moneda  NOT NULL DEFAULT 'USD',
    ord_observaciones      VARCHAR(500),
    ord_creado_en          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    ord_actualizado_en     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT orden_total_coherente CHECK (ord_total = ord_subtotal - ord_descuento + ord_iva),
    CONSTRAINT orden_canal_valido CHECK (ord_canal IN ('WEB', 'BOOKING')),
    CONSTRAINT orden_usuario_por_canal CHECK (ord_canal = 'BOOKING' OR usu_id IS NOT NULL),
    CONSTRAINT uq_orden_car_id UNIQUE (car_id),
    CONSTRAINT fk_orden_estado FOREIGN KEY (est_id)
        REFERENCES ms_order.estado (est_id) ON UPDATE CASCADE ON DELETE RESTRICT
);
CREATE INDEX ix_orden_usu_id ON ms_order.orden (usu_id);
CREATE INDEX ix_orden_est_id ON ms_order.orden (est_id);
CREATE INDEX ix_orden_fecha  ON ms_order.orden (ord_fecha DESC);
CREATE INDEX ix_orden_mpa_id ON ms_order.orden (mpa_id);
CREATE INDEX ix_orden_referencia_externa ON ms_order.orden (ord_referencia_externa);

CREATE TABLE ms_order.orden_detalle (
    det_id              BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ord_id              BIGINT       NOT NULL,
    atr_id              BIGINT       NOT NULL,           -- ID lógico (Catalog)
    det_tipo_pasajero   VARCHAR(10)  NOT NULL DEFAULT 'ADULTO',
    det_descripcion     VARCHAR(255) NOT NULL,
    det_cantidad        INTEGER      NOT NULL,
    det_precio_unitario ms_order.dom_importe NOT NULL,
    det_subtotal        ms_order.dom_importe NOT NULL,
    CONSTRAINT orden_detalle_cantidad_valida CHECK (det_cantidad > 0),
    CONSTRAINT orden_detalle_subtotal_coherente CHECK (det_subtotal = det_cantidad * det_precio_unitario),
    CONSTRAINT orden_detalle_tipo_valido
        CHECK (det_tipo_pasajero IN ('ADULTO', 'NINO', 'MAYOR', 'INFANTE')),
    CONSTRAINT fk_orden_detalle_orden FOREIGN KEY (ord_id)
        REFERENCES ms_order.orden (ord_id) ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX ix_orden_detalle_ord_id ON ms_order.orden_detalle (ord_id);
CREATE INDEX ix_orden_detalle_atr_id ON ms_order.orden_detalle (atr_id);

CREATE TABLE ms_order.orden_cupon (
    ord_id       BIGINT      NOT NULL,
    cup_id       BIGINT      NOT NULL,                   -- ID lógico (Coupon)
    orc_usado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pk_orden_cupon PRIMARY KEY (ord_id, cup_id),
    CONSTRAINT fk_orden_cupon_orden FOREIGN KEY (ord_id)
        REFERENCES ms_order.orden (ord_id) ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX ix_orden_cupon_cup_id ON ms_order.orden_cupon (cup_id);

-- La clave la elige el cliente (UUID o "idem-..."); el sujeto separa a cada usuario o canal.
CREATE TABLE ms_order.idempotencia (
    idem_clave        VARCHAR(100) NOT NULL,
    idem_sujeto       VARCHAR(64)  NOT NULL,             -- "usu:<id>" o "canal:BOOKING"
    idem_operacion    VARCHAR(150) NOT NULL,
    idem_request_hash VARCHAR(64)  NOT NULL,
    idem_estado       VARCHAR(12)  NOT NULL DEFAULT 'IN_PROGRESS',
    idem_recurso_id   VARCHAR(64),
    idem_response     JSONB,
    idem_expira_en    TIMESTAMPTZ  NOT NULL,
    idem_creado_en    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT pk_idempotencia PRIMARY KEY (idem_clave, idem_sujeto),
    CONSTRAINT idempotencia_estado_valido CHECK (idem_estado IN ('IN_PROGRESS', 'DONE', 'FAILED'))
);
CREATE INDEX ix_idempotencia_expira_en ON ms_order.idempotencia (idem_expira_en);

CREATE TRIGGER trg_orden_actualizado BEFORE UPDATE ON ms_order.orden
    FOR EACH ROW EXECUTE FUNCTION ms_order.fn_actualizar_timestamp('ord_actualizado_en');

CREATE VIEW ms_order.v_orden_financiero AS
SELECT o.ord_id, o.ord_numero, o.ord_fecha, o.usu_id,
       COALESCE(SUM(det.det_subtotal), 0) AS calculado_subtotal,
       o.ord_subtotal, o.ord_descuento, o.ord_iva, o.ord_total,
       (o.ord_subtotal - o.ord_descuento + o.ord_iva) AS total_recalculado
FROM ms_order.orden o
LEFT JOIN ms_order.orden_detalle det ON det.ord_id = o.ord_id
GROUP BY o.ord_id, o.ord_numero, o.ord_fecha, o.usu_id,
         o.ord_subtotal, o.ord_descuento, o.ord_iva, o.ord_total;

INSERT INTO ms_order.estado (est_codigo, est_nombre, est_final) VALUES
    ('CREADA',      'Orden creada',      FALSE),
    ('PAGADA',      'Orden pagada',      TRUE),
    ('CANCELADA',   'Orden cancelada',   TRUE),
    ('REEMBOLSADA', 'Orden reembolsada', TRUE);
`;

// 11 · Booking (+ outbox de eventos de integración)
const BOOKING = `
CREATE SCHEMA ms_booking;
${documento("ms_booking")}
${importe("ms_booking")}
${fnTimestamp("ms_booking")}
${estado("ms_booking")}

CREATE TABLE ms_booking.reserva (
    res_id                      BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    res_uuid                    UUID         NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    res_codigo                  VARCHAR(12)  NOT NULL UNIQUE,  -- ECT-XXXXXX
    ord_id                      BIGINT       NOT NULL,         -- ID lógico (Order)
    det_id                      BIGINT       NOT NULL,         -- ID lógico (Order), línea principal
    dis_id                      BIGINT       NOT NULL,         -- ID lógico (Inventory)
    est_id                      SMALLINT     NOT NULL,
    res_adultos                 INTEGER      NOT NULL,
    res_ninos                   INTEGER      NOT NULL DEFAULT 0,
    res_seniors                 INTEGER      NOT NULL DEFAULT 0,
    res_infantes                INTEGER      NOT NULL DEFAULT 0,
    res_numero_tickets          INTEGER      NOT NULL,
    res_precio_unitario         ms_booking.dom_importe NOT NULL,  -- tarifa adulto (snapshot)
    res_subtotal                ms_booking.dom_importe NOT NULL,
    res_observaciones           VARCHAR(500),
    res_motivo_cancelacion      VARCHAR(255),
    res_cancelacion_solicitante VARCHAR(20),
    res_checkin_en              TIMESTAMPTZ,
    res_checkin_guia            VARCHAR(150),
    res_checkin_dispositivo     VARCHAR(100),
    res_checkin_idempotencia    VARCHAR(100),
    res_creado_en               TIMESTAMPTZ  NOT NULL DEFAULT now(),
    res_actualizado_en          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    res_cancelado_en            TIMESTAMPTZ,
    res_confirmado_en           TIMESTAMPTZ,
    CONSTRAINT reserva_pasajeros_validos
        CHECK (res_adultos > 0 AND res_ninos >= 0 AND res_seniors >= 0 AND res_infantes >= 0),
    CONSTRAINT reserva_total_coherente
        CHECK (res_numero_tickets = res_adultos + res_ninos + res_seniors + res_infantes),
    CONSTRAINT reserva_solicitante_valido
        CHECK (res_cancelacion_solicitante IS NULL
               OR res_cancelacion_solicitante IN ('CLIENTE', 'SAGA_ORCHESTRATOR', 'ADMIN')),
    CONSTRAINT fk_reserva_estado FOREIGN KEY (est_id)
        REFERENCES ms_booking.estado (est_id) ON UPDATE CASCADE ON DELETE RESTRICT
);
CREATE INDEX ix_reserva_ord_id ON ms_booking.reserva (ord_id);
CREATE INDEX ix_reserva_det_id ON ms_booking.reserva (det_id);
CREATE INDEX ix_reserva_dis_id ON ms_booking.reserva (dis_id);
CREATE INDEX ix_reserva_est_id ON ms_booking.reserva (est_id);

CREATE TABLE ms_booking.reserva_pasajero (
    pax_id               BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    res_id               BIGINT       NOT NULL,
    pax_nombre           VARCHAR(120) NOT NULL,
    pax_documento        ms_booking.dom_documento,
    pax_fecha_nacimiento DATE,
    pax_es_titular       BOOLEAN      NOT NULL DEFAULT FALSE,
    CONSTRAINT fk_reserva_pasajero_reserva FOREIGN KEY (res_id)
        REFERENCES ms_booking.reserva (res_id) ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX ix_reserva_pasajero_res_id ON ms_booking.reserva_pasajero (res_id);
CREATE UNIQUE INDEX ux_reserva_pasajero_titular
    ON ms_booking.reserva_pasajero (res_id) WHERE pax_es_titular;

-- Transactional outbox: el evento se escribe en la misma transacción que el cambio.
CREATE TABLE ms_booking.outbox_evento (
    evt_id             BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    evt_uuid           UUID         NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    evt_tipo           VARCHAR(40)  NOT NULL,
    evt_agregado_id    VARCHAR(100) NOT NULL,
    evt_correlation_id VARCHAR(100) NOT NULL,
    evt_payload        JSONB        NOT NULL,
    evt_creado_en      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT outbox_evento_tipo_valido CHECK (evt_tipo IN
        ('RESERVA_CREADA', 'RESERVA_CONFIRMADA', 'RESERVA_CANCELADA', 'STOCK_ACTUALIZADO'))
);
CREATE INDEX ix_outbox_evento_tipo ON ms_booking.outbox_evento (evt_tipo, evt_id);

CREATE TRIGGER trg_reserva_actualizado BEFORE UPDATE ON ms_booking.reserva
    FOR EACH ROW EXECUTE FUNCTION ms_booking.fn_actualizar_timestamp('res_actualizado_en');

INSERT INTO ms_booking.estado (est_codigo, est_nombre, est_final) VALUES
    ('PENDIENTE_PAGO', 'Reserva pendiente de pago', FALSE),
    ('CONFIRMADA',     'Reserva confirmada',        FALSE),
    ('CHECKED_IN',     'Check-in realizado',        FALSE),
    ('CANCELADA',      'Reserva cancelada',         TRUE),
    ('COMPLETADA',     'Reserva completada',        TRUE);
`;

// 12 · Payment
const PAYMENT = `
CREATE SCHEMA ms_payment;
${importe("ms_payment")}
${estado("ms_payment")}

CREATE TABLE ms_payment.metodo_pago (
    mpa_id             SMALLINT    GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    mpa_codigo         VARCHAR(20) NOT NULL UNIQUE,
    mpa_nombre         VARCHAR(60) NOT NULL,
    mpa_requiere_datos BOOLEAN     NOT NULL DEFAULT FALSE,
    mpa_activo         BOOLEAN     NOT NULL DEFAULT TRUE
);

CREATE TABLE ms_payment.pago (
    pag_id              BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pag_numero          VARCHAR(30)  NOT NULL UNIQUE,
    ord_id              BIGINT       NOT NULL,           -- ID lógico (Order)
    mpa_id              SMALLINT     NOT NULL,
    est_id              SMALLINT     NOT NULL,
    pag_monto           ms_payment.dom_importe NOT NULL,
    pag_referencia      VARCHAR(100),
    pag_autorizacion    VARCHAR(100),
    pag_comprobante_url VARCHAR(500),
    pag_fecha           TIMESTAMPTZ  NOT NULL DEFAULT now(),
    pag_aprobado_en     TIMESTAMPTZ,
    pag_rechazado_en    TIMESTAMPTZ,
    pag_motivo_rechazo  VARCHAR(300),
    pag_creado_en       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT pago_monto_valido CHECK (pag_monto > 0),
    CONSTRAINT pago_aprobado_o_rechazado CHECK (pag_aprobado_en IS NULL OR pag_rechazado_en IS NULL),
    CONSTRAINT pago_motivo_solo_si_rechazado
        CHECK (pag_motivo_rechazo IS NULL OR pag_rechazado_en IS NOT NULL),
    CONSTRAINT fk_pago_metodo_pago FOREIGN KEY (mpa_id)
        REFERENCES ms_payment.metodo_pago (mpa_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_pago_estado FOREIGN KEY (est_id)
        REFERENCES ms_payment.estado (est_id) ON UPDATE CASCADE ON DELETE RESTRICT
);
CREATE INDEX ix_pago_ord_id ON ms_payment.pago (ord_id);
CREATE INDEX ix_pago_mpa_id ON ms_payment.pago (mpa_id);
CREATE INDEX ix_pago_est_id ON ms_payment.pago (est_id);
CREATE INDEX ix_pago_fecha  ON ms_payment.pago (pag_fecha DESC);
CREATE UNIQUE INDEX ux_pago_orden_aprobado ON ms_payment.pago (ord_id) WHERE pag_aprobado_en IS NOT NULL;

CREATE TABLE ms_payment.pago_tarjeta (
    pat_id       BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pag_id       BIGINT       NOT NULL,
    pat_marca    VARCHAR(20)  NOT NULL,
    pat_ultimos4 CHAR(4)      NOT NULL,
    pat_titular  VARCHAR(120) NOT NULL,
    pat_mes      SMALLINT     NOT NULL,
    pat_anio     SMALLINT     NOT NULL,
    pat_pais     CHAR(2)      NOT NULL,
    CONSTRAINT pago_tarjeta_mes_valido  CHECK (pat_mes BETWEEN 1 AND 12),
    CONSTRAINT pago_tarjeta_anio_valido CHECK (pat_anio BETWEEN 2020 AND 2100),
    CONSTRAINT pago_tarjeta_ultimos4_formato CHECK (pat_ultimos4 ~ '^[0-9]{4}$'),
    CONSTRAINT uq_pago_tarjeta_pag_id UNIQUE (pag_id),
    CONSTRAINT fk_pago_tarjeta_pago FOREIGN KEY (pag_id)
        REFERENCES ms_payment.pago (pag_id) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE ms_payment.pago_transferencia (
    ptr_id                  BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pag_id                  BIGINT      NOT NULL,
    ptr_banco               VARCHAR(60) NOT NULL,
    ptr_numero_comprobante  VARCHAR(40) NOT NULL,
    ptr_fecha_transferencia DATE        NOT NULL,
    ptr_archivo_adjunto     VARCHAR(500),
    CONSTRAINT uq_pago_transferencia_pag_id UNIQUE (pag_id),
    CONSTRAINT fk_pago_transferencia_pago FOREIGN KEY (pag_id)
        REFERENCES ms_payment.pago (pag_id) ON UPDATE CASCADE ON DELETE CASCADE
);

INSERT INTO ms_payment.metodo_pago (mpa_codigo, mpa_nombre, mpa_requiere_datos) VALUES
    ('TARJETA',       'Tarjeta de crédito/débito',  TRUE),
    ('TRANSFERENCIA', 'Transferencia bancaria',     FALSE),
    ('EN_SITIO',      'Pago en el punto de venta',  FALSE),
    ('PAYPAL',        'PayPal',                     FALSE),
    ('BOOKING',       'Cobrado por Booking Prototipo', FALSE);

INSERT INTO ms_payment.estado (est_codigo, est_nombre, est_final) VALUES
    ('PENDIENTE', 'Pago pendiente', FALSE),
    ('APROBADO',  'Pago aprobado',  TRUE),
    ('RECHAZADO', 'Pago rechazado', TRUE),
    ('FALLIDO',   'Pago fallido',   TRUE);
`;

// 13 · Refund
const REFUND = `
CREATE SCHEMA ms_refund;
${importe("ms_refund")}

CREATE TABLE ms_refund.reembolso (
    rem_id            BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pag_id            BIGINT      NOT NULL,              -- ID lógico (Payment)
    rem_numero        VARCHAR(30) NOT NULL UNIQUE,
    rem_monto         ms_refund.dom_importe NOT NULL,
    rem_motivo        VARCHAR(300),
    rem_referencia    VARCHAR(100),
    rem_solicitado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    rem_procesado_en  TIMESTAMPTZ,
    rem_creado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT reembolso_monto_valido CHECK (rem_monto > 0)
);
CREATE INDEX ix_reembolso_pag_id ON ms_refund.reembolso (pag_id);
`;

// 14 · Electronic Invoicing
const INVOICING = `
CREATE SCHEMA ms_invoicing;
${correo("ms_invoicing")}
${telefono("ms_invoicing")}
CREATE DOMAIN ms_invoicing.dom_porcentaje AS NUMERIC(5,2) CHECK (VALUE >= 0 AND VALUE <= 100);
${importe("ms_invoicing")}
${estado("ms_invoicing")}

CREATE TABLE ms_invoicing.factura (
    fac_id                  BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ord_id                  BIGINT       NOT NULL,       -- ID lógico (Order)
    dfa_id                  BIGINT,                      -- ID lógico (Billing Profile)
    fac_numero              VARCHAR(20)  NOT NULL UNIQUE,
    fac_clave_acceso        VARCHAR(49),
    fac_autorizacion_sri    VARCHAR(49),
    est_id                  SMALLINT     NOT NULL,
    fac_emitida_en          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    fac_subtotal            ms_invoicing.dom_importe NOT NULL,
    fac_descuento           ms_invoicing.dom_importe NOT NULL DEFAULT 0,
    fac_iva                 ms_invoicing.dom_importe NOT NULL DEFAULT 0,
    fac_total               ms_invoicing.dom_importe NOT NULL,
    fac_tipo_identificacion VARCHAR(20)  NOT NULL,
    fac_identificacion      VARCHAR(20)  NOT NULL,
    fac_razon_social        VARCHAR(150) NOT NULL,
    fac_correo              ms_invoicing.dom_correo   NOT NULL,
    fac_telefono            ms_invoicing.dom_telefono,
    CONSTRAINT factura_tipo_identificacion_valido
        CHECK (fac_tipo_identificacion IN ('CEDULA', 'RUC', 'PASAPORTE', 'CONSUMIDOR_FINAL')),
    CONSTRAINT factura_total_coherente CHECK (fac_total = fac_subtotal - fac_descuento + fac_iva),
    CONSTRAINT uq_factura_orden UNIQUE (ord_id),
    CONSTRAINT fk_factura_estado FOREIGN KEY (est_id)
        REFERENCES ms_invoicing.estado (est_id) ON UPDATE CASCADE ON DELETE RESTRICT
);
CREATE INDEX ix_factura_dfa_id ON ms_invoicing.factura (dfa_id);
CREATE INDEX ix_factura_est_id ON ms_invoicing.factura (est_id);

CREATE TABLE ms_invoicing.factura_detalle (
    fde_id              BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fac_id              BIGINT       NOT NULL,
    det_id              BIGINT       NOT NULL,           -- ID lógico (Order)
    fde_codigo          VARCHAR(25)  NOT NULL,
    fde_descripcion     VARCHAR(300) NOT NULL,
    fde_cantidad        INTEGER      NOT NULL,
    fde_precio_unitario ms_invoicing.dom_importe NOT NULL,
    fde_descuento       ms_invoicing.dom_importe NOT NULL DEFAULT 0,
    fde_subtotal        ms_invoicing.dom_importe NOT NULL,
    fde_iva_porcentaje  ms_invoicing.dom_porcentaje NOT NULL DEFAULT 0,
    fde_iva             ms_invoicing.dom_importe NOT NULL DEFAULT 0,
    fde_total           ms_invoicing.dom_importe NOT NULL,
    CONSTRAINT factura_detalle_cantidad_valida CHECK (fde_cantidad > 0),
    CONSTRAINT factura_detalle_subtotal_coherente
        CHECK (fde_subtotal = fde_cantidad * fde_precio_unitario - fde_descuento),
    CONSTRAINT factura_detalle_total_coherente CHECK (fde_total = fde_subtotal + fde_iva),
    CONSTRAINT uq_factura_detalle_det_id UNIQUE (det_id),
    CONSTRAINT fk_factura_detalle_factura FOREIGN KEY (fac_id)
        REFERENCES ms_invoicing.factura (fac_id) ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX ix_factura_detalle_fac_id ON ms_invoicing.factura_detalle (fac_id);

INSERT INTO ms_invoicing.estado (est_codigo, est_nombre, est_final) VALUES
    ('NO_PAGADA', 'Factura no pagada', FALSE),
    ('PAGADA',    'Factura pagada',    TRUE),
    ('ANULADA',   'Factura anulada',   TRUE);
`;

// 15 · Support
const SUPPORT = `
CREATE SCHEMA ms_support;
${correo("ms_support")}

CREATE TABLE ms_support.mensaje_contacto (
    men_id        BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    men_nombre    VARCHAR(120)  NOT NULL,
    men_correo    ms_support.dom_correo NOT NULL,
    men_asunto    VARCHAR(30)   NOT NULL,
    men_cuerpo    VARCHAR(2000) NOT NULL,
    men_leido     BOOLEAN       NOT NULL DEFAULT FALSE,
    men_creado_en TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX ix_mensaje_contacto_leido ON ms_support.mensaje_contacto (men_leido);
`;

// 16 · Audit
const AUDIT = `
CREATE SCHEMA ms_audit;

CREATE TABLE ms_audit.bitacora (
    bit_id         BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usu_id         BIGINT,                               -- ID lógico (Identity)
    bit_accion     VARCHAR(60) NOT NULL,
    bit_entidad    VARCHAR(60) NOT NULL,
    bit_entidad_id VARCHAR(64),
    bit_detalle    JSONB,
    bit_ip         VARCHAR(45),
    bit_creado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_bitacora_usu_id  ON ms_audit.bitacora (usu_id);
CREATE INDEX ix_bitacora_fecha   ON ms_audit.bitacora (bit_creado_en DESC);
CREATE INDEX ix_bitacora_entidad ON ms_audit.bitacora (bit_entidad, bit_entidad_id);
`;
