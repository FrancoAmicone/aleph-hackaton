# docs/ — Índice de referencia oficial

Documentación oficial de Pear/Bare condensada, más los links canónicos para profundizar.
**Regla: antes de escribir código P2P o comandos de Pear, leer el archivo correspondiente acá.**
Si el tema no está cubierto, ir a `08-links.md`, agarrar el link oficial y traerlo con WebFetch.

## Qué leer según el problema

| Si el problema es... | Leer |
|---|---|
| Qué pide el track, qué hay que entregar, cómo se juzga | `00-track-pears.md` |
| Arrancar el proyecto, estructura del template, variantes | `01-quickstart.md` |
| Un comando `pear ...` no existe / no sé qué flag usar | `02-pear-cli.md` |
| Deploy, seeding, releases, que el OTA funcione | `03-deploy-ota.md` |
| Conectar peers, topics, swarm, mandar mensajes | `04-p2p.md` |
| Persistir datos, replicar estado entre peers | `04-p2p.md` (sección Storage) |
| `X is not defined`, falta un builtin de Node, error de módulo | `05-bare-runtime.md` |
| Algo se rompió y no sé por qué | `06-troubleshooting.md` |
| Definir qué construimos | `07-ideas.md` |
| Necesito la fuente original de algo | `08-links.md` |
| **Correr, instalar o publicar the-great-pear** | `09-the-great-pear.md` |
| Leer teclas sueltas / raw mode / TUI | `05-bare-runtime.md` + `spikes/01-raw-input/SPIKE.md` |
| Código P2P que ya funciona, para copiar | `spikes/02-hyperswarm/SPIKE.md` |

## Spikes — código probado, no teoría

En `spikes/` hay dos pruebas de concepto **corribles y verificadas**, cada una con su `SPIKE.md`:

| Spike | Pregunta que responde | Resultado |
|---|---|---|
| `01-raw-input` | ¿Se pueden leer teclas sueltas sin bloquear el loop en Bare? | ✅ Sí, con `bare-tty` |
| `02-hyperswarm` | ¿Dos procesos se encuentran por topic e intercambian JSON? | ✅ Sí, con salvedades |

Los hallazgos de ambos ya están volcados en `04-p2p.md`, `05-bare-runtime.md` y
`06-troubleshooting.md`. **Los spikes son la fuente: si un doc y el código del spike se
contradicen, gana el spike** — está probado.

Las 3 cosas que más tiempo ahorran si las leés antes de escribir código:

1. **`framed.on('error')` además de `conn.on('error')`** — sin eso, un peer que se cae
   mata el proceso del otro. Ver `04-p2p.md`.
2. **Ctrl+C no es SIGINT en raw mode** — llega como byte `0x03`. Ver `05-bare-runtime.md`.
3. **El discovery falla ~30% de las veces al primer intento** — el juego necesita retry.
   Ver `04-p2p.md`.

## Cómo mantener esto

Estos archivos son un **resumen fiel** de la doc oficial al 22-ago-2026, no un reemplazo.
Cuando aparezca una duda que la doc local no resuelve:

1. Buscar el link en `08-links.md`.
2. `WebFetch` a ese link.
3. Si la respuesta es reutilizable, agregarla al archivo local correspondiente.

Lo que sale de la doc oficial va marcado como tal. Lo que es decisión nuestra va marcado
como **[NUESTRO]** para no confundir criterio propio con API real.
