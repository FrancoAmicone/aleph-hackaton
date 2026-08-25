# Decisiones de producto

**[NUESTRO]** Todo este archivo es criterio propio, no doc oficial.

Es el registro de por qué el proyecto es lo que es. Se escribió antes de construir nada,
como una comparación de ideas; queda acá reducido a lo que efectivamente se decidió y a lo
que aprendimos al ejecutarlo.

## El filtro que usamos para elegir

El track premia **CLI + `pear install` + OTA P2P**, no complejidad de gameplay. La idea
ganadora era la que:

1. Se puede jugar **con dos terminales en 30 segundos** — demo clara.
2. Su estado cabe en mensajes chicos — nada de sincronizar mundos.
3. La lógica core la puede escribir una persona en 4-6 horas.
4. **Aprovecha el P2P como parte de la gracia**, no como requisito burocrático.

## Lo que elegimos: UNO de terminal, 2-4 humanos

Un juego por turnos con **salas por nombre**: dos personas que tipean el mismo `--room` caen
en el mismo topic del DHT y juegan. Riesgo bajo, demo inmediata.

El mazo se recortó a **números, +2 y +4** — sin Skip, sin Reverse, sin comodín pelado. No fue
por tiempo: sin Reverse el juego avanza siempre en un sentido y **el engine no necesita
estado de dirección**. Menos estado es menos superficie donde dos peers pueden divergir.

Y **una mano es la partida entera**: el que se queda sin cartas gana. Una demo tiene que
terminar mientras el juez todavía está mirando.

### Lo que descartamos, y por qué

| Idea | Por qué no |
|---|---|
| Tiempo real (battle royale / agar de terminal) | Sin servidor autoritativo: desync, lag y cheating. Muy caro de debuggear a las 4 AM. |
| Leaderboard replicado con Hyperbee | Suma una pieza más del stack que aprender, y corre el foco del P2P a la persistencia. |
| Roguelike cooperativo | No tiene fondo: scope creep garantizado. |
| Contenido nuevo llegando por OTA | Era el diferencial más lindo del pitch, pero exige que el pipeline OTA esté sólido **temprano**. Se fue el tiempo en que el OTA anduviera bien; quedó como idea. |

## La decisión técnica que sostuvo todo: lockstep

Con el juego por turnos elegido, la sincronización podía ser "mandar el estado" o "mandar las
acciones". Elegimos **lockstep determinístico**: el anfitrión sortea una semilla, todos
construyen el mismo mazo, y por el cable viajan **sólo acciones**.

Resultó ser la decisión de mayor rendimiento del proyecto:

- Los mensajes son `{ type, seat, card }` — el vocabulario que el engine ya tenía.
- No hay que serializar el estado, ni reconciliarlo, ni versionarlo.
- Se puede testear sin red: dos instancias del engine con la misma semilla y las mismas
  acciones tienen que dar la misma huella. Es lo que hace `npm run lockstep:test`.

Lo que cuesta: **cualquier no-determinismo divide la partida en dos**. De ahí que el RNG sea
explícito (`lib/rng.js`, mulberry32 sembrado) y no `Math.random()`.

## Lo que aprendimos ejecutándolo

- **El pipeline primero, el juego después.** La barra del track no es "app linda", es "se
  instala por `pear://` y se auto-actualiza". Haber verificado el pipeline con una app
  descartable antes de escribir el juego fue lo que salvó el proyecto.
- **El modo local no prueba el modo online.** Toda la clase de bugs de asientos existía sólo
  cuando `me !== 0`, y el modo local nunca lo produce. Ver `06-troubleshooting.md`.
- **El binario compilado no es el código fuente.** El bug más caro sólo existía en el
  standalone.
- **Congelar `productName` antes del primer release.** Define el binario y el directorio de
  storage; cambiarlo rompe a todo el que ya instaló.
