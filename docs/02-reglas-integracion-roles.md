# 02 — Cumplimiento de reglas, integración con Reap e instrucciones del equipo

**Agentic Hackathon Reap × AI Builders Mexico** · Fecha: 9 oct 2026

> **[Evidencia]** = guía oficial (aibuilders.mx/reap) o documentación de Reap · **[Inferencia]** = falta confirmarlo · **[Propuesta]** = decisión nuestra.

---

## 1. Checklist oficial vs. nuestro proyecto

| # | Requisito oficial | Estado | Cómo lo cumplimos / qué cuidar |
|---|---|---|---|
| 01 | Usa el Agentic module | ✅ | `enrollments` → `products/search` → `quotes` → `checkouts` |
| 02 | Los pagos son el centro, no un extra | ⚠️ **Riesgo principal** | La pantalla principal es el libro de movimientos. La demo se narra siguiendo el dinero |
| 03 | Todo en sandbox | ✅ | Sin dinero real |
| 04 | Solo comercios de la lista | ✅ | Revisar `/merchants` en Telegram el día de la entrega; la lista cambia |
| 05 | Líder definido para recibir la API key | ✅ | José Ulloa (ver doc 03) |
| 06 | Nada de viajes ni categorías restringidas | ⚠️ | Sin hotel, sin transporte de ponentes, **sin alcohol** (por precaución) |
| 07 | Sin scraping del checkout ni tarjeta al LLM | ⚠️ | **No usar los "Cart permalink" de la hoja.** La tarjeta solo vive en el enrollment |
| 08 | No es un chatbot genérico de buscar, mostrar y comprar | ⚠️ | La entrada es un brief y la salida un plan de gasto más el libro de movimientos. No hay chat |
| 09 | Sabemos a qué track aplicamos | ✅ | **Most Worthwhile Problem**, solo ese |

**¿Por qué no aplicar también a *Best Bridge Onchain*?** No usamos stablecoins ni el wallet module. Aplicar sin cumplir resta credibilidad.

## 2. Qué premia el track

[Evidencia] El track *Most Worthwhile Problem* premia:
- "Un producto que usuarios reales descargarían y pagarían" → en el pitch hay que nombrar a un usuario concreto.
- "Mejor uso de tecnología nueva" → la guía menciona compras vía **MCP** o el agentic commerce framework de Anthropic.

[Evidencia] El FAQ de Reap dice que los clientes MCP funcionan en sandbox (en producción todavía no). **Usamos MCP.**

Jueces: 5 en total, 2 de Reap (Harris Leow, Anna Chiu). Van a preguntar qué tan a fondo usamos su API.

## 3. Integración con Reap

### Qué existe hoy [Evidencia]
| Paso | Endpoint | Para qué |
|---|---|---|
| 1 | `POST /agentic/enrollments` | Guarda la tarjeta. Devuelve el ID de enrollment. El agente nunca ve el número |
| 2 | `POST /agentic/products/search` | Busca en el catálogo del comercio y lo resuelve a una variante comprable |
| 3 | `POST /agentic/quotes` | Cotiza con el comercio. **Vence en poco tiempo** |
| 4 | `POST /agentic/checkouts` | Cobra al enrollment y completa la orden. En el ejemplo, **el usuario aprueba cada cargo en una página de Reap** |
| 5 | `GET /agentic/checkouts/:id` | Referencia de orden (`orderId`) y monto cobrado (`finalAmount`). No devuelve fecha de entrega |

### Qué NO existe [Evidencia]
- **Mandatos:** *"Mandates are not available yet"*, ni en sandbox ni en producción. No hay topes ni ventanas de tiempo aplicados por la red.
- **Webhooks:** están en desarrollo.

**Consecuencia:** los topes los impone **nuestro motor de reglas**. Nunca decir en el pitch que la red de pagos impone los límites. Mencionar los mandatos solo como "siguiente fase cuando Reap los libere".

### Arquitectura [Propuesta]
```
UI (una pantalla: línea de tiempo + conciliación)
   ↓
Backend
 ├─ Agente LLM ── herramientas MCP:
 │     planear_presupuesto · buscar_producto · cotizar · pagar · conciliar
 ├─ Motor de reglas (determinista, fuera del LLM):
 │     tope por partida · costo máx. por asistente · comercios permitidos · cotización vigente
 │     entrega antes de la fecha límite · todo en MXN (conversión al cotizar)
 │     el comercio envía a MX · margen (excedente permitido)
 ├─ Cliente Reap (API key solo en el backend, nunca en el prompt)
 └─ SQLite: eventos, partidas, cotizaciones, cargos, recepciones, incidencias
```

**Regla de oro:** la herramienta `pagar` llama primero al motor de reglas, dentro del código. El LLM no puede saltarse esa validación aunque el brief se lo pida.

### Autonomía y revisión humana

- El agente paga sin interrupciones. En sandbox la aprobación se simula con el header oficial `X-Simulate-Checkout: COMPLETED` (ver doc 03).
- **Margen** = excedente permitido sobre lo presupuestado. Es variable: 10%, 20% o 30%, elegido por evento en el brief (detalle en doc 01, sección 4). Dentro del margen, el agente ajusta solo y lo registra. Si lo rebasa, se detiene y pide revisión humana.
- El límite de gasto descansa solo en nuestro motor de reglas, y así se dice en el pitch.

