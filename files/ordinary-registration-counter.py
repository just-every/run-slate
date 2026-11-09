"""Apply Slate's documented conservative 20 release-wall exclusions to its AST inventory."""
import json
import sys
from pathlib import Path

source = Path(sys.argv[1])
row = json.loads(source.read_text())
excluded = [file for file in row['perFile'] if file['file'].startswith('tests/flagship/release-clauses/')]
ordinary = [file for file in row['perFile'] if file not in excluded]
result = dict(ref=row['ref'], source=source.name, definition='All expanded cases minus the same 20 release-wall cases documented in tests/requirements/cli-journey.md', total=sum(file['total'] for file in ordinary), excludedTotal=sum(file['total'] for file in excluded), excluded=excluded, perFile=ordinary, unresolved=row['unresolved'])
assert result['excludedTotal']==20
assert result['total']<=200
print(json.dumps(result,indent=2))
