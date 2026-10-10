import { crearServidor } from './app.ts';
import { crearReap } from './reap.ts';
import { crearLlmDeepSeek } from './agente.ts';

const fx = Number(process.env.FX_USD_MXN) || 18.5;
const reap = crearReap(process.env);
const puerto = Number(process.env.PORT) || 3001;

const modelo = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const llm = process.env.DEEPSEEK_API_KEY && process.env.MODO_AGENTE !== 'reglas';
const agente = llm ? { llm: crearLlmDeepSeek(process.env.DEEPSEEK_API_KEY!, modelo), modelo } : undefined;

crearServidor({ reap, ahora: () => new Date(), fx }, undefined, agente ? { agente } : {}).listen(puerto, () => {
  console.log(`QuoteLock backend en http://localhost:${puerto} (modo ${reap.modoSimulado ? 'SIMULADO' : 'REAP real'}, FX simulado USD->MXN ${fx}, agente ${agente ? `LLM ${modelo}` : 'determinista'})`);
});
