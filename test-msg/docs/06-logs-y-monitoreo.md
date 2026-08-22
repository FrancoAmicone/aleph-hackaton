# Logs y monitoreo en tiempo real

## Dónde están los logs

**Por defecto la app NO escribe ningún archivo** — solo imprime a la terminal.
Para tener un archivo que se pueda seguir con `tail -f`, hay que pasarle `--log`:

```bash
cd ~/Desktop/Aleph-hackaton/test-msg/app
npm start -- --room hackaton --log /tmp/peerA.log
```

El path se resuelve a absoluto, así que `--log peerA.log` cae en `test-msg/app/peerA.log`.
Recomiendo `/tmp/` para no ensuciar el repo.

## Seguirlo en vivo

En otra terminal:

```bash
tail -f /tmp/peerA.log
```

Dos peers en paralelo, en una sola ventana:

```bash
tail -f /tmp/peerA.log /tmp/peerB.log
```

`tail -f` con varios archivos mete un header `==> archivo <==` cada vez que cambia de origen,
así que se ve claro quién dijo qué.

Solo lo relevante del P2P:

```bash
tail -f /tmp/peerA.log | grep -E "entró|salió|sala|>"
```

Solo el updater (para el demo del OTA):

```bash
tail -f /tmp/peerA.log | grep updater
```

## Formato

```
--- test-msg v1.0.0 | sala logtest | 2026-08-22T16:34:06.510Z ---
[16:34:06.513] Updates: disabled
[16:34:06.513] Log: /tmp/peerA.log
[16:34:06.692] * worker arriba | v1.0.0 | storage: /var/folders/.../app-storage
[16:34:12.306] * sala "logtest" lista | sos 49087c | topic 5ac3fa26a126…
[16:34:19.115] * 8222e8 entró a la sala (1 conectado/s)
[16:34:31.266] yo > mensaje desde A
[16:34:35.402] 8222e8 > respuesta desde B
```

Timestamps en `HH:MM:SS.mmm`. El archivo se **trunca** en cada arranque (una corrida por archivo).

**`yo > ...` sale solo al archivo, no a pantalla** — la terminal ya hace eco de lo que tipeás.

## Setup recomendado para probar de a dos

Cuatro terminales:

```bash
# T1 — peer A
cd test-msg/app && npm start -- --room hackaton --log /tmp/peerA.log

# T2 — peer B (si es la misma máquina, storage distinto)
cd test-msg/app && npm start -- --room hackaton --storage /tmp/peerB --log /tmp/peerB.log

# T3 — mirar todo junto
tail -f /tmp/peerA.log /tmp/peerB.log

# T4 — libre para comandos
```

## Otros logs del sistema

| Qué | Dónde |
|---|---|
| Storage de la app | lo imprime al arrancar (`* worker arriba \| ... storage: ...`) |
| En dev | `/var/folders/.../T/pear/test-msg/` (macOS) o `$TMPDIR/pear/test-msg/` |
| Instalada | el directorio persistente del SO, según `productName` |
| Updater en `variant/daemon` | `<storage>/updates.log` — **no** va a stdout |
| Sidecar de Pear | `pear sidecar --log-level 3` |

Ver qué hay publicado en la key, sin instalar nada:

```bash
pear info pear://9nbjjp5jmtxxq3jj8ko7z4sdfnohucgwyjsxspdpsnuc8yf136my
```

## Para el video demo

Grabá una ventana con:

```bash
tail -f /tmp/peerA.log | grep -E "updater|entró|sala"
```

Filtra el ruido y deja a la vista justo la secuencia que se juzga:

```
[updater] getting new update
[updater] update complete... applying
[updater] applied update, restart to run latest version
```
