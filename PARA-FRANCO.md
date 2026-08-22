# Handoff Gino → Franco — 22-ago 20:50

Contexto completo en `contextoGino.txt` (transcript). Esto es el resumen accionable.

## Lo que verifiqué desde Ubuntu (tu pipeline funciona)

Instalé tu link en una máquina Linux, distinta de la tuya:

```
pear install pear://9nbjjp5jmtxxq3jj8ko7z4sdfnohucgwyjsxspdpsnuc8yf136my

App: test-msg          Version: 1.0.0
Pathname: /by-arch/linux-x64/app/test-msg
Target: /home/acerlin/.local/bin/test-msg
Installed
```

- **`pear install` desde otra máquina: ✅** Bajó 90 MB desde **1 peer** (tu máquina), sin servidor.
- **Los binarios cross-compilados CORREN: ✅** `test-msg --version` → `test-msg v1.0.0`, exit 0.
  Vos habías verificado el *formato* (`file` decía ELF); ahora está confirmado que **arranca**.
  **Tu hallazgo de que la doc oficial se equivoca con "compilar en un host que matchee" queda
  probado end-to-end.**

### Corrección a `11-pipeline-verificado.md`

Dice *"hoy sólo está publicado el binario darwin-arm64, así que sólo instala en Mac ARM"*.
**Desactualizado.** `pear dump --list` muestra las 5:

```
/by-arch/darwin-arm64/app/test-msg
/by-arch/darwin-x64/app/test-msg
/by-arch/linux-arm64/app/test-msg
/by-arch/linux-x64/app/test-msg
/by-arch/win32-x64/app/test-msg.exe
```

## 🔴 Lo que falta: el OTA — y hay un bloqueante

Confirmé tu sospecha del `delay` en el código **publicado** (`workers/main.js:44`):

```js
const pear = new PearRuntime({ ...updaterConfig, swarm: updaterSwarm, store })
```

No hay `delay` → default **3600000 ms (1 hora)**.

**La trampa:** la v1 instalada corre *su propio* código. Publicar la v2 con `delay: 5000`
no sirve — la que espera es la v1. Hay que arreglarlo **antes** de publicar la v1 de la demo.

### Pasos, en este orden

1. `delay: 5000` en `workers/main.js:44`:
   ```js
   const pear = new PearRuntime({ ...updaterConfig, swarm: updaterSwarm, store, delay: 5000 })
   ```
2. `npm version patch` → 1.0.1
3. `npm run make` + `pear build` + `pear stage`
4. **Avisame** → desinstalo la 1.0.0 e instalo la 1.0.1 en Ubuntu
5. Publicá 1.0.2 con un cambio visible (un string de bienvenida alcanza)
6. Mi instancia debería loguear los 3 mensajes del updater → **eso es el video**

## ⚠️ Urgente: el seed

Tu seed corre en background atado a tu sesión de Claude. Cuando la cierres **se corta**, y
nadie puede instalar ni actualizar. Levantalo en una terminal dedicada, sin suspensión.

Ahora mismo está vivo (por eso pude instalar), pero es frágil.

## Pendiente de 2 minutos: vos como servidor

Tenés razón en que no está probado. La única vez que fuiste servidor el cliente era Roman,
que falla contra todo. No es simétrico: `listen` (entrantes) y `connect` (salientes) son
caminos distintos por el NAT.

```bash
# vos
node conectar.js servidor pruebainversa
# me pasás la clave, yo corro el cliente desde Ubuntu
```

## El nombre — bloquea empezar la app

`productName` define el nombre del binario **y** el directorio de storage persistente.
Cambiarlo después del primer release rompe a quien ya instaló.

Si va a ser `truco`, hay que generar la key definitiva con ese `productName` **antes** del
primer release real, y dejar `test-msg` como banco de pruebas. Es decisión de equipo, no técnica.

## Estado del proyecto

| | |
|---|---|
| Input en tiempo real (Bare + raw mode) | ✅ `spikes/01-raw-input/` |
| P2P (Hyperswarm, JSON, desconexión) | ✅ `spikes/02-hyperswarm/` |
| Conectividad real entre máquinas y redes distintas | ✅ medido |
| Pipeline: touch → make → build → stage → seed | ✅ (vos) |
| `pear install` desde otra máquina | ✅ (recién) |
| **OTA v1 → v2** | 🔴 **lo único que falta** |
| Nombre del juego / key definitiva | ⬜ decisión de equipo |
