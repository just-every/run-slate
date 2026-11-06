import datetime
import json
from pathlib import Path
import subprocess
import sys

label, *command = sys.argv[1:]
packet = Path.home() / 'rer-consolidation/work/sd-slate-c-f187/packet'
head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
tree = subprocess.check_output(['git', 'rev-parse', 'HEAD^{tree}'], text=True).strip()
dirty = subprocess.check_output(['git', 'status', '--porcelain'], text=True)
if dirty:
    raise SystemExit('candidate check requires a clean product checkout')
now = lambda: datetime.datetime.now(datetime.timezone.utc).isoformat()
row = {'label': label, 'head': head, 'tree': tree, 'cleanAtStart': True, 'command': command, 'startedAt': now()}
with (packet / (label + '.log')).open('w') as log:
    result = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT)
row.update(finishedAt=now(), exit=result.returncode)
(packet / (label + '.json')).write_text(json.dumps(row, indent=2) + '\n')
print(json.dumps(row))
raise SystemExit(result.returncode)