### Qué es real y qué es simulado (se le dice al jurado)
| Real (sandbox de Reap) | Simulado |
|---|---|
| Enrollment, búsqueda, cotización, checkout | El brief del evento |
| | La aprobación del checkout (header oficial `X-Simulate-Checkout`) |
| Comercios de la lista | La recepción en sitio |
| Referencia de orden | El tipo de cambio, si se usa uno fijo |
| Motor de reglas y conciliación (nuestro código) | El cambio de precio, **solo si** el sandbox no lo produce |

## 4. Preguntas para Jose (Reap) antes de escribir código

> Actualización: la documentación ya respondió las preguntas 1, 4, 6 y 7 (ver doc 03). La 2, la 3 y la moneda de la 5 se miden con las pruebas del doc 03, sección 9. Las preguntas vigentes están en el doc 03 (sección 12) y el doc 04 (sección 4).

1. ¿El sandbox exige aprobar **cada** checkout en la página de Reap, o se puede aprobar automáticamente? → Define cuánta autonomía mostramos.
2. ¿`products/search` devuelve el catálogo real de cada tienda o solo el producto de prueba?
3. ¿Cuánto dura una cotización en sandbox? → Para provocar la expiración en vivo.
4. ¿Qué devuelve el checkout además de la referencia de orden? → Lo necesitamos para conciliar.
5. ¿En qué moneda devuelven `quotes` y `checkouts`, y la cotización incluye envío e impuestos? → Para convertir a MXN y saber qué es estimado.
6. ¿La cotización trae fecha estimada de entrega y disponibilidad, o solo aparecen en el checkout? → Para la regla de fecha límite y el caso de producto agotado.
7. Si el checkout queda pendiente de aprobación, ¿cómo se consulta su estado sin webhooks?
8. (Opcional) ¿Hay fecha para los mandatos? → Para mencionarlo como siguiente fase.

## 5. Entrega

Portal y hora de cierre: **por confirmar** (vigilar el canal de Telegram).

| Piden | Qué entregamos | Responsable |
|---|---|---|
| Datos del equipo y del proyecto | Ficha del doc 01 (problema, usuario, idea) | David |
| Categoría | Most Worthwhile Problem | David |
| Demo grabada corta | ~2 min: brief → plan → bloqueo y replaneación → pago → conciliación | Pepe |
| Repositorio | README: arquitectura, cómo correrlo, real vs. simulado | David |
| Cómo usamos la integración Agentic | Texto de abajo | David |

**Borrador de "Cómo usamos la integración Agentic":**
> La tarjeta del organizador se registra una sola vez con `enrollments`; el agente nunca ve sus datos. Para cada partida del evento, el agente resuelve productos con `products/search`, cotiza con `quotes` y valida cada cotización contra un motor de reglas determinista (tope por partida, costo por asistente, comercios permitidos). Solo las cotizaciones válidas pasan a `checkouts`, sin interrupciones. Si un ajuste rebasa el margen permitido, el agente se detiene y lo revisa el organizador. Si una cotización vence o rebasa su tope, el agente vuelve a cotizar o replanea. Cada referencia de orden se concilia contra lo presupuestado y lo recibido.

## 6. Instrucciones por persona [Propuesta: ajusten el reparto si no les acomoda]

### David: integración, agente y motor de reglas
1. **Ahora:** recibir la API key de José Ulloa por un canal privado y correr las pruebas del doc 03, sección 9.
2. Hacer **una compra completa a mano** en blendstation (enrollment → búsqueda → cotización → checkout). Guardar las respuestas JSON reales; Pepe las usa para la pantalla.
3. Motor de reglas y esquema SQLite.
4. Servidor MCP con las 5 herramientas. `pagar` siempre pasa por el motor de reglas.
5. Momento clave: expiración o rebase de cotización → recotizar → bloquear → replanear.
6. Conciliación y reporte de cierre.
7. README y texto de integración.
8. Correr las pruebas de la sección 7 del doc 01 **antes** de grabar.

### Pepe: experiencia, narrativa y demo
1. **Ahora:** unirse al canal de Telegram, vigilar portal, hora de cierre y formato de entrega, y avisar de cualquier cambio en `/merchants`.
2. Escribir el brief del evento de la demo (texto realista) y la lista de partidas con montos.
3. Diseñar la pantalla única con las respuestas JSON reales que pase David:
   - Línea de tiempo: qué hizo el agente y por qué.
   - Libro de movimientos: presupuesto, cotizado, cobrado, recibido y estado.
   - Contador: acciones del agente contra acciones humanas.
4. Guion y grabación del video (~2 min). Debe dejar clara la tesis en los primeros 30 segundos y decir qué es simulado.
5. Prueba de honestidad: enseñarle el video a alguien ajeno y preguntarle qué cree que fue real.

### Puntos de sincronía
| Momento | Qué se valida juntos |
|---|---|
| Después del paso 2 de David | ¿Funcionó la compra real? Si no, se replantea todo |
| Con el agente funcionando | Ensayo del momento clave en pantalla |
| Antes de grabar | Las 5 pruebas de verificación pasan |
| Antes de entregar | Checklist oficial completo (sección 1) |

## 7. Cosas que NO hacemos

- Cobrarle al cliente del evento.
- Pagos por SPEI o a proveedores de servicios.
- Hotel, transporte ni alcohol.
- Pronósticos de precio.
- Integrarlo con otros productos nuestros.
- Usar los cart permalinks de la hoja.
- Decir que los topes los impone Reap.
