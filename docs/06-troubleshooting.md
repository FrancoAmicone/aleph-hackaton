# Troubleshooting

Fuente: https://docs.pears.com/how-to/troubleshooting/

## Problemas de Pear

### Unirse a un topic de Hyperswarm tarda mucho

Causas posibles:
- Redes con **NAT aleatorio** necesitan nodos adicionales para facilitar las conexiones.
- **Instancias de Hyperswarm que no se destruyeron en el teardown** impiden la limpieza correcta
  de los registros del HyperDHT. → Siempre `await swarm.destroy()` al salir.
- **Firewalls** bloqueando tráfico.

> **MEDIDO (spike 2):** dos peers en la misma máquina, 10 corridas por escenario.
> Con teardown sucio (`kill -9`): **4/10** conectaron. Con teardown limpio
> (`await swarm.destroy()`): **7/10**. O sea el teardown sucio **casi duplica los fallos** —
> esto no es teoría, pasa. Y aún limpio, 3 de 10 no conectan ni esperando 40s.
> Cuando conecta, tarda ~7s consistentemente.
> **Conclusión: el juego necesita retry de `join` si no aparece nadie en ~10-15s.**
> Detalle completo en `04-p2p.md`.

> **[NUESTRO] El wifi de una hackathon es exactamente el peor caso** (NAT simétrico, portal cautivo,
> puertos bloqueados). Plan B: probar todo también con hotspot de celular. Y probar la conectividad
> entre dos máquinas **temprano**, no a las 3 AM.

## Errores concretos que ya nos pasaron (spikes 1 y 2)

### `Uncaught Error: connection reset by peer` y se muere el proceso

Stack apuntando a `FramedStream._destroy` / `streamx`. **Falta el handler de error en el stream
que envuelve al `conn`**, no en el `conn`. Hay que registrar los dos:

```javascript
conn.on('error', ...)
framed.on('error', ...)   // este es el que falta siempre
```

Síntoma en un juego: un jugador cierra la ventana y al otro se le cae el proceso.

### El proceso no termina nunca / queda colgado al salir

Falta soltar algún handle propio. Un `setInterval` vivo (el game loop, el heartbeat) mantiene
el loop de Bare aunque el swarm ya esté destruido. `clearInterval()` en el teardown.

Si además hay un worker de `PearRuntime.run` activo, `Bare.exit()` a secas se cuelga:
hay que cerrar la App primero (`app.exit(code)`).

### `INVALID_URL: Invalid URL 'pear://<YOUR_KEY_HERE>'` (exit 134, core dumped)

El template recién clonado trae ese placeholder en `package.json` → `upgrade`. El worker crashea
y **se lleva el proceso puesto**. `pear touch` + `npm pkg set upgrade=pear://<key>` no es opcional
ni siquiera para correr en dev.

### `kill` a un proceso de Bare no hace nada

`./node_modules/.bin/bare` es un wrapper de **Node** con `suppressSignals: true`: registra
handlers no-op para SIGTERM/SIGINT/SIGHUP y spawnea el binario real como hijo.

- Ctrl+C en una terminal anda bien (la señal va a todo el process group).
- Matar por PID al wrapper no propaga nada al hijo. En scripts, usar el binario real:
  `node_modules/bare-runtime-<platform>-<arch>/bin/bare`.

### El peer se cayó y el otro no se entera

Esperado: Hyperswarm va sobre UDX (UDP), no hay `RST` que avise. Un cierre ordenado se detecta
al instante; un `kill -9` **no se detectó en 10s**. Hace falta un heartbeat de aplicación.
Ver `04-p2p.md`.

## Problemas del runtime Bare

### Faltan módulos builtin al correr con Bare

Bare no incluye los módulos de Node por default.
- Usar las alternativas `bare-*` (ej. `bare-process`).
- Para librerías cross-runtime: usar **import maps** para soportar ambos runtimes.
- Para dependencias de terceros de Node: usar **aliases de npm** apuntando a los equivalentes de Bare.

Ver `05-bare-runtime.md` para la tabla completa de mapeo.

### `AddonError: ADDON_NOT_FOUND`

- El addon nativo no está disponible para la plataforma/arquitectura actual.
- El addon no se linkeó durante la compilación (crítico en apps mobile).
- Problemas de caché de build → limpiar y recompilar.

### `bare-pack` con carga condicional de módulos

El escaneo estático de código no puede inferir imports dinámicos basados en condiciones de runtime.
Reemplazar la lógica condicional de runtime por **import maps** para la selección de módulos.

## Checklist [NUESTRO] cuando algo no anda

1. ¿El `pear seed` está corriendo? (es la causa #1 de "no me instala")
2. ¿La key en `package.json` → `upgrade` es la misma que estás seedeando?
3. ¿Corriste `npm version` antes de re-stagear? Sin bump de versión no hay update que detectar.
4. ¿Estás corriendo con `--updates`? El default en dev es `--no-updates`.
5. ¿Cambiaste `name` o `productName` después del primer release? Rompe el path de storage.
6. Sidecar en estado raro → `pear sidecar shutdown` y reintentar.
7. Ver los logs: en la variante daemon van a `<storage>/updates.log`, no a stdout.
8. `pear info pear://<key>` para confirmar qué hay realmente publicado en ese link.
9. Dos máquinas en la misma red NAT a veces no se ven — probar una por hotspot.

## Dónde pedir ayuda

- Chat de Keet del track (link completo en `08-links.md`)
- https://github.com/holepunchto — issues de cada repo
