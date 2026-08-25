# Track Pears — Aleph Hackathon 2026

Fuente: https://hacki.crecimiento.build/h/aleph-hackathon-2026/tracks/pears-track

## El desafío

> "Build a standalone CLI tool, deploy it with the Pear CLI, and make it installable with
> `pear install`, with peer-to-peer OTA updates."

## Premios

Pool total: **$1,500 USDt**
- 1º — $1,000 USDt
- 2º — $500 USDt

## Requisitos obligatorios — y cómo los cumplimos

| # | Requisito | Estado |
|---|---|---|
| 1 | Partir de **cualquier variante de `hello-pear-bare`** | ✅ branch `tui` — ver `01-quickstart.md` |
| 2 | Instalable con `pear install pear://<key>` | ✅ verificado en Linux y Windows desde otras redes |
| 3 | Deploy genuino con la Pear CLI **y seeding** | ✅ `pear stage` + `pear seed` — ver `03-deploy-ota.md` |
| 4 | Updates OTA P2P **demostrados funcionando** | ✅ una copia corriendo pasó de 2.0.4 a 2.0.5 sola |
| 5 | Enviar el link `pear://` para el juzgado | ✅ `pear://u9y7y9xq…` |
| 6 | **Conectividad P2P obligatoria** | ✅ partida completa entre dos máquinas en redes distintas |

El link, las plataformas y el manual operativo están en `09-the-great-pear.md`.

## Direcciones sugeridas por el track

- System tools con binarios evergreen
- **Juegos de línea de comandos**
- TUIs de mensajería aprovechando P2P
- Developer tools como binarios cross-platform
- Implementaciones experimentales de BLE-Swarm

## Elegir la "forma de proceso"

Las tres branches de `hello-pear-bare` cubren casos distintos:

| Branch | Forma | Para qué |
|---|---|---|
| `main` | Updater en un worker thread de Bare | Programas long-lived |
| `variant/single-thread` | Updater directo en el proceso principal | Long-lived sin necesidad de thread aparte |
| `variant/daemon` | Updates en daemon de fondo | Comandos one-shot |

## Entregables

| Entregable | Dónde |
|---|---|
| Repositorio **público** con README | el `README.md` de la raíz |
| Link `pear://` funcionando, **seedeado durante todo el juzgado** | `09-the-great-pear.md` §1 y §6 |
| Video demo mostrando **la instalación y el update OTA** | ⬜ pendiente de grabar |
| Especificación de plataformas de los binarios | darwin arm64/x64, linux x64/arm64, win32 x64 |

> ⚠️ **El seed es el único entregable que puede fallar solo.** Si la máquina que seedea se
> duerme o pierde la red durante el juzgado, la instalación no se puede verificar y no
> califica. Dos seeders, suspensión desactivada.

## Juzgado

- Juez: **dmc** (creador de Pear)
- Arranca **domingo 23 a las 13:00 (hora ARG)**
- Demo async
- **La instalación vía link `pear://` se verifica durante la evaluación** — si el seed está caído
  en ese momento, no se puede evaluar.

## Soporte durante la hackathon

Chat de Keet del track (ver `08-links.md` para el link completo) y https://keet.io
