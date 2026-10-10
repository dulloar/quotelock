const pesosEnteros = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});

const pesosConCentavos = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// Sin centavos cuando el monto es entero; con dos decimales cuando no ($6,718.90, nunca $6,718.9).
export function mxn(n: number): string {
  return (Number.isInteger(n) ? pesosEnteros : pesosConCentavos).format(n);
}

// El backend escribe los montos de la línea de tiempo en crudo ("6718.9 MXN"); aquí solo se les da formato.
export function mensajeLegible(mensaje: string): string {
  return mensaje.replace(/(\d+(?:\.\d+)?) MXN/g, (_, monto: string) => mxn(Number(monto)));
}

export function porcentaje(fraccion: number): string {
  return `${Math.round(fraccion * 100)}%`;
}

export function fechaLarga(iso: string): string {
  // La fecha del brief es un día, sin hora: se fija al mediodía para que no se recorra por zona horaria.
  return new Date(`${iso}T12:00:00`).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function horaCorta(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export const ETIQUETA_ESTADO_EVENTO = {
  borrador: 'Borrador',
  pagado: 'Pagado',
  ajustado: 'Ajustado dentro del margen',
  revision_humana: 'Revisión humana',
} as const;

export const ETIQUETA_ESTADO_PARTIDA = {
  pendiente: 'Pendiente',
  pagado: 'Pagado',
  ajustado: 'Ajustado',
  no_lograda: 'No lograda',
  bloqueado: 'Bloqueado',
} as const;
