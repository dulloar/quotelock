import { CATALOGO, ENVIO } from './catalogo.ts';

export interface SolicitudCotizacion {
  comercio: string;
  productoId: string;
  query: string;
  cantidad: number;
}

export interface Cotizacion {
  id: string;
  comercio: string;
  productoId: string;
  nombreProducto: string;
  cantidad: number;
  moneda: string;
  finalAmount: number; // amountBreakdown.finalAmount, en la moneda original
  expiresAt: string;
  paisEnvio: string;
}

export interface Checkout {
  id: string;
  status: string;
  orderId: string | null;
  finalAmount: number | null;
  moneda: string;
}

export class ReapError extends Error {
  code: string;
  status: number;
  retryAfter: number | null;
  constructor(code: string, message: string, status = 0, retryAfter: number | null = null) {
    super(message);
    this.name = 'ReapError';
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export interface ReapClient {
  modoSimulado: boolean;
  cotizar(s: SolicitudCotizacion): Promise<Cotizacion>;
  crearCheckout(q: Cotizacion): Promise<Checkout>;
  obtenerCheckout(id: string): Promise<Checkout>;
}

// ---------------------------------------------------------------- Simulado
export class ReapSimulado implements ReapClient {
  modoSimulado = true;
  ahora: () => Date;
  vigenciaMs: number;
  n = 0;
  checkouts = new Map<string, Checkout>();
  constructor(ahora: () => Date = () => new Date(), vigenciaMs = 10 * 60 * 1000) {
    this.ahora = ahora;
    this.vigenciaMs = vigenciaMs;
  }
  async cotizar(s: SolicitudCotizacion): Promise<Cotizacion> {
    const p = CATALOGO.find((x) => x.id === s.productoId && x.comercio === s.comercio);
    if (!p) throw new ReapError('QUOTE_UNFULFILLABLE', `Producto ${s.productoId} no disponible en ${s.comercio} (simulado)`, 400);
    this.n += 1;
    const envio = ENVIO[p.comercio] ?? 0;
    return {
      id: `quo_sim_${this.n}`,
      comercio: p.comercio,
      productoId: p.id,
      nombreProducto: p.nombre,
      cantidad: s.cantidad,
      moneda: p.moneda,
      finalAmount: Math.round((p.precio * s.cantidad + envio) * 100) / 100, // items + envío simulado
      expiresAt: new Date(this.ahora().getTime() + this.vigenciaMs).toISOString(),
      paisEnvio: 'MX',
    };
  }
  async crearCheckout(q: Cotizacion): Promise<Checkout> {
    this.n += 1;
    const c: Checkout = { id: `chk_sim_${this.n}`, status: 'COMPLETED', orderId: `ord_sim_${this.n}`, finalAmount: q.finalAmount, moneda: q.moneda };
    this.checkouts.set(c.id, c);
    return c;
  }
  async obtenerCheckout(id: string): Promise<Checkout> {
    const c = this.checkouts.get(id);
    if (!c) throw new ReapError('CHECKOUT_NOT_FOUND', 'Checkout no encontrado', 404);
    return c;
  }
}

// -------------------------------------------------------------------- Real
// SIN PROBAR contra el sandbox (aún no hay API key). Implementado según docs/03.
const FINALES = ['COMPLETED', 'FAILED', 'EXPIRED'];

export interface ConfigReal {
  baseUrl: string;
  apiKey: string;
  version: string;
  returnUrl: string;
  enrollmentId: string;
  email: string;
  pollMs?: number;
  pollMaxMs?: number;
}

export function mapearError(status: number, cuerpo: unknown, retryAfter: number | null): ReapError {
  const e = (cuerpo as { error?: { code?: string; message?: string } } | null)?.error;
  const code = e?.code ?? (status === 429 ? 'RATE_LIMIT_EXCEEDED' : status === 503 ? 'AGENTIC_SERVICE_UNAVAILABLE' : 'AGENTIC_REQUEST_REJECTED');
  const acciones: Record<string, string> = {
    QUOTE_EXPIRED: 'Cotización vencida: recotizar y revalidar reglas',
    VARIANT_UNAVAILABLE: 'Producto agotado: buscar sustituto',
    QUOTE_UNFULFILLABLE: 'No se puede surtir: cambiar de comercio o producto',
    CARD_PAYMENT_UNAVAILABLE: 'Pago con tarjeta no disponible: cambiar de comercio',
    MERCHANT_NOT_RESOLVED: 'Comercio no reconocido',
    AGENTIC_PAYMENTS_NOT_ENABLED: 'El proyecto no tiene el módulo agentic activo',
    ENROLLMENT_NOT_ACTIVE: 'Enrollment no activo: rehacerlo',
    RATE_LIMIT_EXCEEDED: 'Límite de consultas excedido',
  };
  return new ReapError(code, acciones[code] ?? e?.message ?? `Error de Reap (HTTP ${status})`, status, retryAfter);
}

export class ReapReal implements ReapClient {
  modoSimulado = false;
  cfg: ConfigReal;
  constructor(cfg: ConfigReal) {
    this.cfg = cfg;
  }
  async llamar(metodo: 'GET' | 'POST', ruta: string, cuerpo?: unknown, extra: Record<string, string> = {}): Promise<any> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.cfg.apiKey}`,
      'Reap-Version': this.cfg.version,
      ...extra,
    };
    if (metodo === 'POST') headers['Content-Type'] = 'application/json';
    const res = await fetch(this.cfg.baseUrl + ruta, { method: metodo, headers, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
    const texto = await res.text();
    let json: unknown = null;
    try { json = texto ? JSON.parse(texto) : null; } catch { json = null; }
    if (!res.ok) {
      const ra = Number(res.headers.get('Retry-After'));
      throw mapearError(res.status, json, Number.isFinite(ra) && ra > 0 ? ra : null);
    }
    return json;
  }
  async cotizar(s: SolicitudCotizacion): Promise<Cotizacion> {
    const busqueda = await this.llamar('POST', '/agentic/products/search', {
      query: s.query,
      merchantPreference: { mode: 'ONLY', merchantName: s.comercio },
      context: { country: 'MX', currency: 'MXN' },
      filters: { availability: 'AVAILABLE_ONLY' },
      pagination: { limit: 5 },
    });
    const prod = busqueda?.products?.[0];
    const variante = prod?.previewVariant;
    if (!variante) throw new ReapError('QUOTE_UNFULFILLABLE', `Sin productos para "${s.query}" en ${s.comercio}`, 400);
    let q = await this.llamar(
      'POST',
      '/agentic/quotes',
      {
        email: this.cfg.email,
        items: [{ variantId: variante.id, quantity: s.cantidad }],
        shippingAddress: {
          firstName: 'Evento', lastName: 'QuoteLock', phone: '+525512345678',
          addressLine1: 'Av. Reforma 1', city: 'Ciudad de Mexico', region: 'CDMX', postalCode: '06600', country: 'MX',
        },
      },
      { 'Idempotency-Key': crypto.randomUUID() },
    );
    const opcion = q.shippingOptions?.find((o: any) => o.selected) ?? q.shippingOptions?.[0];
    if (opcion && !opcion.selected) q = await this.llamar('POST', `/agentic/quotes/${q.id}/shipping-option`, { shippingOptionId: opcion.id });
    const fa = q.amountBreakdown?.finalAmount;
    const monto = Number(typeof fa === 'object' && fa !== null ? fa.amount : fa);
    const moneda = String((typeof fa === 'object' && fa !== null ? fa.currency : undefined) ?? q.amountBreakdown?.currency ?? variante.price?.currency ?? 'MXN');
    return {
      id: q.id, comercio: s.comercio, productoId: s.productoId, nombreProducto: String(prod.name ?? s.query),
      cantidad: s.cantidad, moneda, finalAmount: monto, expiresAt: q.expiresAt, paisEnvio: 'MX',
    };
  }
  mapearCheckout(c: any, moneda: string): Checkout {
    return { id: c.id, status: c.status, orderId: c.orderId ?? null, finalAmount: c.finalAmount != null ? Number(typeof c.finalAmount === 'object' ? c.finalAmount.amount : c.finalAmount) : null, moneda };
  }
  async crearCheckout(q: Cotizacion): Promise<Checkout> {
    const c = await this.llamar(
      'POST',
      '/agentic/checkouts',
      { quoteId: q.id, enrollmentId: this.cfg.enrollmentId, presentation: { type: 'REDIRECT', returnUrl: this.cfg.returnUrl } },
      { 'Idempotency-Key': crypto.randomUUID(), 'X-Simulate-Checkout': 'COMPLETED' },
    );
    let actual = this.mapearCheckout(c, q.moneda);
    const inicio = Date.now();
    const pollMs = this.cfg.pollMs ?? 2000;
    const max = this.cfg.pollMaxMs ?? 60_000;
    while (!FINALES.includes(actual.status) && Date.now() - inicio < max) {
      await new Promise((r) => setTimeout(r, pollMs));
      actual = await this.obtenerCheckout(actual.id, q.moneda);
    }
    return actual;
  }
  async obtenerCheckout(id: string, moneda = 'MXN'): Promise<Checkout> {
    return this.mapearCheckout(await this.llamar('GET', `/agentic/checkouts/${id}`), moneda);
  }
}

export function crearReap(env: Record<string, string | undefined>): ReapClient {
  if (!env.REAP_API_KEY) return new ReapSimulado();
  return new ReapReal({
    baseUrl: env.REAP_BASE_URL || 'https://sg.sandbox.api.reap.global',
    apiKey: env.REAP_API_KEY,
    version: env.REAP_VERSION || '2025-02-14',
    returnUrl: env.REAP_RETURN_URL || 'https://example.com/return',
    enrollmentId: env.REAP_ENROLLMENT_ID || '',
    email: env.REAP_EMAIL || 'evento@example.com',
  });
}
