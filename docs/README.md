# docs/ — referencia del proyecto

**the-great-pear** es un UNO de terminal para 2-4 jugadores, escrito para el runtime **Bare**,
distribuido y actualizado **peer a peer** con **Pear**. Se instala desde un link `pear://` y
se actualiza solo por el swarm. Hackathon Aleph 2026, track Pears (Tether / Holepunch).

```
pear install pear://u9y7y9xqggifyeihhi9i1cswyqdrtdjbg75y6obxxy6hwe6uu66o
```

## Por dónde empezar

| Sos… | Leé |
|---|---|
| alguien que quiere **jugar** | el [`README.md`](../README.md) de la raíz |
| alguien que va a **tocar el código o publicar** | `09-the-great-pear.md` |
| un juez verificando el track | `00-track-pears.md`, después `09` §1 y §7 |

El README de la raíz y estos documentos no se solapan a propósito: el README explica **qué es
y cómo se usa**, `docs/` explica **cómo funciona por dentro y por qué está así**.

## Qué leer según el problema

| Si el problema es... | Leer |
|---|---|
| Qué pide el track y cómo lo cumplimos | `00-track-pears.md` |
| De dónde salió el esqueleto, qué cambió de la plantilla | `01-quickstart.md` |
| Un comando `pear ...` no existe / no sé qué flag usar | `02-pear-cli.md` |
| Publicar una versión, seedear, entender el OTA | `03-deploy-ota.md` |
| Conectar peers, topics, swarm, mandar mensajes | `04-p2p.md` |
| Persistir datos, replicar estado entre peers | `04-p2p.md` (sección Storage) |
| `X is not defined`, falta un builtin de Node, error de módulo | `05-bare-runtime.md` |
| **Algo se rompió** | `06-troubleshooting.md` |
| Por qué el juego es así y no de otra forma | `07-ideas.md` |
| Necesito la fuente original de algo | `08-links.md` |
| **Cómo funciona la app, correrla, publicarla, operarla** | `09-the-great-pear.md` |
| Leer teclas sueltas / raw mode / TUI | `05-bare-runtime.md` + `spikes/01-raw-input/SPIKE.md` |
| Código P2P mínimo para copiar | `spikes/02-hyperswarm/SPIKE.md` |

## Las cinco cosas que más tiempo ahorran

Si vas a escribir código en este repo y sólo leés cinco cosas, que sean estas:

1. **Lo que no se alcanza por un `require` literal no entra al binario.** Un archivo cargado
   por una ruta armada en runtime queda afuera del bundle y falla **sólo** en el binario
   compilado, en silencio. Probá siempre el standalone, no sólo `npm start`.
   → `05-bare-runtime.md`
2. **Cualquier `0` literal en la vista es un bug de multijugador.** El asiento local es
   `view.me`. El modo local con bots nunca lo expone. → `06-troubleshooting.md`
3. **`framed.on('error')` además de `conn.on('error')`.** Sin los dos, un peer que se cae
   mata el proceso del otro. → `04-p2p.md`
4. **El discovery falla ~30 % al primer intento y es asimétrico** (7.8 s de un lado, 39.5 s
   del otro en el mismo par). Retry y 60 s de paciencia. → `04-p2p.md`
5. **Un cambio en el updater sólo aplica desde la versión siguiente.** La copia instalada
   corre su propio código: un updater roto no puede arreglarse a sí mismo.
   → `03-deploy-ota.md`

## Spikes — código probado, no teoría

En `spikes/` hay dos pruebas de concepto **corribles y verificadas**, cada una con su
`SPIKE.md`. Son de las primeras horas del proyecto, anteriores al juego: sirven como el
ejemplo más chico que funciona de cada cosa.

| Spike | Pregunta que responde | Resultado |
|---|---|---|
| `01-raw-input` | ¿Se pueden leer teclas sueltas sin bloquear el loop en Bare? | ✅ Sí, con `bare-tty` |
| `02-hyperswarm` | ¿Dos procesos se encuentran por topic e intercambian JSON? | ✅ Sí, con salvedades |

Los hallazgos de ambos ya están volcados en `04-p2p.md`, `05-bare-runtime.md` y
`06-troubleshooting.md`. **Si un doc y el código del spike se contradicen, gana el spike** —
está probado. Y si un spike y `tui/` se contradicen, gana `tui/`: es lo que se publicó.

## Convenciones

- Lo que sale de la doc oficial va marcado como tal, con el link a la fuente.
- Lo que es criterio propio va marcado **[NUESTRO]**, para no confundirlo con API real.
- Lo que está **medido** dice el número. "Tarda un poco" no sirve a las 4 AM.

Estos archivos son un resumen fiel de la doc oficial al 23-ago-2026, no un reemplazo. Cuando
aparezca una duda que no resuelvan: buscar el link en `08-links.md`, traerlo con WebFetch, y
si la respuesta es reutilizable, agregarla al archivo local que corresponda.
