import subprocess,tempfile,pathlib,json,copy
oracle=pathlib.Path(__file__).with_name('oracle.py')
def table(rows,pk):return {'columns':[{'name':k} for k in rows[0]],'rows':rows,'primaryKey':pk}
base={'integrity':'ok','foreignKeyCheck':[],'tables':{'composite':table([{'a':'same','b':'one','v':11},{'a':'same','b':'two','v':22}],['a','b']),'keyless':table([{'a':1,'v':'duplicate'},{'a':1,'v':'duplicate'}],[])}}
with tempfile.TemporaryDirectory() as tmp:
 left=pathlib.Path(tmp)/'left.json';right=pathlib.Path(tmp)/'right.json';left.write_text(json.dumps(base))
 def run(value,expect,mode='migration'):
  right.write_text(json.dumps(value));r=subprocess.run(['python3',str(oracle),mode,str(left),str(right)],capture_output=True,text=True);assert (r.returncode==0)==expect,(r.returncode,r.stdout,r.stderr)
 run(base,True)
 lost=copy.deepcopy(base);lost['tables']['composite']['rows'].pop();run(lost,False)
 changed=copy.deepcopy(base);changed['tables']['composite']['rows'][1]['v']=11;run(changed,False)
 duplicate=copy.deepcopy(base);duplicate['tables']['keyless']['rows'].pop();run(duplicate,False)
 # Complete frozen canonical inventory must include even empty tables.
 reference={'snapshot':base,'portableTables':['composite','keyless'],'exportId':None}
 left.write_text(json.dumps(reference))
 manifest={'tables':{n:t['rows'] for n,t in base['tables'].items()},'columns':{n:[c['name'] for c in t['columns']] for n,t in base['tables'].items()}}
 run(manifest,True,'export')
 missing=copy.deepcopy(manifest);del missing['tables']['composite'];del missing['columns']['composite'];run(missing,False,'export')
 spurious=copy.deepcopy(manifest);spurious['tables']['composite'].append({'a':'new','b':'injected','v':99});run(spurious,False,'export')
 columns=copy.deepcopy(manifest);columns['columns']['composite'].pop();run(columns,False,'export')
 changed=copy.deepcopy(manifest);changed['tables']['composite'][1]['v']=99;run(changed,False,'export')
 # The sole current-export journal delta has independent positive/negative checks.
 completed={'id':'export-1','state':'completed','archive_key':'federation/exports/export-1/workspace.zip','counts_json':'{"federation_exports":1}','updated_at':'completed','actor_id':'owner','report_json':'{}'}
 running=dict(completed,state='running',archive_key=None,counts_json='{}',updated_at='started')
 journal={'id':'export-1','export_id':'export-1','kind':'export','state':'completed','started_at':'started','updated_at':'completed','completed_at':'completed','counts_json':'{"federation_exports":1}'}
 snap={'integrity':'ok','foreignKeyCheck':[],'tables':{'federation_exports':table([completed],['id']),'portability_jobs':table([journal],['id'])}}
 left.write_text(json.dumps({'snapshot':snap,'portableTables':['federation_exports'],'exportId':'export-1'}))
 exported={'tables':{'federation_exports':[running]},'columns':{'federation_exports':list(running)}}
 run(exported,True,'export')
 changed=copy.deepcopy(exported);changed['tables']['federation_exports'][0]['actor_id']='injected-owner';run(changed,False,'export')
 extra=copy.deepcopy(exported);extra['tables']['federation_exports'].append(dict(running,id='injected-export'));run(extra,False,'export')
 print(json.dumps({'passed':True,'checks':['Exact complete rows pass','Composite-key second-row loss fails','Non-key field alteration fails','Duplicate keyless row loss fails','Exact export inventory and all fields pass','Missing canonical export table fails','Spurious export content row fails','Lost export column fails','Changed export field fails','Precisely journalled current export delta passes','Unapproved current-export field change fails','Extra current-export row fails']}))
