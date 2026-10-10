import type { Brief, Margen } from './tipos';

// Lógica del brief sin React: lo que el usuario teclea, su validación y los briefs de la demo.
// La validación refleja backend/src/validacion.ts; el techo, backend/src/app.ts.

export const MARGENES: Margen[] = [0.1, 0.2, 0.3];

/** Lo que hay en los campos del formulario: todo texto, tal como se tecleó. */
export interface CamposBrief {
  nombre: string;
  fecha: string;
  asistentes: string;
  presupuesto: string;
  margen: string;
}

export type Campo = keyof CamposBrief;
export type ErroresBrief = Partial<Record<Campo, string>>;

export const CAMPOS_VACIOS: CamposBrief = { nombre: '', fecha: '', asistentes: '', presupuesto: '', margen: '0.2' };

/** Acepta "30000", "30,000", "30 000" y "$30,000.50". Devuelve NaN si no es una cantidad. */
export function leerNumero(texto: string): number {
  const limpio = texto.replace(/[\s,$]/g, '');
  return /^\d+(\.\d+)?$/.test(limpio) ? Number(limpio) : NaN;
}

export function leerMargen(texto: string): Margen | undefined {
  return MARGENES.find((m) => String(m) === texto);
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Techo = presupuesto × (1 + margen), con el mismo redondeo a centavos que el backend. */
export function techoMXN(presupuestoMXN: number, margen: number): number {
  return redondear(presupuestoMXN * (1 + margen));
}

function fechaReal(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

export function validarCampos(c: CamposBrief): { errores: ErroresBrief; brief: Brief | null } {
  const errores: ErroresBrief = {};
  const nombre = c.nombre.trim();
  const asistentes = leerNumero(c.asistentes);
  const presupuestoMXN = leerNumero(c.presupuesto);
  const margen = leerMargen(c.margen);

  if (!nombre) errores.nombre = 'Escribe el nombre del evento.';
  if (!fechaReal(c.fecha)) errores.fecha = 'Elige una fecha válida (AAAA-MM-DD).';
  if (!Number.isInteger(asistentes) || asistentes <= 0) errores.asistentes = 'Asistentes debe ser un número entero mayor que cero.';
  if (!Number.isFinite(presupuestoMXN) || presupuestoMXN <= 0)
    errores.presupuesto = 'El presupuesto debe ser una cantidad mayor que cero, en pesos.';
  if (margen === undefined) errores.margen = 'Elige un margen: 10%, 20% o 30%.';

  if (Object.keys(errores).length > 0 || margen === undefined) return { errores, brief: null };
  return { errores, brief: { nombre, fecha: c.fecha, asistentes, presupuestoMXN, margen } };
}

export interface BriefDePrueba {
  clave: string;
  titulo: string;
  /** Lo que se espera que pase al ejecutarlo contra el backend en modo simulado. */
  esperado: string;
  campos: CamposBrief;
}

// Los tres briefs de backend/README.md: mismo evento de 40 asistentes, cambia presupuesto y margen.
const base = { fecha: '2026-10-24', asistentes: '40' };

export const BRIEFS_DE_PRUEBA: BriefDePrueba[] = [
  {
    clave: 'cabe',
    titulo: 'Caso 1 · Cabe',
    esperado: 'Se paga todo sin ajustes (pagado)',
    campos: { ...base, nombre: 'Workshop corporativo · caso 1', presupuesto: '30000', margen: '0.1' },
  },
  {
    clave: 'margen',
    titulo: 'Caso 2 · Cabe con margen',
    esperado: 'Replanea y paga dentro del techo (ajustado)',
    campos: { ...base, nombre: 'Workshop corporativo · caso 2', presupuesto: '5500', margen: '0.3' },
  },
  {
    clave: 'rebasa',
    titulo: 'Caso 3 · Rebasa el margen',
    esperado: 'Se detiene sin cobrar nada (revisión humana)',
    campos: { ...base, nombre: 'Workshop corporativo · caso 3', presupuesto: '5500', margen: '0.1' },
  },
];
