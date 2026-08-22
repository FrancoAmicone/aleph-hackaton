# Procesos zombi — el problema que más confunde

## Qué pasó

Al probar el chat aparecieron **dos peers que nadie había levantado**:

```
* ddb727 entró a la sala (1 conectado/s)
* b5262c entró a la sala (2 conectado/s)
```

Primera reacción razonable: "esto está hardcodeado / es mentira".
**No lo estaba.** Eran peers 100% reales.

Eran procesos de tests anteriores que **habían quedado corriendo**. `ps` lo confirmó:
PIDs de 40 minutos antes, sala `hackaton`, mismo topic `c485632cfdef…`.
Sus IDs (`b5262c`, `ddb727`) coincidían exactamente con los de la primera corrida de prueba.

## Por qué es tan confuso

Un proceso zombi de test-msg **no se nota**: no tiene ventana, no imprime nada donde lo veas,
consume poca CPU. Pero **sigue anunciado en el DHT y sigue aceptando conexiones**.
Entonces te unís a una sala y aparecen "fantasmas" que son vos mismo de hace media hora.

Y como el topic se deriva del nombre de la sala, **cualquier proceso viejo en la misma sala
te va a encontrar**. Si estás probando en `--room hackaton`, todo lo que hayas dejado abierto
en `hackaton` alguna vez va a reaparecer.

## Cómo verificarlo siempre

**Antes de sacar cualquier conclusión de un test P2P:**

```bash
npm run ps
```

Lista todo lo que esté corriendo. Si dice `no hay procesos test-msg corriendo`, estás limpio.

Con detalle de cuándo arrancó cada uno:
```bash
ps -o pid=,lstart=,command= -A | grep "bin.mjs" | grep -v grep
```

## Cómo limpiar

```bash
npm run stop
```

Si algo se resiste:
```bash
pkill -9 -f "bin.mjs"
```

Verificá siempre después:
```bash
npm run ps
```

## Regla para testear

Usá **una sala distinta en cada prueba**. Es gratis y elimina el problema de raíz:

```bash
npm start -- --room prueba-$(date +%s)
```

Si vas a probar con alguien, acordá el nombre en el momento (`hackaton-3pm`, no `test`).

## La causa raíz: Ctrl+C no cerraba

Los zombis existieron porque **el cierre estaba roto**. El template original hacía:

```js
process.on('SIGINT', () => app.exit(130))
```

`app.exit()` setea el exit code y cierra la App, pero **confía en que el event loop se vacíe solo**.
No se vacía: nuestro listener de `process.stdin` lo mantiene vivo, y el worker de Bare con sus dos
swarms puede tardar en destruirse.

### Fix aplicado

```js
const FORCE_EXIT_MS = 3000
let closing = false

async function shutdown(code, signal) {
  if (closing) {          // segundo Ctrl+C = salir ya
    Bare.exit(code)
    return
  }
  closing = true

  process.stdin.pause()   // soltar stdin, que es lo que mantenía vivo el loop

  const forced = setTimeout(() => Bare.exit(code), FORCE_EXIT_MS)  // red de seguridad

  try { await app.close() } catch (err) { print('[shutdown:error]', err) }

  clearTimeout(forced)
  Bare.exit(code)
}
```

Tres cosas: **soltar stdin**, **plazo acotado** para el teardown, y **salir sí o sí**.
Un segundo Ctrl+C fuerza la salida inmediata.

También se blindó `print()` con try/catch alrededor de `console.log`: si el proceso padre muere
primero, stdout queda roto y un EPIPE ahí adentro rompía el handler de cierre.

### Estado de la verificación

| Escenario | Resultado |
|---|---|
| SIGINT directo al proceso `bare` | ✅ cierra limpio, **0 procesos** quedan |
| SIGINT al proceso `bare` lanzado vía `npm start` | ✅ cierra limpio, **0 procesos** |
| Ctrl+C real en una terminal interactiva | ⬜ **falta que lo pruebe una persona** |

El último no se pudo verificar de forma automatizada: requiere un TTY con grupo de proceso en
primer plano, y los procesos lanzados en background no tienen esa semántica de señales.

**Si al probarlo con Ctrl+C te queda algo colgado, avisá y lo terminamos de ajustar.**
Mientras tanto `npm run stop` resuelve.

## Por qué importa más allá de la comodidad

1. **Falsea los tests.** Peers fantasma hacen parecer que algo conecta cuando no, o al revés.
2. **Ensucia el DHT.** Procesos que no se destruyen dejan registros colgados y hacen que las
   conexiones siguientes tarden más — está en la doc oficial de troubleshooting.
3. **Rompe el demo.** Si durante la grabación aparece un peer viejo, se ve pésimo.
4. **Para el juego:** un jugador que cierra mal queda "en la partida" para los demás.
   El cierre limpio no es cosmético, es parte de la lógica.
