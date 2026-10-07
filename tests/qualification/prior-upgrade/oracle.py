"""Independent complete-row oracle. No first-column identity or silent field exclusions."""
import sys,json,collections,hashlib,zipfile
canon=lambda x:json.dumps(x,sort_keys=True,separators=(',',':'),ensure_ascii=False)
def load(p):
 with open(p) as f:return json.load(f)
def compare(before,after,project=None):
 checks=[]
 for name,t in before['tables'].items():
  assert name in after['tables'],('missing table',name)
  a=after['tables'][name];cols=[c['name'] for c in t['columns']]
  assert set(cols)<=set(c['name'] for c in a['columns']),('lost column',name)
  expected=t['rows'];actual=[{k:r[k] for k in cols} for r in a['rows']]
  if name=='d1_migrations':
   old_ids={r['id'] for r in expected};actual=[r for r in actual if r['id'] in old_ids]
  if project:expected,actual=project(name,expected,actual)
  elif name=='sqlite_sequence':
   expected=[dict(r,seq=max((x['id'] for x in after['tables']['d1_migrations']['rows']),default=0)) if r['name']=='d1_migrations' else r for r in expected]
  assert collections.Counter(map(canon,expected))==collections.Counter(map(canon,actual)),('all-field multiset mismatch',name,expected,actual)
  checks.append({'table':name,'rows':len(expected),'columns':cols,'primaryKey':t['primaryKey']})
 return checks
def restore(manifest,after):
 checks=[]
 now_values=set();map_keys={}
 for old in manifest['tables'].get('files',[]):
  found=[r for r in after['tables']['files']['rows'] if r['id']==old['id']];assert len(found)==1
  key=found[0]['storage_key'];assert key.startswith('federation/restore/');map_keys[old['storage_key']]=key
 def safe(name,r):
  r=r.copy()
  for k in ['credential_ciphertext','token_digest','token_hash','client_secret','api_key','secret']:
   if k in r:r[k]=None
  return r
 for name,rows in manifest['tables'].items():
  target=after['tables'][name]['rows'];assert len(rows)==len(target),(name,'count')
  pk=after['tables'][name]['primaryKey'];assert pk or not rows,('keyless populated restore requires explicit oracle',name)
  keyed={tuple(r[k] for k in pk):r for r in target}
  for source in rows:
   r=safe(name,source);actual=keyed[tuple(r[k] for k in pk)]
   # Enumerated authority resets: unknown deltas are rejected.
   if name=='workspaces':r['ai_enabled']=0
   if name=='members':
    owner=r['email'].lower()=='qualification-owner@test.invalid';r['status']='active' if owner else 'historical';r['is_setup_owner']=int(owner)
    if owner:r['role']='owner'
   if name=='files':r['storage_key']=map_keys.get(r['storage_key'],r['storage_key'])
   if name=='public_exposures' and r['revoked_at'] is None:r['revoked_at']=actual['revoked_at'];assert r['revoked_at'];now_values.add(r['revoked_at'])
   if name=='notification_outbox':r['processed_at']=actual['processed_at'];assert r['processed_at'];now_values.add(r['processed_at'])
   if name=='intelligence_runs' and r['status'] in ['queued','running','paused','needs-review']:
    r.update(status='paused',lease_id=None,deadline_at=None,failure_reason='RESTORED_AUTHORITY_REQUIRED')
    inp=json.loads(r['input_json']);ai=json.loads(actual['input_json']);now=ai.pop('recoveryPausedAt');assert ai==inp and now;r['input_json']=actual['input_json'];now_values.add(now)
   if name=='intelligence_skill_versions':
    if r['state']=='active':r['state']='evaluated' if r['evaluation_id'] else 'draft'
    r['authority_id']=None
   if name=='federation_exports':
    r['archive_key']=None
    if r['state'] in ['running','queued']:r['state']='failed'
    orig=json.loads(r['report_json']);got=json.loads(actual['report_json']);rec=got.pop('recovery');assert got==orig;assert rec=={'archiveOmitted':True,'note':'Prior derived export archive omitted; create a new export from restored records.'};r['report_json']=actual['report_json']
   assert r==actual,('restore all-field mismatch',name,source,r,actual)
  checks.append({'table':name,'rows':len(rows),'columns':manifest['columns'][name]})
 assert len(now_values)<=1,('restore clocks diverged',now_values)
 for name in ['intelligence_agent_credentials','intelligence_grants']:
  assert not after['tables'][name]['rows'],('authority revived',name)
 return checks
