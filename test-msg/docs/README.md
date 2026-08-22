# test-msg — prueba del flujo Pear

App de prueba: **chat P2P de terminal**. El objetivo NO es el chat, es **validar el flujo completo
de Pear** (touch → build → stage → seed → install → OTA) antes de meterle horas al juego.

## Estructura

```
test-msg/
├── app/          el proyecto (partió de hello-pear-bare @ e391b8a)
└── docs/         esto
```

`app/` **no** es un submódulo — son archivos normales del repo, para que al clonar venga todo.

## Arrancar (clone limpio)

```bash
git clone https://github.com/FrancoAmicone/aleph-hackaton.git
cd aleph-hackaton && git checkout test-msg
cd test-msg/app && npm install
npm start -- --room hackaton --log /tmp/mi.log
```

## Documentos

| Archivo | Qué tiene |
|---|---|
| `01-paso-a-paso.md` | **Empezá acá.** Cada comando desde `pear touch`, en orden, con qué esperar de output |
| `02-como-funciona.md` | Arquitectura del código: qué archivo hace qué, qué toqué y por qué |
| `03-bitacora.md` | Log de todo lo ejecutado, errores encontrados y cómo se resolvieron |
| `04-probar-con-equipo.md` | Instrucciones para pasarle a los compañeros y probar entre máquinas |
| `05-diagnostico-red.md` | Scripts para saber si un problema es de red o de código |
| `06-logs-y-monitoreo.md` | `--log` + `tail -f` para ver todo en tiempo real |
| `07-que-pasa-por-debajo.md` | DHT, hole punching, cifrado: cómo se conectan dos peers sin servidor |
| `08-procesos-zombi.md` | **Peers "fantasma" y cierre limpio.** Leelo antes de sacar conclusiones de un test |
| `09-conexion-directa.md` | **`conectar.js` — P2P verificado entre máquinas reales.** El camino que funciona |
| `10-caso-roman.md` | Lista de diagnóstico para la máquina que no conecta |
| `11-pipeline-verificado.md` | **make → build → stage → seed, ejecutado de verdad.** Con la trampa del binario |

## Estado actual

| Paso | Estado |
|---|---|
| Template clonado + deps instaladas | ✅ |
| `pear touch` → key generada | ✅ |
| `package.json` configurado (name, version, upgrade) | ✅ |
| Template corre sin modificar | ✅ verificado |
| Código del chat escrito | ✅ |
| **Dos peers se conectan y se hablan** | ✅ **verificado** — misma máquina, bidireccional, 6-11s |
| **P2P entre MÁQUINAS REALES (Franco ↔ Gino)** | ✅ **verificado** — `conectar.js`, 7.7s, charla de 327s |
| Lo mismo desde una segunda red de Franco | ✅ 12.6s |
| Logging a archivo (`--log`) para `tail -f` | ✅ |
| Mitigación del race de conexión (`discovery.refresh`) | ✅ peor caso de 43s → 11s |
| Máquina de Roman (Ubuntu 26) | 🔴 no conecta — ver `10-caso-roman.md` |
| Lo mismo entre dos máquinas distintas | ⬜ falta (validación del escenario real) |
| `npm run make` (binario) | ⬜ |
| `pear stage` + `pear seed` | ⬜ |
| `pear install` desde otra máquina | ⬜ |
| OTA verificado end-to-end | ⬜ |

**El P2P anda.** Evidencia:

```
A: * 70f37d entró a la sala (1 conectado/s)
A: 70f37d > te leo, soy B
B: * 7a81a8 entró a la sala (1 conectado/s)
B: 7a81a8 > hola soy A
```

## La key del proyecto

```
pear://9nbjjp5jmtxxq3jj8ko7z4sdfnohucgwyjsxspdpsnuc8yf136my
```

Es la key de **prueba**. Para el juego se genera una nueva con `pear touch`.

## Doc oficial de referencia

Los `../docs/` de la raíz del repo tienen la doc de Pear condensada.
Para este flujo, los relevantes:

- `../../docs/01-quickstart.md` — el template
- `../../docs/02-pear-cli.md` — comandos
- `../../docs/03-deploy-ota.md` — stage/seed/OTA
- `../../docs/04-p2p.md` — hyperswarm
