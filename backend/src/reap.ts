// Stub de B0; se reemplaza en B2.
export interface ReapClient { modoSimulado: boolean }
export function crearReap(_env: Record<string, string | undefined>): ReapClient {
  return { modoSimulado: true };
}
