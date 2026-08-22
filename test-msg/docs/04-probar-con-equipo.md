# Probar con el equipo

**Objetivo:** confirmar que dos peers en **máquinas distintas** se conectan y se hablan.

> ✅ **Ya está verificado en una sola máquina** (dos procesos, chat bidireccional, ~7 segundos).
> El código anda. Esto no es debug — es validar el escenario real del juzgado.
> Debería tomar 5 minutos.

---

## Setup (cada persona, una vez)

### 1. Instalar Pear

```bash
# macOS / Linux
curl https://install.pears.com/pear.sh | sh
# Windows (PowerShell)
irm https://install.pears.com/pear.ps1 | iex
```

Verificar:
```bash
pear -v      # ojo: -v, NO --version
```

### 2. Traer el proyecto

```bash
git clone https://github.com/FrancoAmicone/aleph-hackaton.git
cd aleph-hackaton
git checkout test-msg
cd test-msg/app
npm install
```

Eso es todo — **no hace falta ningún symlink ni paso extra.**

### 3. Verificar que arranca

```bash
npm start
```

Tiene que imprimir `=== test-msg v1.0.0 | sala: general ===` y quedarse esperando.
Ctrl+C para salir.

Si falla con `sh: bare: command not found`, estás en una versión vieja del código —
traé los últimos cambios (`git pull`).

---

## El test

**Los dos al mismo tiempo**, en máquinas distintas, misma sala:

```bash
npm start -- --room hackaton
```

### ✅ Si funciona, se ve así

```
=== test-msg v1.0.0 | sala: hackaton ===
Escribí y Enter para mandar. Ctrl+C para salir.

* worker arriba | v1.0.0 | storage: /var/folders/.../pear/test-msg/app-storage
* sala "hackaton" lista | sos b5262c | topic c485632cfdef…
* ddb727 entró a la sala (1 conectado/s)          ← LA LÍNEA QUE IMPORTA
```

Tipeá algo + Enter. Del otro lado tiene que aparecer:
```
b5262c > hola che
```

**Si ves `entró a la sala` y los mensajes cruzan: el P2P anda y podemos seguir con el deploy.**

### 🔴 Si NO funciona

1. **Esperá 60 segundos** antes de darlo por muerto. Baseline medido: ~7s, pero la primera corrida
   puede ser lenta por bootstrap frío del DHT.

2. **¿Los dos muestran el MISMO topic?**
   La línea `topic c485632cfdef…` tiene que ser idéntica en ambos.
   - Si difieren → salas distintas (typo en `--room`) o versiones distintas del código.
   - Si coinciden → el problema es de red, no del código.

3. **Corré el diagnóstico** de `05-diagnostico-red.md`. Separa red de código en un minuto:
   ```bash
   cd test-msg/app
   node diag-node.js MI-NOMBRE prueba
   ```

4. **¿Hay VPN?** Apagala y reprobá. El DHT usa UDP.

5. **Probá por hotspot de celular.** Si con hotspot anda y con el wifi del venue no, es el firewall
   del venue — dato importante para el día del juzgado.

---

## Variantes

### Test A — misma máquina, dos terminales ✅ ya verificado
```bash
npm start -- --room test1 --storage /tmp/peerA
npm start -- --room test1 --storage /tmp/peerB
```
⚠️ **`--storage` distinto es obligatorio**, si no el Corestore colisiona.

### Test B — dos máquinas, misma red wifi ← **empezá por acá**
```bash
npm start -- --room test2
```

### Test C — dos máquinas, redes distintas
Uno por wifi del venue, otro por hotspot de celular.
```bash
npm start -- --room test3
```
Es el escenario más parecido al del juzgado.

### Test D — los 4 en la misma sala
Tiene que decir `(3 conectado/s)` en cada uno y los mensajes llegar a todos.
Esto valida el broadcast, que es lo que va a necesitar el juego.

---

## Qué reportar

```
Test:            [A / B / C / D]
Red:             [misma wifi / redes distintas / hotspot]
Topic coincide:  [sí / no]
Conectó:         [sí / no]   ¿en cuántos segundos?
Mensajes cruzan: [sí / no]
Output completo: [pegar]
```

---

## Después de que ande

Siguiente paso: `01-paso-a-paso.md` → Paso 8 (`npm run make`) y el flujo de deploy.

El reparto de máquinas importa: cada binario se buildea en un host de esa plataforma.
Con 4 personas conviene cubrir `darwin-arm64`, `darwin-x64`, `linux-x64` y `win32-x64`
según lo que tenga cada uno.
