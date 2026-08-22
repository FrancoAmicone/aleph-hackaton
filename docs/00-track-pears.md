# Track Pears — Aleph Hackathon 2026

Fuente: https://hacki.crecimiento.build/h/aleph-hackathon-2026/tracks/pears-track

## El desafío

> "Build a standalone CLI tool, deploy it with the Pear CLI, and make it installable with
> `pear install`, with peer-to-peer OTA updates."

## Premios

Pool total: **$1,500 USDt**
- 1º — $1,000 USDt
- 2º — $500 USDt

## Requisitos obligatorios

1. Partir de **cualquier variante de `hello-pear-bare`**.
2. La herramienta debe instalarse con `pear install pear://<key>`.
3. Deploy genuino con la Pear CLI **y seeding**.
4. Updates OTA P2P **demostrados funcionando**.
5. Enviar el link `pear://` para el juzgado.
6. **Conectividad P2P obligatoria.**

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

- Repositorio **público** con README
- Link `pear://` funcionando, **seedeado durante todo el juzgado**
- Video demo grabado mostrando **la instalación y el update OTA**
- Especificación de plataformas de los binarios buildeados

## Juzgado

- Juez: **dmc** (creador de Pear)
- Arranca **domingo 23 a las 13:00 (hora ARG)**
- Demo async
- **La instalación vía link `pear://` se verifica durante la evaluación** — si el seed está caído
  en ese momento, no se puede evaluar.

## Soporte durante la hackathon

Chat de Keet del track (ver `08-links.md` para el link completo) y https://keet.io
