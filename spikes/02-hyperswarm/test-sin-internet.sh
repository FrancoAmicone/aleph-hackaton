#!/bin/bash
# SPIKE 2 — ¿dos peers YA conectados sobreviven a un corte de internet?
#
# Correr:  sudo bash test-sin-internet.sh
#
# Qué hace:
#   1. Levanta dos peers (como tu usuario, no como root) y espera a que se encuentren.
#   2. Bloquea UDP saliente hacia internet, dejando pasar loopback y LAN.
#      -> el DHT (bootstrap nodes en IPs públicas, UDP 49737) queda inalcanzable.
#      -> el tráfico entre los peers, que es local, NO se toca.
#   3. Mira si el ping/pong sigue fluyendo durante el corte.
#   4. Restaura las reglas SIEMPRE (trap en EXIT/INT/TERM).
#
# Sólo toca UDP: tu navegador, ssh y todo lo que sea TCP siguen andando.
# Podés cortarlo con Ctrl+C en cualquier momento; las reglas se limpian igual.

set -u

CHAIN=SPIKE_BLOCK
DIR=/home/acerlin/Documents/aleph-hackaton/spikes/02-hyperswarm
OUT=/tmp/spike2-sin-internet
REAL_USER=${SUDO_USER:-$USER}

if [ "$(id -u)" -ne 0 ]; then
  echo "Este script necesita root para tocar iptables. Corrélo con: sudo bash $0"
  exit 1
fi

mkdir -p $OUT
chown "$REAL_USER" $OUT

cleanup() {
  echo
  echo ">>> restaurando reglas de red..."
  iptables -D OUTPUT -j $CHAIN 2>/dev/null
  iptables -F $CHAIN 2>/dev/null
  iptables -X $CHAIN 2>/dev/null
  kill -9 $ANA $BETO 2>/dev/null
  echo ">>> reglas restauradas. Verificá con: sudo iptables -L OUTPUT -n"
}
trap cleanup EXIT INT TERM

BARE=$(ls $DIR/node_modules/bare-runtime-*/bin/bare | head -1)
ROOM="pear-pong-sininternet-$RANDOM"
rm -f $OUT/ana.log $OUT/beto.log

echo ">>> levantando peers..."
sudo -u "$REAL_USER" $BARE $DIR/peer.js "$ROOM" ana > $OUT/ana.log 2>&1 &
ANA=$!
sudo -u "$REAL_USER" $BARE $DIR/peer.js "$ROOM" beto > $OUT/beto.log 2>&1 &
BETO=$!

for i in $(seq 1 60); do
  grep -q '+ conectado' $OUT/ana.log 2>/dev/null && { echo ">>> conectados tras ~${i}s"; break; }
  sleep 1
done

if ! grep -q '+ conectado' $OUT/ana.log 2>/dev/null; then
  echo ">>> ERROR: nunca se conectaron. Abortando."
  exit 1
fi

echo ">>> por dónde están hablando:"
ss -unp 2>/dev/null | grep -E "$ANA|$BETO" | head -5

PINGS_ANTES=$(grep -c '<- pong' $OUT/ana.log)
echo ">>> pongs recibidos antes del corte: $PINGS_ANTES"

echo
echo ">>> ==================== CORTANDO INTERNET (UDP) ===================="
iptables -N $CHAIN 2>/dev/null
iptables -F $CHAIN
iptables -A $CHAIN -o lo -j RETURN
iptables -A $CHAIN -d 127.0.0.0/8 -j RETURN
iptables -A $CHAIN -d 10.0.0.0/8 -j RETURN
iptables -A $CHAIN -d 172.16.0.0/12 -j RETURN
iptables -A $CHAIN -d 192.168.0.0/16 -j RETURN
iptables -A $CHAIN -p udp -j DROP
iptables -I OUTPUT 1 -j $CHAIN
echo ">>> DHT inalcanzable. Aguantando 30s..."

sleep 30

PINGS_DURANTE=$(grep -c '<- pong' $OUT/ana.log)
MUERTO=$(grep -c 'no responde hace' $OUT/ana.log)

echo
echo ">>> ==================== RESULTADO ===================="
echo "pongs antes del corte:   $PINGS_ANTES"
echo "pongs después de 30s:    $PINGS_DURANTE  (+$((PINGS_DURANTE - PINGS_ANTES)))"
echo "peers dados por muertos: $MUERTO"
echo
if [ "$MUERTO" -gt 0 ]; then
  echo "VEREDICTO: la conexión SE CAYÓ sin internet."
elif [ "$PINGS_DURANTE" -gt "$PINGS_ANTES" ]; then
  echo "VEREDICTO: la conexión SOBREVIVIÓ — siguieron hablando sin DHT."
else
  echo "VEREDICTO: sin pongs nuevos pero sin declarar muerto — ambiguo, mirar los logs."
fi
echo
echo ">>> últimas líneas de ana:"
grep -vE '<- (ping|pong) #' $OUT/ana.log | tail -10
echo
echo ">>> logs completos en $OUT/"
