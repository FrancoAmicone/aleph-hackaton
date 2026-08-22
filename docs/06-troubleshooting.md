# Troubleshooting

Fuente: https://docs.pears.com/how-to/troubleshooting/

## Problemas de Pear

### Unirse a un topic de Hyperswarm tarda mucho

Causas posibles:
- Redes con **NAT aleatorio** necesitan nodos adicionales para facilitar las conexiones.
- **Instancias de Hyperswarm que no se destruyeron en el teardown** impiden la limpieza correcta
  de los registros del HyperDHT. → Siempre `await swarm.destroy()` al salir.
- **Firewalls** bloqueando tráfico.

> **[NUESTRO] El wifi de una hackathon es exactamente el peor caso** (NAT simétrico, portal cautivo,
> puertos bloqueados). Plan B: probar todo también con hotspot de celular. Y probar la conectividad
> entre dos máquinas **temprano**, no a las 3 AM.

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
