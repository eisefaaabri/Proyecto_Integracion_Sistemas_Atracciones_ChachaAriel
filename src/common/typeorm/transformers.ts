import { ValueTransformer } from "typeorm";

// pg devuelve BIGINT y NUMERIC como texto; los IDs y montos de este proyecto caben en number.
export const aNumero: ValueTransformer = {
  to: (v) => v,
  from: (v) => (v === null || v === undefined ? v : Number(v)),
};
