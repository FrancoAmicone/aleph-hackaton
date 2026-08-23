import os, pty, sys, time, select, signal, fcntl, termios, struct

dur = float(sys.argv[1])
keys = sys.argv[2]          # ej "6:CR" o "6:RIGHT,7:CR"
cmd  = sys.argv[3:]

SEQ = {'CR': b'\r', 'RIGHT': b'\x1b[C'}
plan = []
for item in keys.split(','):
    t, k = item.split(':')
    plan.append([float(t), SEQ[k], False])

pid, fd = pty.fork()
if pid == 0:
    os.execvp(cmd[0], cmd)
fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', 50, 160, 0, 0))

t0 = time.time()
while time.time() - t0 < dur:
    r, _, _ = select.select([fd], [], [], 0.3)
    if r:
        try:
            if not os.read(fd, 65536): break
        except OSError:
            break
    for p in plan:
        if not p[2] and time.time() - t0 > p[0]:
            os.write(fd, p[1]); p[2] = True
os.kill(pid, signal.SIGKILL); os.waitpid(pid, 0)
