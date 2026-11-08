import glob,hashlib,json,sqlite3,subprocess
from pathlib import Path
root=Path('/workspace/slate-f219')
paths=[Path(p) for p in glob.glob(str(root/'.artifacts/ui-convergence/schema-*/v3/d1/miniflare-D1DatabaseObject/*.sqlite')) if not p.endswith('metadata.sqlite')]
path=max(paths,key=lambda p:p.stat().st_mtime)
db=sqlite3.connect('file:'+str(path)+'?mode=ro',uri=True)
expected=sorted(p.name for p in (root/'migrations/core').glob('*.sql'))
actual=sorted(row[0] for row in db.execute('SELECT name FROM d1_migrations'))
violations=list(db.execute('PRAGMA foreign_key_check'))
assert actual==expected,(actual,expected)
assert not violations,violations
result=dict(head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),complete=True,applied=len(actual),expected=len(expected),historyPreserved=True,foreignKeyViolations=len(violations),migrations=[dict(name=n,sha256=hashlib.sha256((root/'migrations/core'/n).read_bytes()).hexdigest()) for n in actual])
print(json.dumps(result,indent=2))
db.close()
