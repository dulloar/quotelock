import { crearServidor } from './app.ts';
import { crearReap } from './reap.ts';

const fx = Number(process.env.FX_USD_MXN) || 18.5;
const reap = crearReap(process.env);
const puerto = Number(process.env.PORT) || 3001;

crearServidor({ reap, ahora: () => new Date(), fx }).listen(puerto, () => {
  console.log(`QuoteLock backend en http://localhost:${puerto} (modo ${reap.modoSimulado ? 'SIMULADO' : 'REAP real'}, FX simulado USD->MXN ${fx})`);
});
