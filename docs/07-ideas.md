# Ideas — juego P2P de terminal

**[NUESTRO]** Todo este archivo es criterio propio, no doc oficial.

## Filtro para elegir

El track premia **CLI + `pear install` + OTA P2P**, no complejidad de gameplay.
La idea ganadora es la que:

1. Se puede jugar **con dos terminales en 30 segundos** (demo clara).
2. Su estado cabe en mensajes chicos por `conn.write()` — nada de sincronizar mundos.
3. **Aprovecha el OTA como parte de la gracia**, no como requisito burocrático.
4. La lógica core la puede escribir una persona en 4-6 horas.

El punto 3 es el diferencial. Casi todos los equipos van a tratar el OTA como un checkbox.
Si el update OTA *es* parte de la experiencia, el juez (que creó Pear) lo va a notar.

## Candidatas

### A. Juego por turnos con salas por nombre — *el piso seguro*
Ajedrez / batalla naval / truco / conecta-4 en TUI. Un topic = una sala.
`game join sala-pepe` y ya estás jugando contra quien tipeó lo mismo.

- **Estado:** trivial (un move por mensaje).
- **Riesgo:** bajo. **Impacto:** medio — es lo que van a hacer varios.
- Truco (o cualquier juego argentino) suma color local con el jurado.

### B. Juego cuyo contenido llega por OTA — *el diferencial*
El juego base se instala una vez; **los niveles / cartas / enemigos / reglas nuevas llegan por
update P2P mientras estás jugando**. En la demo: dos peers jugando, publicamos v2 en vivo,
y aparece un nivel nuevo en las dos pantallas sin que nadie reinstale nada.

- **Estado:** igual de simple que A.
- **Riesgo:** medio (depende de que el OTA ande, que igual es obligatorio).
- **Impacto: alto.** Convierte el requisito del track en el hook del pitch.
- Es la que recomiendo si el pipeline OTA queda andando en las primeras horas.

### C. Battle royale / agar de terminal en tiempo real
Muchos peers en un topic, movimiento en tiempo real, render ASCII.

- **Riesgo: alto.** Tiempo real sobre P2P sin servidor autoritativo = desync, lag, cheating.
- Muy vistoso si sale. Muy caro de debuggear a las 4 AM.
- Solo si el equipo tiene experiencia previa en netcode.

### D. Wordle / trivia P2P asincrónico con leaderboard replicado
Hyperbee o Hypercore para el leaderboard compartido, sin servidor.

- Demuestra la capa de storage además del swarm.
- **Riesgo:** medio (una pieza más del stack que aprender).
- Menos "juego", más "app". Depende de qué queramos pitchear.

### E. Roguelike cooperativo, ASCII, 2-4 jugadores
Dungeon compartido, movimiento por turnos, seed determinístico.

- Con seed compartido, cada peer genera el mismo mapa → se manda solo el input.
- **Riesgo:** medio-alto por scope creep. Un roguelike no tiene fondo.
- Si sale, es lo más lindo de mostrar.

## Recomendación

**B, implementada como A.** Es decir: construir un juego por turnos simple con salas por nombre
(riesgo bajo, seguro que funciona), y diseñarlo desde el principio para que **el contenido venga
del bundle** — así publicar una v2 con contenido nuevo es el clímax de la demo, y si el OTA se
complica, igual tenemos un juego funcionando.

## Reparto sugerido para 4 personas

| Rol | Qué hace | Cuándo |
|---|---|---|
| **Pipeline** | Template, `pear touch`, make, stage, seed, instalar en otra máquina, verificar OTA. Dueño de la key. | Hora 0 → 6. Es el camino crítico. |
| **Netcode** | Hyperswarm, salas por topic, protocolo de mensajes, reconexión | Hora 0 → 8 (en paralelo, en un repo scratch aparte) |
| **Gameplay** | Reglas del juego, estado, validación de movimientos — testeable sin red | Hora 2 → 14 |
| **TUI + demo** | Render ASCII, input, y desde la hora 16: README, video, pitch | Hora 4 → 24 |

**Regla de integración:** netcode y gameplay se desarrollan por separado con una interfaz acordada
(`applyMove(state, move) -> state`) y se integran a la hora 10-12. No antes, no después.

**Regla de tiempo:** a las 20hs de las 24, feature freeze. Las últimas 4 son video, README, seeding
redundante y probar la instalación limpia desde cero en una máquina que nunca vio el proyecto.

## Decisiones pendientes

- [ ] Idea final
- [ ] Nombre de la app (define `productName` → binario **y** directorio de storage; **no se cambia después del primer release**)
- [ ] Branch del template (`main` vs `variant/single-thread`)
- [ ] Plataformas de binarios a cubrir según las máquinas del equipo
- [ ] Quién es dueño de la key `pear://` y quiénes seedean durante el juzgado
