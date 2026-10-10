# QuoteLock — Alineación con las reglas del hackathon

**Evento:** Agentic Hackathon de Reap × AI Builders México (pagos agénticos), 9 oct 2026
**Equipo:** teamblue (David y Pepe)
**Track:** Most Worthwhile Problem
**Estado:** fase de alineación. La ejecución va después.

> **Margen** en este documento = excedente permitido sobre lo presupuestado (10%, 20% o 30%, elegido por evento), no ganancia del organizador.
>
> Etiquetas: **[Evidencia]** viene de la guía oficial o de lo que observó el usuario. **[Inferencia]** es una lectura de Claude. **[Propuesta]** es una idea de Claude, no del equipo.

---

## 1. Aclaración base: ¿qué APIs son obligatorias?

- **[Evidencia]** Las APIs obligatorias son las del **Agentic module de Reap**, no las de cada comercio.
- A los comercios se llega solo a través de Reap: búsqueda → cotización (`quotes`) → `checkouts`.
- Nunca se entra directo a la tienda ni a su API de Shopify.

---

## 2. Reglas clasificadas

### A. Obligatorias (fallar una descalifica)

| Regla | Qué implica |
|---|---|
| Usar el Agentic module de Reap | Todo pago pasa por `quotes` → `checkouts` |
| Solo comercios de la lista | Se consulta con `/merchants` en el bot de Telegram. Revisar el día de la demo porque puede cambiar |
| Todo en sandbox | Nada de dinero real |
| Equipo con líder definido | La API key llega por Telegram solo al líder |

### B. Prohibidas (fuera de alcance)

| Regla | Qué implica para QuoteLock |
|---|---|
| Scraping del checkout / atajos al módulo | No automatizar la página de pago de la tienda. No usar los "Cart permalink" de la hoja de comercios para comprar por fuera |
| Pasar datos de tarjeta al LLM | El LLM nunca toca credenciales. Solo pide cotizaciones y el pago lo ejecuta el backend |
| Viajes de cualquier tipo | Nada de hotel ni transporte de ponentes, aunque el evento lo invite |
| Categorías restringidas por las redes | La guía nombra apuestas y contenido adulto |

### C. Criterios de evaluación (no descalifican, pero restan)

| Criterio | Riesgo en la demo |
|---|---|
| El pago es el centro, no un extra | **Riesgo principal.** Planear y conciliar puede opacar el pago. La pantalla principal debe ser el libro de movimientos |
| No es un chatbot genérico de compras | Entrada: un brief. Salida: un plan de gasto, no un chat que busca y compra |
| Saber a qué track se aplica | Most Worthwhile Problem |

---

## 3. Qué significa "nada de scraping"

- **[Evidencia]** La guía prohíbe atajos al Agentic module y pone como ejemplo el scraping del checkout.
- **[Inferencia]** El objetivo es que ninguna compra se salte el control de Reap. Leer el catálogo público de una tienda no está prohibido de forma explícita, pero la búsqueda de producto ya existe como endpoint de Reap. Traer datos de otro lado puede verse como un atajo.
- **[Propuesta]** Búsqueda, precio y compra, todo por Reap. Así no hay nada que defender ante el jurado.

## 4. Zonas grises (confirmar con Jose de Reap)

1. **Alcohol** (categoría "Drinks & Alcohol" de la lista): la guía no lo nombra como restringido. **[Inferencia]** Podría contar como restringido. Evitarlo.
2. **Datos externos sin compra** (tipo de cambio, contabilidad): no tocan el pago. **[Especulación]** Probablemente se permiten.
3. **Búsqueda propia:** si Jose dice que la búsqueda puede hacerse por fuera y solo el checkout tiene que ir por Reap, la regla es más laxa de lo que se asume aquí. Preguntar antes de construir cualquier búsqueda propia.

---

## 5. ¿El pago es central? Delimitación del caso

**Prueba que decide:** si se quita el pago de Reap, ¿el producto sigue sirviendo? Si la respuesta es sí, el pago es decorativo.

| Paso del flujo | ¿Existe sin el pago? | Clasificación |
|---|---|---|
| Brief → cotización por partidas | Sí, es un planificador | **Periférico** |
| Organizador aprueba la cotización | Sí, pero solo importa si después autoriza cargos | Soporte |
| Búsqueda y cotización con Reap | No, es la API de pago | **Central** |
| Motor de reglas (topes por partida, margen permitido) | No, solo existe para decidir si un cargo sale | **Central** |
| Momento clave: la cotización vence o rebasa su tope, se vuelve a cotizar y se reajusta | No, lo dispara la restricción del pago | **Central** |
| Checkout en Reap | No | **Central** |
| Conciliación automática | Solo si sale de los datos del checkout. Si se captura a mano, es contabilidad | Central **si** viene del checkout |
| Costo final y desviación | Sí, cualquier hoja de cálculo lo hace | Periférico (es el resultado) |

### Valor del caso

- **[Evidencia, del usuario]** El organizador de eventos calcula a mano dos veces (cotización al cliente y costo final), y los precios cambian entre que cotiza y compra.
- **[Propuesta]** El valor no es planear el evento. El valor es que **la cotización aprobada se vuelve la autorización de gasto**:
  - No sale ningún cargo que no esté dentro de una partida aprobada y vigente.
  - Cuando el precio sube o la cotización vence, el agente vuelve a cotizar y reajusta antes de pagar, sin pasarse del margen permitido.
  - Cada cargo se concilia solo contra su partida.

### Objeción más fuerte

