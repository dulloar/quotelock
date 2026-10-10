import { CATALOGO, ENVIO } from './catalogo.ts';
import { COMERCIOS } from './comercios.ts';
import { reglaComercio } from './reglas.ts';

export interface SolicitudCotizacion {
  comercio: string;
  productoId: string;
  query: string;
  cantidad: number;
  // Si viene, se cotiza esa variante exacta (sin búsqueda); query lleva el nombre del producto.
  varianteId?: string;
}

export interface ProductoBuscado {
  varianteId: string;
  nombre: string;
  precio: number; // unitario, en `moneda`
  moneda: string;
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
  nextAction?: { url: string; expiresAt: string | null } | null;
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
  modoPago: 'aprobacion' | 'simulado';
  buscar(comercio: string, consulta: string): Promise<ProductoBuscado[]>;
  cotizar(s: SolicitudCotizacion): Promise<Cotizacion>;
  crearCheckout(q: Cotizacion): Promise<Checkout>;
  obtenerCheckout(id: string): Promise<Checkout>;
}

// ---------------------------------------------------------------- Simulado
export class ReapSimulado implements ReapClient {
  modoSimulado = true;
  modoPago: 'aprobacion' | 'simulado' = 'simulado';
  ahora: () => Date;
  vigenciaMs: number;
  n = 0;
  checkouts = new Map<string, Checkout>();
  constructor(ahora: () => Date = () => new Date(), vigenciaMs = 10 * 60 * 1000) {
    this.ahora = ahora;
    this.vigenciaMs = vigenciaMs;
  }
  async buscar(comercio: string, consulta: string): Promise<ProductoBuscado[]> {
    const delComercio = CATALOGO.filter((x) => x.comercio === comercio && reglaComercio(comercio, 'MX', x.nombre).ok);
    const palabras = consulta.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const coinciden = delComercio.filter((x) => palabras.some((w) => `${x.nombre} ${x.query} ${x.id}`.toLowerCase().includes(w)));
    return (coinciden.length > 0 ? coinciden : delComercio).slice(0, 8).map((x) => ({ varianteId: x.id, nombre: x.nombre, precio: x.precio, moneda: x.moneda }));
  }
  async cotizar(s: SolicitudCotizacion): Promise<Cotizacion> {
    const p = CATALOGO.find((x) => x.id === (s.varianteId ?? s.productoId) && x.comercio === s.comercio);
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
// Probado contra el sandbox real (búsqueda y cotización); formas de respuesta en test/reap.test.ts.
export interface ConfigReal {
  baseUrl: string;
  apiKey: string;
  version: string;
  returnUrl: string;
  enrollmentId: string;
  email: string;
  modoPago?: 'aprobacion' | 'simulado';
  pollMs?: number;
  pollMaxMs?: number;
  espera?: (ms: number) => Promise<void>;
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
    VALIDATION_FAILED: 'Solicitud inválida para Reap (422)',
    RATE_LIMIT_EXCEEDED: 'Límite de consultas excedido',
  };
  return new ReapError(code, acciones[code] ?? e?.message ?? `Error de Reap (HTTP ${status})`, status, retryAfter);
}

export interface Monto {
  amount: number;
  currency: string;
}

// Los montos de Reap son objetos {amount, currency}; acepta también números sueltos.
export function parsearMonto(x: unknown, monedaPorDefecto = 'MXN'): Monto | null {
  if (x == null) return null;
  if (typeof x === 'number' || typeof x === 'string') {
    const n = Number(x);
    return Number.isFinite(n) ? { amount: n, currency: monedaPorDefecto } : null;
  }
  const o = x as { amount?: unknown; currency?: unknown };
  const n = Number(o.amount);
  if (!Number.isFinite(n)) return null;
  return { amount: n, currency: String(o.currency ?? monedaPorDefecto) };
}

export interface ProductoReap {
  id: string;
  name: string;
  available?: boolean;
  priceRange?: { min?: unknown; max?: unknown };
  previewVariant?: { id: string; name?: string; price?: unknown; available?: boolean };
}

export interface Candidato {
  producto: ProductoReap;
  variantId: string;
  precio: Monto;
}

// Elige el producto disponible más barato que pase las reglas (categorías prohibidas).
export function elegirProducto(productos: ProductoReap[], comercio: string): Candidato | null {
  return candidatos(productos, comercio)[0] ?? null;
}

// Candidatos válidos ordenados de más barato a más caro.
export function candidatos(productos: ProductoReap[], comercio: string): Candidato[] {
  const lista: Candidato[] = [];
  for (const p of productos ?? []) {
    const v = p.previewVariant;
    if (!v?.id || p.available === false || v.available === false) continue;
    if (!reglaComercio(comercio, 'MX', p.name ?? '').ok) continue;
    const precio = parsearMonto(v.price) ?? parsearMonto(p.priceRange?.min);
    if (!precio) continue;
    lista.push({ producto: p, variantId: v.id, precio });
  }
  return lista.sort((a, b) => a.precio.amount - b.precio.amount);
}

export function parsearCotizacion(q: any, s: SolicitudCotizacion, cand: Candidato): Cotizacion {
  const fa = parsearMonto(q?.amountBreakdown?.finalAmount, cand.precio.currency);
  if (!q?.id || !fa) throw new ReapError('AGENTIC_REQUEST_REJECTED', 'Cotización de Reap sin id o finalAmount', 502);
  return {
    id: q.id, comercio: s.comercio, productoId: cand.producto.id, nombreProducto: String(cand.producto.name ?? s.query),
    cantidad: s.cantidad, moneda: fa.currency, finalAmount: fa.amount, expiresAt: q.expiresAt, paisEnvio: 'MX',
  };
}

export function mapearCheckoutReap(c: any, monedaPorDefecto = 'MXN'): Checkout {
  // POST devuelve `amount`; GET devuelve `finalAmount`.
  const m = parsearMonto(c?.finalAmount ?? c?.amount, monedaPorDefecto);
  const na = c?.nextAction?.url ? { url: String(c.nextAction.url), expiresAt: c.nextAction.expiresAt ?? null } : null;
  return { id: c.id, status: c.status, orderId: c.orderId ?? null, finalAmount: m ? m.amount : null, moneda: m?.currency ?? monedaPorDefecto, nextAction: na };
}

export class ReapReal implements ReapClient {
  modoSimulado = false;
  modoPago: 'aprobacion' | 'simulado';
  cfg: ConfigReal;
  constructor(cfg: ConfigReal) {
    this.cfg = cfg;
    this.modoPago = cfg.modoPago ?? 'aprobacion';
  }
  // Con reintentar=true, los fallos pasajeros (503/429/red) se repiten hasta 3 veces (1 s, 2 s, 4 s; tope 5 s o Retry-After).
  // Los headers (incluida la Idempotency-Key) se reutilizan tal cual en los reintentos.
  async llamar(metodo: 'GET' | 'POST', ruta: string, cuerpo?: unknown, extra: Record<string, string> = {}, reintentar = false): Promise<any> {
    const espera = this.cfg.espera ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    for (let intento = 0; ; intento++) {
      try {
        return await this.llamarUnaVez(metodo, ruta, cuerpo, extra);
      } catch (e) {
        const pasajero = e instanceof ReapError && (['AGENTIC_SERVICE_UNAVAILABLE', 'QUOTE_TEMPORARILY_UNAVAILABLE', 'NETWORK_ERROR'].includes(e.code) || e.status === 503 || e.status === 429);
        if (!reintentar || !pasajero || intento >= 3) throw e;
        const ra = (e as ReapError).retryAfter;
        await espera(Math.min(5000, ra != null ? ra * 1000 : 1000 * 2 ** intento));
      }
    }
  }
  async llamarUnaVez(metodo: 'GET' | 'POST', ruta: string, cuerpo?: unknown, extra: Record<string, string> = {}): Promise<any> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.cfg.apiKey}`,
      'Reap-Version': this.cfg.version,
      ...extra,
    };
    if (metodo === 'POST') headers['Content-Type'] = 'application/json';
    let res: Response;
    let texto: string;
    try {
      res = await fetch(this.cfg.baseUrl + ruta, { method: metodo, headers, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
      texto = await res.text();
    } catch (e) {
      throw new ReapError('NETWORK_ERROR', `Error de red hacia Reap: ${(e as Error)?.message ?? e}`, 0);
    }
    let json: unknown = null;
    try { json = texto ? JSON.parse(texto) : null; } catch { json = null; }
    if (!res.ok) {
      const ra = Number(res.headers.get('Retry-After'));
      throw mapearError(res.status, json, Number.isFinite(ra) && ra > 0 ? ra : null);
    }
    return json;
  }
  async buscar(comercio: string, consulta: string): Promise<ProductoBuscado[]> {
    const nombre = COMERCIOS[comercio]?.nombre;
    if (!nombre) throw new ReapError('MERCHANT_NOT_RESOLVED', `Comercio ${comercio} sin nombre verificado para búsqueda`, 400);
    const busqueda = await this.llamar('POST', '/agentic/products/search', {
      query: consulta,
      merchantPreference: { mode: 'ONLY', merchantName: nombre },
      context: { country: 'MX', currency: 'MXN' },
      pagination: { limit: 10 },
    }, {}, true);
    return candidatos(busqueda?.products ?? [], comercio).slice(0, 8).map((c) => ({
      varianteId: c.variantId, nombre: String(c.producto.name ?? consulta), precio: c.precio.amount, moneda: c.precio.currency,
    }));
  }
  // Una búsqueda + una cotización por llamada (rate limit 150/min). Con varianteId se cotiza directo, sin búsqueda.
  async cotizar(s: SolicitudCotizacion): Promise<Cotizacion> {
    let lista: Candidato[];
    if (s.varianteId) {
      lista = [{ producto: { id: s.varianteId, name: s.query }, variantId: s.varianteId, precio: { amount: 0, currency: 'MXN' } }];
    } else {
      const nombre = COMERCIOS[s.comercio]?.nombre;
      if (!nombre) throw new ReapError('MERCHANT_NOT_RESOLVED', `Comercio ${s.comercio} sin nombre verificado para búsqueda`, 400);
      const busqueda = await this.llamar('POST', '/agentic/products/search', {
        query: s.query,
        merchantPreference: { mode: 'ONLY', merchantName: nombre },
        context: { country: 'MX', currency: 'MXN' },
        pagination: { limit: 10 },
      }, {}, true);
      lista = candidatos(busqueda?.products ?? [], s.comercio).slice(0, 3);
      if (lista.length === 0) throw new ReapError('QUOTE_UNFULFILLABLE', `Sin productos disponibles y permitidos para "${s.query}" en ${nombre}`, 400);
    }
    let q: any = null;
    let cand = lista[0];
    let ultimo: unknown = null;
    // Si la variante más barata no alcanza en stock, se prueba la siguiente (máx. 3 cotizaciones).
    for (const c of lista) {
      const llave = crypto.randomUUID(); // misma llave en los reintentos de este intento
      try {
        q = await this.llamar(
          'POST',
          '/agentic/quotes',
          {
            email: this.cfg.email,
            items: [{ variantId: c.variantId, quantity: s.cantidad }],
            shippingAddress: {
              firstName: 'Equipo', lastName: 'Teamblue', phone: '+525555555555',
              addressLine1: 'Av. Paseo de la Reforma 222', city: 'Ciudad de México', region: 'CDMX', postalCode: '06600', country: 'MX',
            },
          },
          { 'Idempotency-Key': llave },
          true,
        );
        cand = c;
        break;
      } catch (e) {
        ultimo = e;
        if (!(e instanceof ReapError && ['VARIANT_UNAVAILABLE', 'QUOTE_UNFULFILLABLE'].includes(e.code))) throw e;
      }
    }
    if (!q) throw ultimo;
    // Normalmente ya viene una opción seleccionada; solo se llama a shipping-option si no.
    const opciones: any[] = q.shippingOptions ?? [];
    if (opciones.length > 0 && !opciones.some((o) => o.selected))
      q = await this.llamar('POST', `/agentic/quotes/${q.id}/shipping-option`, { shippingOptionId: opciones[0].id }, {}, true);
    return parsearCotizacion(q, s, cand);
  }
  async crearCheckout(q: Cotizacion): Promise<Checkout> {
    // Plan B: el pago se simula localmente, sin llamar a Reap.
    if (this.modoPago === 'simulado')
      return { id: `chk_sim_${crypto.randomUUID()}`, status: 'COMPLETED', orderId: `sim_${crypto.randomUUID()}`, finalAmount: q.finalAmount, moneda: q.moneda, nextAction: null };
    // Sin X-Simulate-Checkout: queda en REQUIRES_ACTION con nextAction.url; una persona aprueba en Reap.
    const c = await this.llamar(
      'POST',
      '/agentic/checkouts',
      { quoteId: q.id, enrollmentId: this.cfg.enrollmentId, presentation: { type: 'REDIRECT', returnUrl: this.cfg.returnUrl } },
      { 'Idempotency-Key': crypto.randomUUID() },
    );
    return mapearCheckoutReap(c, q.moneda);
  }
  async obtenerCheckout(id: string, moneda = 'MXN'): Promise<Checkout> {
    return mapearCheckoutReap(await this.llamar('GET', `/agentic/checkouts/${id}`), moneda);
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
    modoPago: env.MODO_PAGO === 'simulado' ? 'simulado' : 'aprobacion',
  });
}
