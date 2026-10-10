// Formas de estado: cada una es distinta en silueta, para que el color nunca vaya solo.
// Los colores salen de tokens.css (currentColor + var()).

export type TipoIcono = 'cabe' | 'margen' | 'alto' | 'altoInvertido' | 'reglas' | 'cambio' | 'pendiente' | 'noLograda' | 'espera' | 'fuera';

const CLASE_COLOR: Record<TipoIcono, string> = {
  cabe: 'ev-c-cabe',
  margen: 'ev-c-margen',
  alto: 'ev-c-alto',
  altoInvertido: '',
  reglas: 'ev-c-reglas',
  cambio: 'ev-c-reglas',
  pendiente: 'ev-c-neutro',
  noLograda: 'ev-c-neutro',
  espera: 'ev-c-reglas',
  fuera: '',
};

function Trazo({ tipo }: { tipo: TipoIcono }) {
  switch (tipo) {
    case 'cabe': // círculo con palomita
      return (
        <>
          <circle cx="12" cy="12" r="11" fill="currentColor" />
          <path d="M6.8 12.4l3.4 3.4 7-7.4" fill="none" stroke="var(--superficie)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </>
      );
    case 'margen': // triángulo con flecha hacia arriba
      return (
        <>
          <path d="M12 2.6L22.6 21H1.4z" fill="currentColor" stroke="var(--margen-tinta)" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M12 17.6v-7.4M8.8 13l3.2-3.2 3.2 3.2" fill="none" stroke="var(--tinta)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </>
      );
    case 'alto': // octágono con barra
      return (
        <>
          <path d="M7.4 1h9.2L23 7.4v9.2L16.6 23H7.4L1 16.6V7.4z" fill="currentColor" />
          <path d="M6.5 12h11" stroke="var(--sobre-alto)" strokeWidth="3" strokeLinecap="round" />
        </>
      );
    case 'altoInvertido':
      return (
        <>
          <path d="M7.4 1h9.2L23 7.4v9.2L16.6 23H7.4L1 16.6V7.4z" fill="var(--sobre-alto)" />
          <path d="M6.5 12h11" stroke="var(--alto)" strokeWidth="3" strokeLinecap="round" />
        </>
      );
    case 'reglas': // escudo con cruz: lo que las reglas frenaron
      return (
        <>
          <path d="M12 1.2l9.3 3.3v6.9c0 5.4-3.8 9.4-9.3 11.4C6.5 20.8 2.7 16.8 2.7 11.4V4.5z" fill="currentColor" />
          <path d="M8.6 8.4l6.8 6.8M15.4 8.4l-6.8 6.8" stroke="var(--superficie)" strokeWidth="2.3" strokeLinecap="round" />
        </>
      );
    case 'cambio': // cuadro con dos flechas encontradas
      return (
        <>
          <rect x="1.5" y="1.5" width="21" height="21" rx="5" fill="currentColor" />
          <path d="M6.5 9.2h10.4l-2.6-2.7M17.5 14.8H7.1l2.6 2.7" fill="none" stroke="var(--superficie)" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
        </>
      );
    case 'pendiente': // círculo punteado, vacío
      return (
        <>
          <circle cx="12" cy="12" r="9.8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeDasharray="3.4 3" />
          <circle cx="12" cy="12" r="2.2" fill="currentColor" />
        </>
      );
    case 'espera': // reloj de arena: preparado, esperando a una persona
      return (
        <>
          <path d="M4.5 1.5h15v4.2L14.2 12l5.3 6.3v4.2h-15v-4.2L9.8 12 4.5 5.7z" fill="currentColor" strokeLinejoin="round" stroke="currentColor" strokeWidth="1.6" />
          <path d="M8 19.6h8L12 15z" fill="var(--superficie)" />
        </>
      );
    case 'fuera': // flecha que sale del cuadro: abre otra pestaña
      return (
        <path d="M13.5 4.5H19.5V10.5M19.5 4.5l-8.2 8.2M10 6H6.2A1.7 1.7 0 0 0 4.5 7.7v10.1a1.7 1.7 0 0 0 1.7 1.7h10.1a1.7 1.7 0 0 0 1.7-1.7V14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      );
    case 'noLograda': // rombo con diagonal
      return (
        <>
          <path d="M12 1.2L22.8 12 12 22.8 1.2 12z" fill="currentColor" />
          <path d="M8.4 15.6l7.2-7.2" stroke="var(--superficie)" strokeWidth="2.3" strokeLinecap="round" />
        </>
      );
  }
}

export function Icono({ tipo, grande }: { tipo: TipoIcono; grande?: boolean }) {
  return (
    <svg
      className={`ev-ic ${grande ? 'ev-ic--grande' : ''} ${CLASE_COLOR[tipo]}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <Trazo tipo={tipo} />
    </svg>
  );
}