mode,left,right=sys.argv[1:];a=load(left);b=load(right)
if mode!='export':assert b['integrity']=='ok' and not b['foreignKeyCheck']
if mode=='migration':
 checks=compare(a,b)
 for name,t in a['tables'].items():
  oldcols={c['name'] for c in t['columns']};newcols={c['name'] for c in b['tables'][name]['columns']}-oldcols
  for r in b['tables'][name]['rows']:
   for col in newcols:
    expected=None
    if (name,col)==('knowledge_decisions','accepted_revision_id'):
     candidates=sorted([x for x in a['tables']['intelligence_revisions']['rows'] if x['entity_kind']=='decision-acceptance' and x['entity_id']==r['id']],key=lambda x:(x['created_at'],x['id']));expected=candidates[0]['id'] if candidates else None
    assert r[col]==expected,('undocumented added-column value',name,col,r[col],expected)

elif mode=='equivalent':
 def projection(name,e,v):
  if name=='d1_migrations':
   e=[{k:x for k,x in r.items() if k!='applied_at'} for r in e];v=[{k:x for k,x in r.items() if k!='applied_at'} for r in v]
  if name=='search_dirty':
   e=[{k:x for k,x in r.items() if k!='generation'} for r in e];v=[{k:x for k,x in r.items() if k!='generation'} for r in v]
  return e,v
 checks=compare(a,b,projection)
elif mode=='refusal':
 excluded={'portability_jobs','sessions','request_limits','magic_links','operation_receipts','core_write_guards','core_acl_epoch','content_media_cleanup'}
 a['tables']={k:v for k,v in a['tables'].items() if k not in excluded};checks=compare(a,b)
elif mode=='export':
 checks=[];snapshot=a['snapshot'];names=a['portableTables']
 assert len(names)==len(set(names)),('duplicate frozen portable table',names)
 assert set(names)==set(b['tables'])==set(b['columns']),('exact frozen canonical table inventory',names,list(b['tables']),list(b['columns']))
 assert snapshot['integrity']=='ok' and not snapshot['foreignKeyCheck']
 for name in names:
  before=snapshot['tables'][name];columns=[c['name'] for c in before['columns']]
  assert columns==b['columns'][name],('exact canonical column inventory',name,columns,b['columns'][name])
  rows=b['tables'][name];expected=[]
  for row in before['rows']:
   assert set(row)==set(columns),('snapshot incomplete fields',name)
   r=row.copy()
   for col in ['credential_ciphertext','token_digest','token_hash','client_secret','api_key','secret']:
    if col in r:r[col]=None
   if name=='intelligence_runs' and r.get('agent_credential_id'):raise AssertionError('Credential-carrying export needs explicitly reviewed transform')
   if name in ['chat_connections','federation_connections'] and rows:raise AssertionError('Connection export needs explicitly reviewed transform')
   if name=='federation_exports' and r['id']==a['exportId']:
    # The archive serializes this one operation while running. Completion then
    # writes its archive key/counts/clock in the same final journal transaction.
    journals=[j for j in snapshot['tables']['portability_jobs']['rows'] if j['id']==a['exportId']]
    assert len(journals)==1;job=journals[0]
    assert job['kind']=='export' and job['state']=='completed' and job['export_id']==a['exportId']
    assert r['state']=='completed' and r['archive_key']=='federation/exports/'+a['exportId']+'/workspace.zip'
    assert r['updated_at']==job['completed_at']==job['updated_at']
    counts={n:len(b['tables'][n]) for n in names}
    assert json.loads(r['counts_json'])==json.loads(job['counts_json'])==counts
    r.update(state='running',archive_key=None,counts_json='{}',updated_at=job['started_at'])
   expected.append(r)
  for row in rows:assert set(row)==set(columns),('archive incomplete or unexpected fields',name,row)
  assert collections.Counter(map(canon,expected))==collections.Counter(map(canon,rows)),('export exact all-field multiset mismatch',name,expected,rows)
  checks.append({'table':name,'rows':len(expected),'columns':columns})
elif mode=='restore':checks=restore(a,b)
else:raise ValueError(mode)
print(json.dumps({'passed':True,'mode':mode,'checks':checks}))
