import ctypes, os, subprocess, sys
libc = ctypes.CDLL(None, use_errno=True)
if libc.prctl(36, 1, 0, 0, 0): raise OSError(ctypes.get_errno(), 'PR_SET_CHILD_SUBREAPER')
child = subprocess.Popen(sys.argv[1:])
result = None
while True:
    try:
        pid, status = os.waitpid(-1, 0)
        if pid == child.pid: result = os.waitstatus_to_exitcode(status)
    except ChildProcessError: break
sys.exit(result if result is not None else 1)
