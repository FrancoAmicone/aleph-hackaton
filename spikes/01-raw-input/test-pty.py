#!/usr/bin/env python3
"""Corre el spike dentro de un PTY real y verifica raw mode + restauración.

Uso: drive_pty.py <exit-mode: q|ctrlc> [cmd...]
"""
import os, pty, sys, time, select, termios, subprocess

exit_mode = sys.argv[1]
cmd = sys.argv[2:]

master, slave = pty.openpty()
# tamaño de ventana, para que stdout.columns/rows den algo real
import fcntl, struct
fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 24, 80, 0, 0))

def mode(fd):
    """Devuelve (icanon, echo) del fd."""
    attrs = termios.tcgetattr(fd)
    lflag = attrs[3]
    return bool(lflag & termios.ICANON), bool(lflag & termios.ECHO)

before = mode(slave)

proc = subprocess.Popen(cmd, stdin=slave, stdout=slave, stderr=slave,
                        close_fds=True)

out = b''
def pump(seconds):
    global out
    end = time.time() + seconds
    while time.time() < end:
        r, _, _ = select.select([master], [], [], 0.05)
        if r:
            try:
                out += os.read(master, 65536)
            except OSError:
                break

# esperar a que arranque y entre en raw mode
pump(2.5)
during = mode(slave)

# --- mandar teclas ---
keys = [
    (b'\x1b[A', 'flecha arriba'),
    (b'\x1b[B', 'flecha abajo'),
    (b'\x1b[D', 'flecha izquierda'),
    (b'\x1b[C', 'flecha derecha'),
    (b' ',      'espacio'),
    (b'a',      "letra 'a'"),
]
for seq, _ in keys:
    os.write(master, seq)
    pump(0.35)

# typeahead: varias teclas en un solo chunk, para probar el decoder
os.write(master, b'\x1b[A\x1b[Ax ')
pump(0.6)

# heartbeat: dejar correr para ver que el loop no está bloqueado
pump(1.6)

# --- salida ---
if exit_mode == 'q':
    os.write(master, b'q')
else:
    os.write(master, b'\x03')  # Ctrl+C

pump(1.5)

try:
    code = proc.wait(timeout=5)
except subprocess.TimeoutExpired:
    proc.kill()
    code = 'TIMEOUT (proceso colgado)'

after = mode(slave)

print(out.decode('utf-8', 'replace').replace('\r\n', '\n'))
print('===== VERIFICACION =====')
print(f'termios ANTES   icanon={before[0]} echo={before[1]}   (esperado: True/True)')
print(f'termios DURANTE icanon={during[0]} echo={during[1]}   (esperado: False/False = RAW)')
print(f'termios DESPUES icanon={after[0]} echo={after[1]}   (esperado: True/True = restaurado)')
print(f'exit code: {code}')

raw_ok = during == (False, False)
restored_ok = after == (True, True)
print(f'RAW MODE:    {"OK" if raw_ok else "FALLO"}')
print(f'RESTAURADO:  {"OK" if restored_ok else "FALLO"}')
