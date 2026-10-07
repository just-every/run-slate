import sys,zipfile,json,hashlib
archive,out,invalid=sys.argv[1:]
with zipfile.ZipFile(archive) as z:
 entries={n:z.read(n) for n in z.namelist()};manifest=json.loads(entries['manifest.json'])
 for b in manifest['blobs']:assert len(entries[b['entry']])==b['size'] and hashlib.sha256(entries[b['entry']]).hexdigest()==b['hash']
 assert any(b['hash']=='567df51c3386921b21b6a3af2af8ba0bbcc2f9e5c304b7dece667c4873f3693e' for b in manifest['blobs'])
 with open(out,'w') as f:json.dump(manifest,f,indent=2)
 # Deliberately invalid sacrificial copy; authentic current.zip remains unchanged.
 manifest['columns']['pages'].append('qualification_unknown_column')
 data=json.dumps(manifest,separators=(',',':'),ensure_ascii=False).encode();entries['manifest.json']=data
 entries['integrity.json']=json.dumps({'manifestHash':hashlib.sha256(json.dumps(manifest,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()},separators=(',',':')).encode()
 with zipfile.ZipFile(invalid,'w') as z:
  for n,data in entries.items():z.writestr(n,data)