- Los **mandatos de Reap no existen todavía** (ni en sandbox ni en producción). En producción cada checkout lo aprobaría una persona; en sandbox se simula con el header oficial `X-Simulate-Checkout` (ver doc 03).
- El jurado puede preguntar: "sin mandatos, ¿qué impide que el agente gaste de más?".
- Respuesta honesta: nuestro motor de reglas determinista. El agente ajusta solo dentro del margen permitido y se detiene para revisión humana si lo rebasa. Los mandatos se presentan como la siguiente fase.

### Implicaciones de alcance [Propuesta]

- La generación brief → cotización con IA es lo que más acerca el producto a un planificador. Arrancar la demo con una cotización ya aprobada y pasar rápido por esa parte.
- La pantalla principal es la cotización bloqueada contra los cargos reales, no el plan del evento.
- Orden de recorte si falta tiempo (del plan): primero la recepción, luego partidas extra. El momento clave no se recorta.

### Prueba que refuta esta delimitación

Preguntar a un organizador real: "¿usarías esto si solo arma la cotización y calcula el costo, sin pagar?". Si dice que sí con el mismo entusiasmo, su dolor es de cálculo y no de pago, y el caso no encaja en el criterio "el pago es el centro".

---

## 6. Prompt para Claude Code (auditoría → ejecución)

Pegar en Claude Code dentro del repo de QuoteLock, con `01-idea-y-plan.md`, `02-reglas-integracion-roles.md` y `03-integracion-tecnica-reap.md` en el repo.

> Pendiente: si el equipo acepta la delimitación de la sección 5, ajustar el punto 10 para que la auditoría revise en el código que el pago sea el centro según esa tabla.

```
Contexto: proyecto QuoteLock (equipo teamblue) para el Agentic Hackathon de
Reap × AI Builders México. Es un agente que gestiona el gasto de un organizador
de eventos: brief → cotización por partidas → aprobación del organizador →
búsqueda y cotización con Reap → motor de reglas → checkout sin interrupciones
(revisión humana solo si se rebasa el margen permitido) → conciliación → costo
final y desviación.

Lee primero 01-idea-y-plan.md, 02-reglas-integracion-roles.md y
03-integracion-tecnica-reap.md (búscalos en el repo). Son la fuente de verdad
del plan.

FASE 1 — AUDITORÍA DE ALINEACIÓN (no modifiques código todavía)

Revisa todo el repo contra estas reglas y reporta cada hallazgo con archivo y
línea:

Obligatorias:
1. Todo pago pasa por el Agentic module de Reap (quotes → checkouts). Ningún
   pago sale por otro camino.
2. Solo comercios de la lista soportada. Si hay comercios hardcodeados, márcalos
   para verificarlos contra /merchants.
3. Solo sandbox. Busca URLs o keys de producción.
4. La API key viene de variables de entorno, nunca escrita en el código.

Prohibidas (busca activamente):
5. Scraping, automatización de navegador o fetch directo a tiendas Shopify
   (playwright, puppeteer, selenium, requests/fetch a dominios de comercios,
   /cart/, /checkout).
6. Uso de los "Cart permalink" de la hoja de comercios.
7. Datos de tarjeta, PAN, CVV o tokens de pago dentro de prompts, mensajes o
   contexto del LLM, o en logs.
8. Cualquier cosa de viajes (hotel, vuelo, transporte) o categorías
   restringidas, alcohol incluido.
9. Búsqueda de productos fuera del endpoint de búsqueda de Reap.

Criterios de evaluación:
10. El pago es el centro: la pantalla principal es el libro de movimientos,
    no un chat.
11. No es un chatbot genérico: la entrada es un brief y la salida un plan de
    gasto.
12. Los límites de gasto los aplica nuestro motor de reglas determinista, no
    el LLM. Los mandatos de Reap no existen todavía, así que no los asumas.

Entrega una tabla con: regla | estado (✅ / ⚠️ / ❌ / no aplica aún) | evidencia
(archivo:línea) | corrección propuesta. Separa lo verificado en código de lo
que infieres. Si algo del plan contradice estas reglas, señálalo.

Detente aquí y espera mi confirmación.

FASE 2 — EJECUCIÓN DEL PLAN (solo después de que yo confirme)

1. Corrige primero los ❌ y luego los ⚠️.
2. Sigue los pasos de construcción en el orden de 01-idea-y-plan.md. Mi rol
   (David): integración backend con Reap, motor de reglas y herramientas MCP.
   No toques la UI ni la narrativa (eso es de Pepe), salvo para conectar datos.
3. Respeta el orden de recorte del plan si falta tiempo: primero la recepción,
   luego partidas extra. El momento clave (una cotización
   vence o rebasa su tope, el agente vuelve a cotizar y se reajusta) no se
   recorta.
4. Después de cada paso, corre una prueba contra el sandbox y muéstrame el
   resultado real, no uno supuesto.
5. Si un endpoint de Reap no se comporta como dice el plan, detente y
   repórtalo. No lo rellenes con un mock sin avisarme.
```

**Límite de la auditoría:** solo encuentra lo que ya está en el código. Las reglas que dependen de datos del día (lista `/merchants`, respuesta de Jose sobre la búsqueda) se verifican a mano. Si el repo está casi vacío, usar la Fase 1 como checklist después de cada paso de la Fase 2.

---

## 7. Pendientes

- [ ] Revisar `/merchants` el día de la demo.
- [x] Líder del equipo: José Ulloa (recibe la API key).
- [ ] Preguntar a Jose: búsqueda por fuera de Reap, alcohol, datos externos, fecha de los mandatos.
- [ ] Decidir si se acepta la delimitación de la sección 5 y ajustar el punto 10 del prompt.
- [ ] Probar la delimitación con un organizador real (sección 5, prueba que refuta).
