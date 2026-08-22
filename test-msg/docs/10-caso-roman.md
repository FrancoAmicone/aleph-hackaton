# Caso Roman — no conecta desde Ubuntu 26

## Los hechos

| Dato | Valor |
|---|---|
| SO | Ubuntu 26 |
| ufw | `inactive` |
| NAT reportado | `randomized=false` (consistente) ✅ |
| `firewalled` | `true` (normal) |
| Error | `HOLEPUNCH_ABORTED` a los ~13-18s |
| IP pública en la wifi del venue | `181.85.166.210` |
| IP pública de Franco, **misma wifi** | `200.80.213.210` |
| Franco ↔ Gino, mismo código | ✅ funciona |

**La anomalía más fuerte: dos máquinas en la misma wifi con IPs públicas distintas.**
Eso no debería pasar. Un firewall local no cambia tu IP pública — o sea que el tráfico de Roman
sale por otro camino que el de Franco.

## Lista de diagnóstico, en orden

Ordenada por probabilidad y por lo barato que es descartarla.

### 1. ¿Hay una VPN o túnel activo? ← EMPEZAR ACÁ

Es lo que mejor explica la IP pública distinta.

```bash
ip -br addr                 # listar TODAS las interfaces
ip route get 8.8.8.8        # ¿por qué interfaz sale realmente el tráfico?
```

Buscar interfaces como `tun0`, `tap0`, `wg0`, `tailscale0`, `zt*`, `proton*`, `nordlynx`.

Si la ruta por defecto NO sale por `wlan0`/`wlp*`, hay un túnel de por medio.

Apagar lo que aparezca:
```bash
sudo systemctl stop tailscaled     # Tailscale
sudo wg-quick down wg0             # WireGuard
nmcli connection show --active     # ver conexiones de NetworkManager
```

Y volver a comparar la IP pública con la de Franco:
```bash
curl -s https://api.ipify.org; echo
```

**Si las IPs coinciden después de apagar el túnel, era eso.**

### 2. nftables con reglas propias

`ufw inactive` **no** significa que no haya reglas. Ubuntu 26 usa nftables por debajo.

```bash
sudo nft list ruleset
```

Sin salida = limpio. Si hay reglas con `drop` o `reject`, ese es el problema.

Para probar (temporal, se revierte al reiniciar):
```bash
sudo nft flush ruleset
```

### 3. iptables heredado (Docker es el sospechoso clásico)

Docker mete reglas propias y a veces rompe UDP entrante.

```bash
sudo iptables -L INPUT -n -v
sudo iptables -L FORWARD -n -v
docker ps 2>/dev/null && echo "Docker está corriendo"
```

Si hay Docker:
```bash
sudo systemctl stop docker
```
y reprobar.

### 4. ¿Node viene de snap?

Los snaps corren confinados y pueden restringir el acceso a la red.

```bash
which node
snap list 2>/dev/null | grep -i node
```

Si `which node` devuelve algo bajo `/snap/`, instalar Node nativo:
```bash
sudo snap remove node
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

### 5. Comparar IP pública en simultáneo

Con los dos en la misma wifi, **al mismo tiempo**:

```bash
curl -s https://api.ipify.org; echo
```

- **IPs iguales** → salen por el mismo lado; el problema es local de Roman
- **IPs distintas** → la red los rutea distinto, o Roman tiene un túnel (volver al punto 1)

### 6. ¿La wifi aísla clientes?

Con los dos en la misma wifi, que Roman haga ping a la IP LAN de Franco:

```bash
ip -br addr                        # Roman ve su IP LAN
ping -c 4 <IP-LAN-DE-FRANCO>       # ej. 192.168.112.218
```

Sin respuesta = **AP isolation**: la red bloquea el tráfico entre clientes.
Ahí no hay nada que configurar en la máquina; hay que cambiar de red.

### 7. Descartar que sea la red de Roman

Que Roman pruebe desde el **hotspot del celular de otra persona** (no el suyo).
Si desde ahí conecta, el problema es su red habitual, no su máquina.

## Cómo confirmar que se arregló

```bash
# Franco
node conectar.js servidor prueba-roman
# pasa la clave

# Roman
node conectar.js cliente <clave>
```

Éxito:
```
[+7.7s] ✅ CONECTADO al servidor
[+7.8s] 📩 servidor: hola, soy el servidor
```

Revisar además el log en `logs/` — si `punches consistent` sube y conecta, hubo hole punching real.

## Lo que YA está descartado

- ❌ No es el código: **funciona entre Franco y Gino**, y desde dos redes distintas de Franco
- ❌ No es ufw: está `inactive`
- ❌ No es NAT aleatorio: reporta `randomized=false`
- ❌ No es clave equivocada: se verificó que coincidían exactamente
- ❌ No es el firewall de Franco: macOS lo tiene desactivado

## Plan B si no se resuelve

**No bloquea el proyecto.** Se puede desarrollar y demostrar con Franco y Gino.
Para el juzgado del domingo, el juez va a estar en su propia red.

Si igual queremos robustez en redes hostiles, la salida oficial es **relay / blind peering**:
https://docs.pears.com/how-to/blind-peering/
