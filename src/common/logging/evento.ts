// Línea de log estructurada (JSON con timestamp ISO) para la consola del backend.
export function evento(event: string, data: object = {}): string {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    event,
    ...data,
  });
}

// Oculta parte del correo en los logs: maria.flores@epn.edu.ec -> ma***@epn.edu.ec
export function correoParcial(
  correo: string | null | undefined,
): string | null {
  if (!correo) return null;
  const [usuario, dominio] = correo.split("@");
  return dominio ? `${usuario.slice(0, 2)}***@${dominio}` : "***";
}
