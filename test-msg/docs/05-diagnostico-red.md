# Diagnóstico de red

Dos scripts para saber si el problema es la red o nuestro código, **sin Pear de por medio**.
Guardalos: el wifi de un venue de hackathon es el peor escenario posible y esto responde en 1 minuto.

Ambos viven en `app/` y hay que correrlos **desde ahí** (si no, no resuelven `node_modules`).

---

## `diag-node.js` — Hyperswarm puro bajo Node

```bash
cd test-msg/app
node diag-node.js <etiqueta> [sala]
```

Ejemplo, dos terminales:
```bash
node diag-node.js A prueba
node diag-node.js B prueba
```

Corre 60s por defecto (`DUR=30000 node diag-node.js A` para cambiarlo).

## `diag-bare.js` — Hyperswarm bajo Bare

Mismo test pero en el runtime real de la app. También puede levantar **dos** swarms
para reproducir la estructura del worker.

```bash
cd test-msg/app
node node_modules/bare-runtime/bin/bare diag-bare.js <etiqueta> <1|2> [sala] [ms]
```

```bash
# un swarm, sala "prueba", 45 segundos
node node_modules/bare-runtime/bin/bare diag-bare.js A 1 prueba 45000

# dos swarms (como el worker real)
node node_modules/bare-runtime/bin/bare diag-bare.js A 2 prueba 45000
```

⚠️ `diag-bare.js` recibe la duración **como argumento**, no por variable de entorno:
`Bare.env` no existe (ver error 5 en `03-bitacora.md`).

---

## Cómo leer la salida

```
[A +0.0s] yo soy 09c51c
[A +0.0s] topic 3b39bb9fd90fefaf…
[A +5.4s] announce completo
[A +5.5s] DHT bootstrapped=true port=53985
[A +5.7s] *** CONEXION con 802674 ***
[A +5.7s] RECIBI: ping de B
[A +10.0s] peers = 1
```

| Línea | Qué significa si NO aparece |
|---|---|
| `topic ...` | — (siempre aparece). **Tiene que ser idéntico en ambos peers.** Si difieren, están en salas distintas. |
| `DHT bootstrapped=true` | No hay salida a la red / UDP bloqueado. Problema de red, no del código. |
| `announce completo` | El anuncio al DHT no terminó. Red lenta o bloqueada. |
| `*** CONEXION ***` | Los peers no se encuentran. **Esperá 60s antes de concluir.** |
| `RECIBI:` | Conectaron pero no fluyen datos. Raro; mirá errores de conexión. |

### `firewalled=true` NO es un error

Es el estado normal detrás de cualquier NAT doméstico. Hyperswarm hace hole punching
precisamente para eso. En todos nuestros tests exitosos decía `firewalled=true`.

---

## Baseline medido (22-ago, misma máquina)

| Escenario | Tiempo hasta conectar |
|---|---|
| node, 1 swarm | 6s |
| bare, 1 swarm | 5.7s |
| bare, 2 swarms | 5.7s |
| app real completa | 7s |

**Si en tu red tarda mucho más de 10-15 segundos, hay algo raro en la red.**
Pero dale igual 60s antes de dar un veredicto: la primera corrida de todas puede ser lenta por
bootstrap frío del DHT (nos pasó, ver error 3 en `03-bitacora.md`).

---

## Árbol de decisión

```
¿diag-node.js conecta entre dos terminales de la misma máquina?
├── NO  → problema de red/entorno. Probá hotspot de celular.
│         Si con hotspot anda, es el firewall del venue.
└── SÍ  → la red anda.
    │
    ¿diag-bare.js con 2 swarms conecta?
    ├── NO  → problema del runtime Bare. Reportar en el Keet del track.
    └── SÍ  → la infraestructura está bien.
        │
        ¿la app real (npm start) conecta?
        ├── NO  → ahí sí, es nuestro código. Revisar el worker.
        └── SÍ  → todo OK, seguir con el deploy.
```

Este orden importa: cada escalón descarta una capa. Saltearse escalones lleva a hipótesis
equivocadas — ya nos pasó una vez.
