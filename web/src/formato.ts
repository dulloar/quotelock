const pesos = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function mxn(n: number): string {
  return pesos.format(n);
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
