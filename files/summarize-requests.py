from pathlib import Path
import collections, json
packet = Path(__file__).resolve().parent
result = {}
for filename in ['before-sharing-requests.jsonl', 'after-requests.jsonl', 'final-merged-requests.jsonl', 'final-core-mobile-requests.jsonl']:
    source = packet / filename
    if not source.is_file(): continue
    rows = [json.loads(line) for line in source.read_text().splitlines()]
    starts = [i for i, row in enumerate(rows) if row['scope'] == 'auth' and row['path'] == '/api/auth/magic' and row['count'] == 1]
    if not starts: starts = [0]
    # Auth runs in the same fixed minute while creating the identity fixture.
    segments = []
    for start, end in zip(starts, starts[1:] + [len(rows)]):
        segment = rows[start:end]
        actors = {}
        for scope in sorted(set(row['scope'] for row in segment if row['scope'].startswith('operator:'))):
            observed = [row for row in segment if row['scope'] == scope]
            left = 0; rolling = 0
            for right, row in enumerate(observed):
                while observed[left]['at'] <= row['at'] - 60000: left += 1
                rolling = max(rolling, right - left + 1)
            label = scope if scope in ['operator:browser-owner', 'operator:browser-reader'] else 'operator:later-member'
            actors[label] = {'requests': len(observed), 'max_fixed_window': max(collections.Counter(row['bucket'] for row in observed).values()), 'max_limiter_key_window': max(row['count'] for row in observed), 'max_rolling_minute': rolling, 'rate_limited': sum(row['count'] > row.get('limit', 600) for row in observed)}
        segments.append({'duration_seconds': round((segment[-1]['at'] - segment[0]['at']) / 1000, 3), 'actors': actors})
    result[filename] = segments
(packet / 'request-summary.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
